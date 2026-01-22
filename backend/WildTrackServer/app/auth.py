"""Authentication utilities using Supabase JWT tokens."""
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from supabase import Client
from app.database import get_supabase_anon_client, get_admin_supabase_client
from app.config import settings
import logging
from typing import Optional
import jwt

logger = logging.getLogger(__name__)

# HTTP Bearer token scheme
security = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> dict:
    """
    Get current authenticated user from Supabase JWT token.
    Validates token using anon/public key and returns user info.
    
    CRITICAL: Uses anon client for JWT verification to respect trust boundaries.
    Only uses admin client for profile access when RLS requires it.
    
    Args:
        credentials: HTTP Bearer token credentials
        
    Returns:
        dict: User information including id, email, etc.
        
    Raises:
        HTTPException: If authentication fails
    """
    if not credentials:
        logger.warning("Missing authorization credentials")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    token = credentials.credentials
    
    if not token or not token.strip():
        logger.warning("Empty authentication token")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Empty authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    try:
        # Use anon client for JWT verification - this respects trust boundaries
        # and doesn't bypass RLS for token validation
        supabase_anon = get_supabase_anon_client()
        
        # Verify token by trying to get user from it (uses anon key for verification)
        try:
            user_response = supabase_anon.auth.get_user(token)
            if not user_response.user:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid token: user not found",
                    headers={"WWW-Authenticate": "Bearer"},
                )
            user_data = user_response.user
            user_id = user_data.id
            email = user_data.email or ""
        except Exception as e:
            logger.warning(f"Failed to verify token with anon client: {e}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token: could not verify user",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        # Get user profile from Supabase
        # Note: Profile access may require admin client if RLS is restrictive,
        # but token verification above ensures the user is authenticated
        try:
            # Try with anon client first (respects RLS)
            try:
                profile_response = supabase_anon.table("profiles").select("*").eq("id", user_id).execute()
                profile_data = profile_response.data[0] if profile_response.data else {}
            except Exception:
                # If RLS blocks, use admin client (but only for profile read, token already verified)
                # This is acceptable since we've already verified the token above
                admin_supabase = get_admin_supabase_client()
                profile_response = admin_supabase.table("profiles").select("*").eq("id", user_id).execute()
                profile_data = profile_response.data[0] if profile_response.data else {}
            
            return {
                "id": user_id,
                "email": email,
                "username": profile_data.get("username", ""),
                "full_name": profile_data.get("full_name"),
                "role": profile_data.get("role", "public"),
                "is_active": True
            }
        except Exception as e:
            logger.warning(f"Failed to fetch user profile for {user_id}: {e}")
            # Return basic user info from verified token if profile fetch fails
            return {
                "id": user_id,
                "email": email,
                "username": "",
                "full_name": None,
                "role": "public",
                "is_active": True
            }
        
    except jwt.ExpiredSignatureError:
        logger.warning("Token has expired")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Your session has expired. Please sign in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.InvalidTokenError as e:
        logger.warning(f"Invalid token: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or malformed token. Please sign in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except Exception as e:
        logger.error(f"Unexpected error validating credentials: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials. Please try signing in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_current_active_user(
    current_user: dict = Depends(get_current_user)
) -> dict:
    """
    Dependency to get current active user.
    Ensures the user account is active before proceeding.
    """
    if not current_user.get("is_active", True):
        logger.warning(f"Inactive user attempted access: {current_user.get('id')}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account is inactive. Please contact support."
        )
    return current_user


async def require_field_researcher(
    current_user: dict = Depends(get_current_active_user)
) -> dict:
    """
    Dependency to require field_researcher or admin role.
    Used for endpoints that require elevated permissions.
    """
    role = current_user.get("role")
    if role not in ["field_researcher", "admin"]:
        user_id = current_user.get("id", "unknown")
        logger.warning(f"User {user_id} with role '{role}' attempted field_researcher endpoint")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Field researcher or admin access required. Your current role does not have permission to access this resource."
        )
    return current_user
