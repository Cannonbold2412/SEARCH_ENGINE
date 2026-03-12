"""Shared utilities used across the API."""

import json
from typing import Any

from src.core import EMBEDDING_DIM


# ---------------------------------------------------------------------------
# JSON extraction from LLM responses
# ---------------------------------------------------------------------------

def extract_json_from_llm_response(raw: str) -> str:
    """
    Strip markdown code fences and find the first valid JSON object or array
    in an LLM response string.

    Handles:
    - Bare JSON (no fences)
    - ```json ... ``` fences
    - LLM preamble text before the JSON
    - Truncated JSON (brace-counting fallback)

    Returns the raw JSON string (not parsed). Raises ``ValueError`` if no
    valid JSON is found.
    """
    text = (raw or "").strip()

    # Remove code fences if present
    if text.startswith("```"):
        lines = text.split("\n")
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines).strip()

    # Try each JSON start character
    for start_char in ("{", "["):
        start_idx = text.find(start_char)
        if start_idx == -1:
            continue

        candidate = text[start_idx:]

        # Fast path: the substring from the first brace is already valid JSON
        try:
            json.loads(candidate)
            return candidate
        except json.JSONDecodeError:
            pass

        # Slow path: walk characters counting depth to find matching close brace
        close_char = "}" if start_char == "{" else "]"
        depth = 0
        for i, char in enumerate(candidate):
            if char == start_char:
                depth += 1
            elif char == close_char:
                depth -= 1
                if depth == 0:
                    substring = candidate[: i + 1]
                    try:
                        json.loads(substring)
                        return substring
                    except json.JSONDecodeError:
                        break  # give up on this start character

    raise ValueError(f"No valid JSON found in LLM response (preview: {text[:120]!r})")


def parse_llm_json(raw: str) -> Any:
    """
    Extract and parse JSON from an LLM response in one step.

    Combines ``extract_json_from_llm_response`` with ``json.loads``.
    Raises ``ValueError`` if no JSON is found, ``json.JSONDecodeError`` if
    the extracted text is not valid JSON.
    """
    return json.loads(extract_json_from_llm_response(raw))


# ---------------------------------------------------------------------------
# Embedding helpers
# ---------------------------------------------------------------------------

def normalize_embedding(vec: list[float], dim: int = EMBEDDING_DIM) -> list[float]:
    """Truncate or zero-pad *vec* to exactly *dim* dimensions for DB storage."""
    if len(vec) < dim:
        return vec + [0.0] * (dim - len(vec))
    return vec[:dim]
