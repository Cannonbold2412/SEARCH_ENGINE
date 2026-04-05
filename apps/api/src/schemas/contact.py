from pydantic import BaseModel


class ContactDetailsResponse(BaseModel):
    email_visible: bool
    email: str | None = None  # actual email when unlocked and email_visible
    phone: str | None = None
    linkedin_url: str | None = None
    other: str | None = None


class PatchContactRequest(BaseModel):
    email_visible: bool | None = None
    phone: str | None = None
    linkedin_url: str | None = None
    other: str | None = None
