"""Experience card pipeline, embedding, clarify, CRUD, and form-merge helpers."""

from .crud import (
    apply_card_patch,
    apply_child_patch,
    experience_card_service,
)
from .embedding import embed_experience_cards
from .errors import PipelineError, PipelineStage
from .form_merge import (
    PARENT_MERGE_KEYS,
    merged_form,
    parent_merged_to_patch,
)
from .pipeline import (
    DEFAULT_MAX_CHILD_CLARIFY,
    DEFAULT_MAX_PARENT_CLARIFY,
    clarify_experience_interactive,
    detect_experiences,
    fill_missing_fields_from_text,
    rewrite_raw_text,
    run_draft_single,
)

__all__ = [
    # CRUD
    "experience_card_service",
    "apply_card_patch",
    "apply_child_patch",
    # Embedding
    "embed_experience_cards",
    # Pipeline
    "rewrite_raw_text",
    "run_draft_single",
    "fill_missing_fields_from_text",
    "clarify_experience_interactive",
    "detect_experiences",
    "DEFAULT_MAX_PARENT_CLARIFY",
    "DEFAULT_MAX_CHILD_CLARIFY",
    # Errors
    "PipelineError",
    "PipelineStage",
    # Form merge
    "merged_form",
    "parent_merged_to_patch",
    "PARENT_MERGE_KEYS",
]
