from datetime import datetime
from sqlalchemy import Column, String, Integer, DateTime
from ..base import Base


class InviteCode(Base):
    __tablename__ = "invite_codes"

    code = Column(String(255), primary_key=True)
    max_uses = Column(Integer, default=0)
    used_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    @property
    def is_available(self) -> bool:
        return self.max_uses <= 0 or self.used_count < self.max_uses
