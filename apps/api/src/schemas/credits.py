from datetime import datetime

from pydantic import BaseModel


class CreditsResponse(BaseModel):
    balance: int


class PurchaseCreditsRequest(BaseModel):
    credits: int


class LedgerEntryResponse(BaseModel):
    id: str
    amount: int
    reason: str
    reference_type: str | None = None
    reference_id: str | None = None
    balance_after: int | None = None
    created_at: datetime
