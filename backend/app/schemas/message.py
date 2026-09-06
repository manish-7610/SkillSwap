from datetime import datetime
from typing import Literal
from pydantic import BaseModel, Field, model_validator


# ── Input schemas ─────────────────────────────────────────────────────────────

class MessageCreate(BaseModel):
    """Payload for sending a new message."""
    receiver_id: int
    content: str = Field(
        ...,
        min_length=1,
        max_length=2000,
        strip_whitespace=True,
        description="Message body. Min 1 char, max 2000 chars.",
    )


class MessageDeleteRequest(BaseModel):
    """
    Payload for DELETE /api/v1/messages/{message_id}.

    mode:
      "for_me"       — hide the message only for the requesting user.
      "for_everyone" — hide the message for both participants (sender only).
    """
    mode: Literal["for_me", "for_everyone"] = Field(
        ...,
        description='Either "for_me" or "for_everyone".',
    )


# ── Output schemas ────────────────────────────────────────────────────────────

class MessageOut(BaseModel):
    """
    Single message as returned by the API.

    deleted_for_everyone:
        True ONLY when the sender explicitly chose "Delete for everyone".
        In that case `content` is replaced with None.

        Important: two independent "Delete for me" actions (one from sender,
        one from receiver) do NOT set this flag.  In that case both
        deleted_for_sender and deleted_for_receiver will be True, but the
        row is simply excluded from each user's history — no placeholder.

    content:
        Optional — None only when deleted_for_everyone is True.
    """
    id: int
    sender_id: int
    receiver_id: int
    content: str | None        # None when deleted_for_everyone=True
    is_read: bool
    deleted_for_everyone: bool  # sourced directly from the DB column
    created_at: datetime

    model_config = {"from_attributes": True}

    @model_validator(mode="before")
    @classmethod
    def _redact_if_deleted_for_everyone(cls, data: object) -> object:
        """
        If the message was deleted for everyone, replace content with None.
        Reads the explicit deleted_for_everyone column — does NOT infer from
        the two per-user flags (that was the original bug).
        """
        # ── ORM instance ──────────────────────────────────────────────────────
        if hasattr(data, "deleted_for_everyone"):
            dfe = bool(getattr(data, "deleted_for_everyone", False))
            return {
                "id":                   data.id,
                "sender_id":            data.sender_id,
                "receiver_id":          data.receiver_id,
                "content":              None if dfe else data.content,
                "is_read":              data.is_read,
                "deleted_for_everyone": dfe,
                "created_at":           data.created_at,
            }

        # ── Plain dict (e.g. reconstructed from WS frame) ────────────────────
        if isinstance(data, dict):
            dfe = bool(data.get("deleted_for_everyone", False))
            result = dict(data)
            result["content"]              = None if dfe else data.get("content")
            result["deleted_for_everyone"] = dfe
            return result

        return data


class ConversationHistoryResponse(BaseModel):
    """Paginated list of messages between two users."""
    messages: list[MessageOut]
    has_more: bool


# ── Conversation summary (inbox view) ────────────────────────────────────────

class LastMessageSnippet(BaseModel):
    """Minimal representation of the most recent message in a conversation."""
    content: str
    created_at: datetime
    sender_id: int

    model_config = {"from_attributes": True}


class ConversationPartner(BaseModel):
    """Public profile of the other participant in a conversation."""
    id: int
    full_name: str
    avatar: str | None

    model_config = {"from_attributes": True}


class ConversationSummary(BaseModel):
    """One row in the user's conversation inbox."""
    other_user: ConversationPartner
    last_message: LastMessageSnippet
    unread_count: int


class ConversationSummaryResponse(BaseModel):
    """Full inbox: list of all active conversations for the current user."""
    conversations: list[ConversationSummary]
