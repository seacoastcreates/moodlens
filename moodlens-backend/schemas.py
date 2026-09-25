# moodlens-backend/schemas.py
from typing import List, Optional
from pydantic import BaseModel

class Score(BaseModel):
    label: str
    score: float

class HistoryCreate(BaseModel):
    # user_id is intentionally absent here - it's derived from the verified
    # bearer token (see main.require_user), never taken from client input.
    mode: str
    text: Optional[str] = None
    file_url: Optional[str] = None
    top_label: str
    scores: List[Score]

class HistoryOut(BaseModel):
    id: int
    user_id: str
    mode: str
    text: Optional[str] = None
    file_url: Optional[str] = None
    top_label: str
    scores: List[Score]
    created_at: str
