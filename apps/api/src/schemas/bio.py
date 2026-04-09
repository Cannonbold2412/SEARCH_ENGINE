import re

from pydantic import BaseModel, ConfigDict, field_validator

PHONE_ALLOWED_CHARS_REGEX = re.compile(r"^\+?[0-9().\-\s]+$")


class PastCompanyItem(BaseModel):
    company_name: str
    role: str | None = None
    years: str | None = None


class BioResponse(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    date_of_birth: str | None = None
    current_city: str | None = None
    profile_photo_url: str | None = None
    school: str | None = None
    college: str | None = None
    current_company: str | None = None
    past_companies: list[PastCompanyItem] | None = None
    email: str | None = None  # from Person, for display
    linkedin_url: str | None = None  # from PersonProfile
    phone: str | None = None  # from PersonProfile
    complete: bool = False

    model_config = ConfigDict(from_attributes=True)


class BioCreateUpdate(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    date_of_birth: str | None = None
    current_city: str | None = None
    profile_photo_url: str | None = None
    school: str | None = None
    college: str | None = None
    current_company: str | None = None
    past_companies: list[PastCompanyItem] | None = None
    email: str | None = None  # sync to Person.email if provided
    linkedin_url: str | None = None  # sync to PersonProfile
    phone: str | None = None  # sync to PersonProfile
    language: str = "en"  # BCP-47 language code; translate non-English to English

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = (value or "").strip()
        if not normalized:
            return None
        if not PHONE_ALLOWED_CHARS_REGEX.fullmatch(normalized):
            raise ValueError("Phone number contains invalid characters")
        digits = re.sub(r"\D", "", normalized)
        if len(digits) < 10 or len(digits) > 15:
            raise ValueError("Enter a valid phone number (10-15 digits)")
        return normalized
