"""Authentication utilities using Supabase Auth."""
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.database import get_admin_supabase_client
from app.config import settings

# HTTP Bearer token scheme
security = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> dict:
    """
    Get current authenticated user from Supabase JWT token.
    Validates token and returns user info including profile data.
    """
    token = credentials.credentials
    
    try:
        supabase = get_admin_supabase_client()
        
        # Verify token with Supabase Auth
        # Supabase client validates the JWT token automatically
        user_response = supabase.auth.get_user(token)
        
        if not user_response or not user_response.user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication credentials",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        user = user_response.user
        
        # Get profile data (role, username, etc.)
        profile_response = supabase.table("profiles").select("*").eq("id", user.id).execute()
        profile_data = profile_response.data[0] if profile_response.data else {}
        
        return {
            "id": str(user.id),
            "email": user.email,
            "username": profile_data.get("username", ""),
            "full_name": profile_data.get("full_name"),
            "role": profile_data.get("role", "public"),
            "is_active": not user.is_anonymous  # Supabase handles active status
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_current_active_user(
    current_user: dict = Depends(get_current_user)
) -> dict:
    """Dependency to get current active user."""
    if not current_user.get("is_active", True):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user"
        )
    return current_user


async def require_field_researcher(
    current_user: dict = Depends(get_current_active_user)
) -> dict:
    """Dependency to require field_researcher or admin role."""
    role = current_user.get("role")
    if role not in ["field_researcher", "admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Field researcher or admin access required"
        )
    return current_user
