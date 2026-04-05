from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict


class PersonResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    display_name: str | None = None
    created_at: datetime | None = None


class PatchProfileRequest(BaseModel):
    display_name: str | None = None


class VisibilitySettingsResponse(BaseModel):
    """Visibility fields from PersonProfile (person_profiles)."""

    open_to_work: bool
    work_preferred_locations: list[str]
    work_preferred_salary_min: Decimal | None = None  # minimum salary needed (₹/year)
    open_to_contact: bool
    preferred_language: str


class PatchVisibilityRequest(BaseModel):
    """Optional fields for patching visibility on PersonProfile."""

    open_to_work: bool | None = None
    work_preferred_locations: list[str] | None = None
    work_preferred_salary_min: Decimal | None = None
    open_to_contact: bool | None = None
    preferred_language: str | None = None
