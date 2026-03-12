"""Experience card pipeline, embedding, clarify, CRUD, and form-merge helpers."""

from .crud import (
    experience_card_service,
    apply_card_patch,
    apply_child_patch,
)
from .embedding import embed_experience_cards
from .pipeline import (
    rewrite_raw_text,
    run_draft_single,
    fill_missing_fields_from_text,
    clarify_experience_interactive,
    detect_experiences,
    DEFAULT_MAX_PARENT_CLARIFY,
    DEFAULT_MAX_CHILD_CLARIFY,
)
from .errors import PipelineError, PipelineStage
from .form_merge import (
    merged_form,
    parent_merged_to_patch,
    child_merged_to_patch,
    PARENT_MERGE_KEYS,
    CHILD_MERGE_KEYS,
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
    "child_merged_to_patch",
    "PARENT_MERGE_KEYS",
    "CHILD_MERGE_KEYS",
]
