from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.routers.dependencies import get_current_user
from app.models.user import User
from app.schemas.request import (
    RequestSend,
    RequestAction,
    ConnectionOut,
    ConnectionListResponse,
)
from app.services.request_service import (
    send_connection_request,
    accept_connection_request,
    reject_connection_request,
    cancel_connection_request,
    list_connections,
)

router = APIRouter(prefix="/requests", tags=["Connection Requests"])


@router.post(
    "/send",
    response_model=ConnectionOut,
    status_code=201,
    summary="Send a connection request to another user",
)
def send_request(
    data: RequestSend,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ConnectionOut:
    conn = send_connection_request(db, current_user, data.receiver_id)
    return ConnectionOut.model_validate(conn)


@router.post(
    "/accept",
    response_model=ConnectionOut,
    summary="Accept a pending connection request",
)
def accept_request(
    data: RequestAction,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ConnectionOut:
    conn = accept_connection_request(db, current_user, data.connection_id)
    return ConnectionOut.model_validate(conn)


@router.post(
    "/reject",
    response_model=ConnectionOut,
    summary="Reject a pending connection request",
)
def reject_request(
    data: RequestAction,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ConnectionOut:
    conn = reject_connection_request(db, current_user, data.connection_id)
    return ConnectionOut.model_validate(conn)


@router.delete(
    "/{connection_id}",
    status_code=204,
    summary="Cancel an outgoing pending connection request",
)
def cancel_request(
    connection_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    """
    Cancel a pending connection request that the current user sent.

    Authorization:
    - Current user must be the **sender** of the request.
    - The request must have status **pending** (accepted connections are not affected).
    - Returns 204 No Content on success.
    - Returns 403 if the current user is not the sender.
    - Returns 400 if the request is not pending (already accepted/rejected).
    - Returns 404 if the connection does not exist.
    """
    cancel_connection_request(db, current_user, connection_id)


@router.get(
    "",
    response_model=ConnectionListResponse,
    summary="List all connection requests for the current user",
)
def get_requests(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ConnectionListResponse:
    return list_connections(db, current_user)
