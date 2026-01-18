"""Authentication API endpoints using Supabase Auth."""
from fastapi import APIRouter, HTTPException, status, Depends, Body
from pydantic import BaseModel, EmailStr
from typing import Optional
from app.models.user import User
from app.auth import get_current_active_user
from app.database import get_admin_supabase_client
import logging

logger = logging.getLogger(__name__)

router = APIRouter()


class SignUpRequest(BaseModel):
    email: EmailStr
    password: str
    username: Optional[str] = None
    role: Optional[str] = "public"  # 'field_researcher' or 'public'


class SignInRequest(BaseModel):
    email: EmailStr
    password: str


@router.post("/signup", status_code=status.HTTP_201_CREATED)
async def signup(request: SignUpRequest):
    """
    Sign up a new user with Supabase Auth.
    Creates user account and profile.
    """
    supabase = get_admin_supabase_client()
    
    try:
        # Create user in Supabase Auth
        auth_response = supabase.auth.admin.create_user({
            "email": request.email,
            "password": request.password,
            "email_confirm": True  # Auto-confirm email for simplicity
        })
        
        if not auth_response.user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to create user account"
            )
        
        user_id = auth_response.user.id
        
        # Generate username if not provided
        username = request.username
        if not username:
            # Use email prefix as username
            username = request.email.split("@")[0].lower()
            # Make it unique by appending user_id suffix
            username = f"{username}_{user_id[:8]}"
        
        # Create profile in profiles table
        try:
            profile_response = supabase.table("profiles").insert({
                "id": user_id,
                "username": username,
                "role": request.role or "public"
            }).execute()
            
            if not profile_response.data:
                logger.warning(f"Profile creation failed for user {user_id}, but user was created")
        except Exception as e:
            logger.error(f"Error creating profile for user {user_id}: {e}")
            # User is created but profile failed - this is okay, they can update it later
        
        return {
            "message": "User created successfully",
            "user_id": user_id,
            "email": request.email
        }
        
    except Exception as e:
        error_str = str(e).lower()
        if "user already registered" in error_str or "already exists" in error_str:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An account with this email already exists"
            )
        logger.error(f"Error during signup: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create account: {str(e)}"
        )


@router.post("/signin", status_code=status.HTTP_200_OK)
async def signin(request: SignInRequest):
    """
    Sign in a user with Supabase Auth.
    Returns access token and user info.
    """
    supabase = get_admin_supabase_client()
    
    try:
        # Sign in user
        auth_response = supabase.auth.sign_in_with_password({
            "email": request.email,
            "password": request.password
        })
        
        if not auth_response.user or not auth_response.session:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password"
            )
        
        # Get user profile
        user_id = auth_response.user.id
        profile_response = supabase.table("profiles").select("*").eq("id", user_id).execute()
        profile_data = profile_response.data[0] if profile_response.data else {}
        
        return {
            "access_token": auth_response.session.access_token,
            "refresh_token": auth_response.session.refresh_token,
            "user": {
                "id": user_id,
                "email": auth_response.user.email,
                "username": profile_data.get("username", ""),
                "full_name": profile_data.get("full_name"),
                "role": profile_data.get("role", "public")
            }
        }
        
    except Exception as e:
        error_str = str(e).lower()
        if "invalid" in error_str and ("password" in error_str or "credentials" in error_str):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password"
            )
        logger.error(f"Error during signin: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to sign in: {str(e)}"
        )


@router.get("/me", response_model=User)
async def get_current_user_info(current_user: dict = Depends(get_current_active_user)):
    """
    Get current authenticated user's information.
    
    Requires valid Supabase JWT token in Authorization header.
    """
    return User(
        id=current_user["id"],
        email=current_user["email"],
        username=current_user["username"],
        full_name=current_user.get("full_name"),
        role=current_user["role"],
        is_active=current_user["is_active"],
        created_at=None,
        updated_at=None
    )
