"""Editor authentication: username/password users and signed access tokens.

Mirrors the login handling of the IC server (``/repos/icserver``, ``src/app/am.py``):

* users live in a SQLite database (``username``, ``name``, bcrypt ``password``, ...);
* ``POST /token`` accepts an OAuth2 username/password login and returns a signed JWT
  access token (HS256, ``sub`` = username, expiring);
* the access token is used as a bearer token for the protected editor endpoints.

The story editor's static token (``LODEON_EDITOR_TOKEN``) keeps working through its own
login (``POST /api/auth/login``): it yields a signed, expiring session that is accepted
as a bearer token as well.
"""

from __future__ import annotations

import sqlite3
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from fastapi import HTTPException, status
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel

from .config import Settings, get_settings

ALGORITHM = "HS256"
DEFAULT_SECRET_KEY = "shmarql-dev-secret"
DEFAULT_ACCESS_TOKEN_EXPIRE_DAYS = 30

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

USERS_TABLE = """
CREATE TABLE IF NOT EXISTS users (
    username TEXT NOT NULL UNIQUE,
    name TEXT,
    password TEXT,
    activation_date TEXT
)
"""


class User(BaseModel):
    username: str
    name: str | None = None

    @property
    def is_authenticated(self) -> bool:
        return True

    @property
    def display_name(self) -> str:
        return self.username


class Token(BaseModel):
    access_token: str
    token_type: str


credentials_exception = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Could not validate credentials",
    headers={"WWW-Authenticate": "Bearer"},
)


# -- password handling -------------------------------------------------------------------------
def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


# -- user store ----------------------------------------------------------------------------------
def get_user_fromdb(
    username_in: str, db_path: Path
) -> tuple[str, str | None, str, str | None] | None:
    con = sqlite3.connect(db_path)
    try:
        return con.execute(
            "SELECT username, name, password, activation_date FROM users WHERE username = ?",
            (username_in,),
        ).fetchone()
    finally:
        con.close()


def authenticate_user(username_in: str, password_in: str, db_path: Path) -> User | None:
    user_record = get_user_fromdb(username_in, db_path)
    if not user_record:
        return None
    username, name, stored_password, activation_date = user_record
    if not verify_password(password_in, stored_password):
        return None
    return User(username=username, name=name)


def create_user(username: str, password: str, db_path: Path, name: str | None = None) -> User:
    """Create an editor user with a bcrypt-hashed password (admin setup helper)."""
    con = sqlite3.connect(db_path)
    try:
        con.execute(USERS_TABLE)
        con.execute(
            "INSERT INTO users (username, name, password, activation_date) VALUES (?, ?, ?, ?)",
            (username, name, get_password_hash(password), None),
        )
        con.commit()
    finally:
        con.close()
    return User(username=username, name=name)


def has_editor_users(settings: Settings) -> bool:
    """Whether the editor user database holds at least one user."""
    path = settings.users_db_path
    if not path.is_file():
        return False
    con = sqlite3.connect(path)
    try:
        row = con.execute("SELECT username FROM users LIMIT 1").fetchone()
    except sqlite3.OperationalError:
        return False
    finally:
        con.close()
    return row is not None


# -- access tokens (JWT) ---------------------------------------------------------------------------
def create_access_token(
    data: dict[str, Any],
    secret_key: str = DEFAULT_SECRET_KEY,
    expires_delta: timedelta | None = None,
) -> str:
    if expires_delta is None:
        expires_delta = timedelta(days=DEFAULT_ACCESS_TOKEN_EXPIRE_DAYS)
    to_encode = data.copy()
    to_encode.update({"exp": datetime.now(UTC) + expires_delta})
    return jwt.encode(to_encode, secret_key, algorithm=ALGORITHM)


def get_user_from_token(
    token: str,
    secret_key: str = DEFAULT_SECRET_KEY,
    db_path: Path | None = None,
) -> User:
    try:
        payload = jwt.decode(token, secret_key, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception from None
    except JWTError:
        raise credentials_exception from None

    user_record = get_user_fromdb(username, db_path or get_settings().users_db_path)
    if not user_record:
        raise credentials_exception
    username_out, name, stored_password, activation_date = user_record
    return User(username=username_out, name=name)
