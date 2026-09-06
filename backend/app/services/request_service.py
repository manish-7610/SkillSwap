from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from app.crud.crud_connection import (
    get_connection_by_id,
    create_connection,
    update_connection_status,
    get_connections_for_user,
)
from app.crud.crud_user import get_user_by_id
from app.models.connection import Connection, ConnectionStatus
from app.models.user import User
from app.schemas.request import ConnectionListResponse, ConnectionOut
import logging

logger = logging.getLogger("skillswap")


def send_connection_request(
    db: Session, sender: User, receiver_id: int
) -> Connection:
    if sender.id == receiver_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot send a connection request to yourself.",
        )
    receiver = get_user_by_id(db, receiver_id)
    if not receiver:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    return create_connection(db, sender.id, receiver_id)


def accept_connection_request(
    db: Session, current_user: User, connection_id: int
) -> Connection:
    conn = _get_pending_for_receiver(db, current_user.id, connection_id)
    return update_connection_status(db, conn, ConnectionStatus.accepted)


def reject_connection_request(
    db: Session, current_user: User, connection_id: int
) -> Connection:
    conn = _get_pending_for_receiver(db, current_user.id, connection_id)
    return update_connection_status(db, conn, ConnectionStatus.rejected)


def cancel_connection_request(
    db: Session, current_user: User, connection_id: int
) -> None:
    """
    Cancel an outgoing pending connection request.

    Authorization rules enforced here (not just in the frontend):
      1. The connection must exist.
      2. The current user must be the SENDER (sender_id == current_user.id).
      3. The connection status must be 'pending' — accepted connections cannot
         be cancelled via this endpoint.
    """
    conn = get_connection_by_id(db, connection_id)
    if not conn:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Connection not found."
        )
    # Rule 2 & 3: only the original sender can cancel, and only while pending.
    if conn.sender_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the sender of the request can cancel it.",
        )
    if conn.status != ConnectionStatus.pending:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot cancel a request that is already '{conn.status}'.",
        )
    db.delete(conn)
    db.commit()
    logger.info(
        "Connection request %d cancelled by user %d", connection_id, current_user.id
    )


def list_connections(db: Session, user: User) -> ConnectionListResponse:
    conns = get_connections_for_user(db, user.id)
    out = [ConnectionOut.model_validate(c) for c in conns]
    return ConnectionListResponse(total=len(out), connections=out)


def _get_pending_for_receiver(
    db: Session, user_id: int, connection_id: int
) -> Connection:
    conn = get_connection_by_id(db, connection_id)
    if not conn:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Connection not found."
        )
    if conn.receiver_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not the receiver of this request.",
        )
    if conn.status != ConnectionStatus.pending:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Request is already '{conn.status}'.",
        )
    return conn
