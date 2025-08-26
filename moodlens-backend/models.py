# moodlens-backend/models.py
from sqlalchemy import Column, Integer, String, Text, DateTime
from sqlalchemy.sql import func
from database import Base

class HistoryEntry(Base):
    __tablename__ = "history_entries"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String(128), index=True, nullable=False)   # device/user identifier
    mode = Column(String(16), nullable=False)                    # 'text'|'voice'
    text = Column(Text, nullable=True)
    file_url = Column(Text, nullable=True)                       # remote URL for audio if uploaded
    top_label = Column(String(128), nullable=False)
    scores_json = Column(Text, nullable=False)                   # store JSON string of scores
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
