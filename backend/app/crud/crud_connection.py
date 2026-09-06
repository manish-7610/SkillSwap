from sqlalchemy.orm import Session
from sqlalchemy import select, or_
from fastapi import HTTPException, status
from app.models.connection import Connection, ConnectionStatus


def get_connection_by_id(db: Session, conn_id: int) -> Connection | None:
    return db.get(Connection, conn_id)


def get_connection_between(db: Session, sender_id: int, receiver_id: int) -> Connection | None:
    stmt = select(Connection).where(
        or_(
            (Connection.sender_id == sender_id) & (Connection.receiver_id == receiver_id),
            (Connection.sender_id == receiver_id) & (Connection.receiver_id == sender_id),
        )
    )
    return db.scalar(stmt)


def get_connections_for_user(db: Session, user_id: int) -> list[Connection]:
    stmt = select(Connection).where(
        or_(Connection.sender_id == user_id, Connection.receiver_id == user_id)
    )
    return list(db.scalars(stmt).all())


def get_pending_received(db: Session, user_id: int) -> list[Connection]:
    stmt = select(Connection).where(
        Connection.receiver_id == user_id,
        Connection.status == ConnectionStatus.pending,
    )
    return list(db.scalars(stmt).all())


def get_pending_sent(db: Session, user_id: int) -> list[Connection]:
    stmt = select(Connection).where(
        Connection.sender_id == user_id,
        Connection.status == ConnectionStatus.pending,
    )
    return list(db.scalars(stmt).all())


def get_accepted_connections(db: Session, user_id: int) -> list[Connection]:
    stmt = select(Connection).where(
        or_(Connection.sender_id == user_id, Connection.receiver_id == user_id),
        Connection.status == ConnectionStatus.accepted,
    )
    return list(db.scalars(stmt).all())


def create_connection(db: Session, sender_id: int, receiver_id: int) -> Connection:
    existing = get_connection_between(db, sender_id, receiver_id)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A connection request already exists between these users.",
        )
    conn = Connection(
        sender_id=sender_id,
        receiver_id=receiver_id,
        status=ConnectionStatus.pending,
    )
    db.add(conn)
    db.commit()
    db.refresh(conn)
    return conn


def update_connection_status(
    db: Session, conn: Connection, new_status: ConnectionStatus
) -> Connection:
    conn.status = new_status
    db.commit()
    db.refresh(conn)
    return conn
