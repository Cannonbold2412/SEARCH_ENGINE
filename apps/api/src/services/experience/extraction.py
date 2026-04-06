"""LLM extraction and draft-pipeline helpers for experience cards."""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import HTTPException, status
from pydantic import BaseModel, Field, ValidationError, field_validator, model_validator
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain import ALLOWED_CHILD_TYPES
from src.prompts.experience_card import (
    PROMPT_EXTRACT_SINGLE_CARDS,
    fill_prompt,
)
from src.providers import ChatServiceError, get_chat_provider
from src.utils import extract_json_from_llm_response as _extract_json_from_text

from .child_value import dedupe_child_items, merge_child_items, normalize_child_items
from .errors import PipelineError, PipelineStage
from .persistence import persist_families, serialize_card_for_response
from .rewrite import rewrite_raw_text

logger = logging.getLogger(__name__)

_LLM_TOKENS_EXTRACT = 8192


def _normalize_roles(raw: Any) -> list[dict]:
    if not isinstance(raw, list):
        return []
    out: list[dict] = []
    for item in raw:
        if isinstance(item, dict):
            label = str(item.get("label") or item.get("title") or "").strip()
            seniority = str(item.get("seniority") or "").strip() or None
            if label or seniority:
                out.append({"label": label or None, "seniority": seniority})
        elif isinstance(item, str) and item.strip():
            out.append({"label": item.strip(), "seniority": None})
    return out


def _normalize_entities(raw: Any) -> list[dict]:
    if not isinstance(raw, list):
        return []
    out: list[dict] = []
    for item in raw:
        if isinstance(item, dict):
            name = str(item.get("name") or item.get("label") or item.get("text") or "").strip()
            etype = str(item.get("type") or "organization").strip().lower()
            if name:
                out.append({"type": etype or "organization", "name": name})
        elif isinstance(item, str) and item.strip():
            out.append({"type": "organization", "name": item.strip()})
    return out


def _normalize_event_like_list(raw: Any) -> list[dict]:
    if not isinstance(raw, list):
        return []
    out: list[dict] = []
    for item in raw:
        if isinstance(item, dict):
            out.append(item)
        elif isinstance(item, str) and item.strip():
            out.append({"text": item.strip()})
    return out


class TimeInfo(BaseModel):
    text: str | None = None
    start: str | None = None
    end: str | None = None
    ongoing: bool | None = None


class LocationInfo(BaseModel):
    text: str | None = None
    city: str | None = None
    country: str | None = None
    is_remote: bool | None = None


class RoleInfo(BaseModel):
    label: str | None = None
    seniority: str | None = None


class EntityInfo(BaseModel):
    type: str
    name: str


class Card(BaseModel):
    id: str | None = None
    headline: str | None = None
    title: str | None = None
    label: str | None = None
    summary: str | None = None
    raw_text: str | None = None
    time: TimeInfo | str | None = None
    location: LocationInfo | str | None = None
    time_text: str | None = None
    start_date: str | None = None
    end_date: str | None = None
    is_current: bool | None = None
    city: str | None = None
    country: str | None = None
    roles: list[RoleInfo] = Field(default_factory=list)
    entities: list[EntityInfo] = Field(default_factory=list)
    actions: list[dict] = Field(default_factory=list)
    outcomes: list[dict] = Field(default_factory=list)
    evidence: list[dict] = Field(default_factory=list)
    tooling: Any | None = None
    company: str | None = None
    company_name: str | None = None
    organization: str | None = None
    team: str | None = None
    normalized_role: str | None = None
    seniority_level: str | None = None
    domain: str | None = None
    sub_domain: str | None = None
    company_type: str | None = None
    employment_type: str | None = None
    intent: str | None = None
    intent_primary: str | None = None
    intent_secondary: list[str] = Field(default_factory=list)
    confidence_score: float | None = None
    person_id: str | None = None
    created_by: str | None = None
    created_at: str | None = None
    updated_at: str | None = None
    parent_id: str | None = None
    depth: int | None = None
    relation_type: str | None = None
    child_type: str | None = None
    items: list[dict] = Field(default_factory=list)

    @model_validator(mode="before")
    @classmethod
    def normalize_prompt_style_fields(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data

        data = dict(data)
        if not data.get("intent") and data.get("intent_primary"):
            data["intent"] = data.get("intent_primary")
        if not data.get("company") and data.get("company_name"):
            data["company"] = data.get("company_name")
        if not data.get("roles") and data.get("normalized_role"):
            data["roles"] = [
                {
                    "label": data.get("normalized_role"),
                    "seniority": data.get("seniority_level"),
                }
            ]
        if not data.get("time"):
            start = data.get("start_date")
            end = data.get("end_date")
            text = data.get("time_text")
            ongoing = data.get("is_current")
            if start or end or text or isinstance(ongoing, bool):
                data["time"] = {
                    "start": start,
                    "end": end,
                    "text": text,
                    "ongoing": ongoing if isinstance(ongoing, bool) else None,
                }
        if data.get("intent_secondary") is None:
            data["intent_secondary"] = []
        elif isinstance(data.get("intent_secondary"), str):
            data["intent_secondary"] = [
                s.strip() for s in data["intent_secondary"].split(",") if s.strip()
            ]
        if data.get("roles") is not None:
            data["roles"] = _normalize_roles(data.get("roles"))
        if data.get("entities") is not None:
            data["entities"] = _normalize_entities(data.get("entities"))
        for key in ("actions", "outcomes", "evidence"):
            if data.get(key) is not None:
                data[key] = _normalize_event_like_list(data.get(key))
        value = data.get("value")
        if isinstance(value, dict) and isinstance(value.get("items"), list):
            data["items"] = value.get("items", [])
        return data

    @field_validator("time", mode="before")
    @classmethod
    def normalize_time(cls, v: Any) -> Any:
        if isinstance(v, str):
            return {"text": v}
        return v

    @field_validator("location", mode="before")
    @classmethod
    def normalize_location(cls, v: Any) -> Any:
        if isinstance(v, str):
            return {"text": v}
        return v


class Family(BaseModel):
    parent: Card
    children: list[Card] = Field(default_factory=list)


def _is_time_empty(t: Any) -> bool:
    if t is None:
        return True
    if isinstance(t, str):
        return not (t or "").strip()
    if isinstance(t, dict):
        return not ((t.get("text") or "").strip() or t.get("start") or t.get("end"))
    return True


def _is_location_empty(loc: Any) -> bool:
    if loc is None:
        return True
    if isinstance(loc, str):
        return not (loc or "").strip()
    if isinstance(loc, dict):
        return not ((loc.get("text") or "").strip() or loc.get("city") or loc.get("country"))
    return True


def _get_parent_time(parent: dict) -> dict | None:
    t = parent.get("time")
    if isinstance(t, dict) and (t.get("text") or t.get("start") or t.get("end")):
        return t
    start = parent.get("start_date")
    end = parent.get("end_date")
    text = parent.get("time_text")
    ongoing = parent.get("is_current")
    if start or end or text or isinstance(ongoing, bool):
        return {"start": start, "end": end, "text": text, "ongoing": ongoing}
    return None


def _get_parent_location(parent: dict) -> Any:
    loc = parent.get("location")
    if loc is None:
        return None
    if isinstance(loc, str) and (loc or "").strip():
        return loc
    if isinstance(loc, dict) and (
        (loc.get("text") or "").strip() or loc.get("city") or loc.get("country")
    ):
        return loc
    return None


def _inherit_parent_context_into_children(
    parent_dict: dict | None, children_list: list[dict]
) -> list[dict]:
    if not parent_dict or not isinstance(parent_dict, dict) or not children_list:
        return children_list
    p_time = _get_parent_time(parent_dict)
    p_location = _get_parent_location(parent_dict)
    if not p_time and not p_location:
        return children_list
    result = []
    for child in children_list:
        if not isinstance(child, dict):
            result.append(child)
            continue
        c = dict(child)
        if p_time and _is_time_empty(c.get("time")):
            c["time"] = dict(p_time) if isinstance(p_time, dict) else p_time
            val = c.get("value")
            if isinstance(val, dict):
                val = dict(val)
                val["time"] = c["time"]
                c["value"] = val
        if p_location is not None and _is_location_empty(c.get("location")):
            loc = (
                p_location
                if isinstance(p_location, dict)
                else {"text": p_location}
                if isinstance(p_location, str)
                else p_location
            )
            c["location"] = loc
            val = c.get("value")
            if isinstance(val, dict):
                val = dict(val)
                val["location"] = c["location"]
                c["value"] = val
        result.append(c)
    return result


def _merge_duplicate_children(children: list[dict]) -> list[dict]:
    by_type: dict[str, dict] = {}
    for c in children:
        if not isinstance(c, dict):
            continue
        ct = (c.get("child_type") or c.get("relation_type") or "").strip() or "skills"
        if ct not in ALLOWED_CHILD_TYPES:
            ct = ALLOWED_CHILD_TYPES[0]
        c = dict(c)
        c["child_type"] = ct
        value = c.get("value") or {}
        if not isinstance(value, dict):
            value = {}
        existing = by_type.get(ct)
        if existing:
            existing_val = existing.get("value") or {}
            items_a = (
                existing_val.get("items") if isinstance(existing_val.get("items"), list) else []
            )
            items_b = value.get("items") if isinstance(value.get("items"), list) else []
            merged_items = merge_child_items(
                normalize_child_items(items_a) if items_a else [],
                normalize_child_items(items_b) if items_b else [],
            )
            merged_value = {
                "raw_text": existing_val.get("raw_text") or value.get("raw_text"),
                "items": merged_items,
            }
            c["value"] = merged_value
        else:
            r = (value.get("raw_text") or "").strip() or None
            c["value"] = {
                "raw_text": r,
                "items": dedupe_child_items(normalize_child_items(value.get("items") or [])),
            }
        by_type[ct] = c
    return list(by_type.values())


def _normalize_child_dict(child_dict: dict) -> dict:
    if not isinstance(child_dict, dict):
        return child_dict
    out = dict(child_dict)
    value = out.get("value") if isinstance(out.get("value"), dict) else None
    if value is not None:
        if not out.get("raw_text") and value.get("raw_text"):
            out["raw_text"] = value.get("raw_text")
        raw_items = value.get("items")
        if isinstance(raw_items, list):
            remapped = []
            for it in raw_items:
                if not isinstance(it, dict):
                    continue
                title = it.get("title") or it.get("subtitle") or it.get("label") or it.get("text")
                description = it.get("description") or it.get("sub_summary") or it.get("summary")
                if title:
                    remapped.append(
                        {
                            "title": str(title).strip(),
                            "description": str(description).strip() if description else None,
                        }
                    )
            value = dict(value)
            value["items"] = remapped
            out["value"] = value
            out["items"] = remapped
    items = out.get("items") or []
    first_title = (items[0].get("title") if items and isinstance(items[0], dict) else "") or ""
    label = out.get("label") or ""
    out["headline"] = first_title or label or ""
    out["title"] = out["headline"]
    return out


def parse_llm_response_to_families(response_text: str, stage: PipelineStage) -> list[Family]:
    if not response_text or not response_text.strip():
        raise PipelineError(
            stage, "LLM returned empty response. Service may be rate-limited or failed."
        )
    try:
        json_str = _extract_json_from_text(response_text)
        data = json.loads(json_str)
    except (ValueError, json.JSONDecodeError) as e:
        raise PipelineError(stage, f"LLM returned invalid JSON: {str(e)[:200]}", cause=e) from e

    family_dicts: list[dict] = []
    if isinstance(data, dict):
        if "families" in data and isinstance(data["families"], list):
            family_dicts = data["families"]
        elif "parents" in data and isinstance(data["parents"], list):
            family_dicts = data["parents"]
        elif "parent" in data:
            family_dicts = [data]
        else:
            raise PipelineError(
                stage,
                f"Unexpected response structure. Expected 'families', 'parents', or 'parent' key. Got: {list(data.keys())[:5]}",
            )
    elif isinstance(data, list):
        family_dicts = data
    else:
        raise PipelineError(stage, f"Expected JSON object or array, got {type(data).__name__}")

    validated_families: list[Family] = []
    for i, family_dict in enumerate(family_dicts):
        if not isinstance(family_dict, dict):
            logger.warning("Skipping non-dict family at index %s: %s", i, type(family_dict))
            continue
        if "parent" not in family_dict:
            logger.warning("Skipping family at index %s: missing 'parent' key", i)
            continue
        normalized_family_dict = dict(family_dict)
        raw_children = normalized_family_dict.get("children")
        if isinstance(raw_children, list):
            normalized = [_normalize_child_dict(c) for c in raw_children]
            normalized_family_dict["children"] = _merge_duplicate_children(normalized)
            parent_dict = normalized_family_dict.get("parent") or family_dict.get("parent")
            normalized_family_dict["children"] = _inherit_parent_context_into_children(
                parent_dict, normalized_family_dict["children"]
            )
        try:
            family = Family(**normalized_family_dict)
            validated_families.append(family)
        except ValidationError as e:
            logger.warning("Validation failed for family %s: %s", i, e)
            continue

    if not validated_families:
        raise PipelineError(
            stage,
            f"No valid families found in response. Parsed {len(family_dicts)} candidates, all failed validation.",
        )
    return validated_families


def inject_metadata_into_family(family: Family, person_id: str) -> Family:
    now_iso = datetime.now(UTC).isoformat()
    parent = family.parent
    if not parent.id:
        parent.id = str(uuid.uuid4())
    parent.person_id = person_id
    parent.created_by = person_id
    if not parent.created_at:
        parent.created_at = now_iso
    if not parent.updated_at:
        parent.updated_at = now_iso
    parent.parent_id = None
    parent.depth = 0
    parent.relation_type = None

    parent_id = parent.id
    for child in family.children:
        if not child.id:
            child.id = str(uuid.uuid4())
        child.person_id = person_id
        child.created_by = person_id
        child.parent_id = parent_id
        child.depth = 1
        if not child.created_at:
            child.created_at = now_iso
        if not child.updated_at:
            child.updated_at = now_iso
    return family


async def run_draft_single(
    db: AsyncSession,
    person_id: str,
    raw_text: str,
    experience_index: int,
    experience_count: int,
) -> list[dict]:
    raw_text_original = (raw_text or "").strip()
    if not raw_text_original:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="raw_text is required and cannot be empty",
        )
    idx = max(1, min(experience_index, experience_count or 1))
    total = max(1, experience_count)

    logger.info(
        "Starting single-experience pipeline person_id=%s, index=%s/%s", person_id, idx, total
    )

    raw_text_cleaned = await rewrite_raw_text(raw_text_original)
    chat = get_chat_provider()
    extract_prompt = fill_prompt(
        PROMPT_EXTRACT_SINGLE_CARDS,
        user_text=raw_text_cleaned,
        experience_index=idx,
        experience_count=total,
    )
    try:
        extract_response = await chat.chat(extract_prompt, max_tokens=_LLM_TOKENS_EXTRACT)
        extracted_families = await asyncio.to_thread(
            parse_llm_response_to_families,
            extract_response,
            PipelineStage.EXTRACT,
        )
    except (ChatServiceError, PipelineError):
        raise
    extracted_families = extracted_families[:1]
    for family in extracted_families:
        inject_metadata_into_family(family, person_id)

    parents, children = await persist_families(
        db,
        extracted_families,
        person_id=person_id,
    )

    children_by_parent_id: dict[str, list] = {}
    for c in children:
        children_by_parent_id.setdefault(c.parent_experience_id, []).append(c)
    card_families = [
        {
            "parent": serialize_card_for_response(parent),
            "children": [
                serialize_card_for_response(c) for c in children_by_parent_id.get(parent.id, [])
            ],
            # ORM objects passed through so callers can avoid re-querying the same rows.
            "_parent_orm": parent,
            "_children_orm": children_by_parent_id.get(parent.id, []),
        }
        for parent in parents
    ]
    return card_families
