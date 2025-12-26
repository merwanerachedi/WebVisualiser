# backend/app/auth.py
import os
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import Cookie, HTTPException, status
from jose import JWTError, jwt
from passlib.context import CryptContext

# Configuration
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "your-secret-key-change-in-production")
ALGORITHM = "HS256"

# Token expiration times
ACCESS_TOKEN_EXPIRE_MINUTES = 1  # 15 minutes
REFRESH_TOKEN_EXPIRE_DAYS = 1  # 1 day

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    """Create a short-lived JWT access token."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(UTC) + expires_delta
    else:
        expire = datetime.now(UTC) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire, "type": "access"})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def create_refresh_token() -> str:
    """Create a unique refresh token (UUID)."""
    return str(uuid.uuid4())


def decode_token(token: str) -> dict | None:
    """Decode and verify a JWT token."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        return None


async def get_current_user_optional(access_token: str | None = Cookie(default=None)):
    """
    Get current user from cookie if available.
    Returns None if no token or invalid token (for optional auth).
    """
    if not access_token:
        return None

    payload = decode_token(access_token)
    if payload is None:
        return None

    user_id = payload.get("sub")
    email = payload.get("email")
    if user_id is None:
        return None

    return {"user_id": user_id, "email": email}


async def get_current_user(access_token: str | None = Cookie(default=None)):
    """
    Get current user from cookie (required auth).
    Raises 401 if not authenticated.
    """
    import logging

    logger = logging.getLogger(__name__)

    # Show first and last 10 chars for token comparison
    if access_token:
        token_preview = f"{access_token[:10]}...{access_token[-10:]}"
    else:
        token_preview = "None"
    logger.info(f"[AUTH] Token received: {token_preview}")

    if not access_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )

    payload = decode_token(access_token)
    logger.info(f"[AUTH] decode_token result: {payload}")

    if payload is None:
        # Token expired or invalid - frontend should try refresh
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="token_expired",
        )

    user_id = payload.get("sub")
    email = payload.get("email")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        )

    return {"user_id": user_id, "email": email}
