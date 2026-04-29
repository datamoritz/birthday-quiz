from fastapi import Header, HTTPException, status

from .config import get_settings
from .db import connect


def require_admin(authorization: str | None = Header(default=None)) -> None:
    expected = f"Bearer {get_settings().admin_token}"
    if authorization != expected:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid admin token")


def require_participant(authorization: str | None = Header(default=None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing participant token")

    token = authorization.removeprefix("Bearer ").strip()
    with connect() as conn:
        row = conn.execute(
            """
            SELECT p.*, t.name AS team_name, t.code AS team_code
            FROM participants p
            JOIN teams t ON t.id = p.team_id
            WHERE p.session_token = ?
            """,
            (token,),
        ).fetchone()

    if not row:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid participant token")
    return dict(row)
