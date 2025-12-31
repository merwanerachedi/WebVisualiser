# backend/app/auth_routes.py
import logging
import os
import uuid

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status

from .auth import (
    REFRESH_TOKEN_EXPIRE_DAYS,
    create_access_token,
    create_refresh_token,
    get_current_user,
    get_password_hash,
    verify_password,
)
from .database import db
from .models import Token, UserCreate, UserLogin, UserResponse
from .rate_limiter import RateLimiter
from .redis_cache import cache

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["auth"])

# Cookie settings based on environment
# Set ENVIRONMENT=production on Render
IS_PRODUCTION = os.getenv("ENVIRONMENT", "development") == "production"
COOKIE_SECURE = IS_PRODUCTION  # True in prod (HTTPS), False in dev (HTTP)
COOKIE_SAMESITE = "none" if IS_PRODUCTION else "lax"


@router.post("/register", response_model=UserResponse)
async def register(
    request: Request,
    user_data: UserCreate,
    _: None = Depends(RateLimiter(limit=3, window=60, key_prefix="auth:register")),
):
    """Register a new user."""
    existing_user = await db.get_user_by_email(user_data.email)
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )

    user_id = str(uuid.uuid4())
    hashed_password = get_password_hash(user_data.password)

    try:
        user = await db.create_user(user_id, user_data.email, hashed_password)
        return UserResponse(
            user_id=user["user_id"],
            email=user["email"],
            created_at=user["created_at"],
        )
    except Exception as e:
        logger.error(f"Failed to create user: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create user",
        ) from e


@router.post("/login", response_model=Token)
async def login(
    request: Request,
    user_data: UserLogin,
    response: Response,
    _: None = Depends(RateLimiter(limit=5, window=60, key_prefix="auth:login")),
):
    """Login and get access token + refresh token in HttpOnly cookies."""
    user = await db.get_user_by_email(user_data.email)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    if not verify_password(user_data.password, user["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    # Create tokens
    access_token = create_access_token(data={"sub": user["user_id"], "email": user["email"]})
    refresh_token = create_refresh_token()

    # Store refresh token in Redis
    await cache.store_refresh_token(user["user_id"], refresh_token)

    # Set HttpOnly cookies
    # Note: access_token cookie lives as long as refresh_token (1 day)
    # The JWT inside expires after 15 min, triggering refresh flow
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        max_age=REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
    )
    response.set_cookie(
        key="refresh_token",
        value=f"{user['user_id']}:{refresh_token}",
        httponly=True,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        max_age=REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
    )

    return Token(access_token=access_token, token_type="bearer")


@router.post("/refresh")
async def refresh_token(response: Response, refresh_token: str | None = Cookie(default=None)):
    """Refresh access token using refresh token."""
    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No refresh token",
        )

    # Parse user_id and token from cookie
    try:
        user_id, token = refresh_token.split(":", 1)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token format",
        ) from ValueError

    # Verify refresh token exists in Redis
    stored_token = await cache.get_refresh_token(user_id)
    if not stored_token or stored_token != token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="session_expired",
        )

    # Get user data for new access token
    user = await db.get_user_by_id(user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    # Create new access token
    new_access_token = create_access_token(data={"sub": user["user_id"], "email": user["email"]})
    token_preview = f"{new_access_token[:10]}...{new_access_token[-10:]}"
    logger.info(f"[REFRESH] New access token generated: {token_preview}")

    # Set new access token cookie
    response.set_cookie(
        key="access_token",
        value=new_access_token,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        max_age=REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
    )

    return {"message": "Token refreshed", "access_token": new_access_token}


@router.post("/logout")
async def logout(response: Response, refresh_token: str | None = Cookie(default=None)):
    """Logout by clearing cookies and deleting refresh token from Redis."""
    # Delete refresh token from Redis if exists
    if refresh_token:
        try:
            user_id, _ = refresh_token.split(":", 1)
            await cache.delete_refresh_token(user_id)
        except ValueError:
            pass  # Invalid format, just continue with logout

    # Clear cookies
    response.delete_cookie(key="access_token")
    response.delete_cookie(key="refresh_token")

    return {"message": "Logged out successfully"}


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    """Get current user profile."""
    user = await db.get_user_by_id(current_user["user_id"])
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    return UserResponse(
        user_id=user["user_id"],
        email=user["email"],
        created_at=user["created_at"],
    )
