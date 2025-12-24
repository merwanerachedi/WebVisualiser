# backend/app/auth.py
import os
from datetime import UTC, datetime, timedelta

from fastapi import Cookie, HTTPException, status
from jose import JWTError, jwt
from passlib.context import CryptContext

# Configuration
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "your-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash."""
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """Hash a password."""
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    """Create a JWT access token."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(UTC) + expires_delta
    else:
        expire = datetime.now(UTC) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


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
    user = await get_current_user_optional(access_token)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user
