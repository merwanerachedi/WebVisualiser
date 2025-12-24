# backend/app/auth_routes.py
import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status

from .auth import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    create_access_token,
    get_current_user,
    get_password_hash,
    verify_password,
)
from .database import db
from .models import Token, UserCreate, UserLogin, UserResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=UserResponse)
async def register(user_data: UserCreate):
    """Register a new user."""
    # Check if user already exists
    existing_user = await db.get_user_by_email(user_data.email)
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )

    # Create user
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
async def login(user_data: UserLogin, response: Response):
    """Login and get access token in HttpOnly cookie."""
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

    # Create access token
    access_token = create_access_token(data={"sub": user["user_id"], "email": user["email"]})

    # Set HttpOnly cookie
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=False,  # Set to True in production with HTTPS
        samesite="lax",
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )

    return Token(access_token=access_token, token_type="bearer")


@router.post("/logout")
async def logout(response: Response):
    """Logout by clearing the access token cookie."""
    response.delete_cookie(key="access_token")
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
