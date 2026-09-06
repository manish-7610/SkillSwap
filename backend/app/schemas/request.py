from datetime import datetime
from pydantic import BaseModel
from app.models.connection import ConnectionStatus
from app.schemas.user import UserPublic


class RequestSend(BaseModel):
    receiver_id: int


class RequestAction(BaseModel):
    connection_id: int


class ConnectionOut(BaseModel):
    id: int
    sender_id: int
    receiver_id: int
    status: ConnectionStatus
    created_at: datetime
    sender: UserPublic
    receiver: UserPublic

    model_config = {"from_attributes": True}


class ConnectionListResponse(BaseModel):
    total: int
    connections: list[ConnectionOut]
