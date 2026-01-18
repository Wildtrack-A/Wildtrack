"""Authentication API endpoints using Auth0.

Note: Registration and login are handled by Auth0's hosted pages.
This module provides endpoints for managing user profiles and getting user info.
"""
from fastapi import APIRouter, HTTPException, status, Depends, Body
from pydantic import BaseModel
from typing import Optional
from app.models.user import User, Token
from app.auth import get_current_active_user
from app.database import get_admin_supabase_client
import logging
import hashlib

logger = logging.getLogger(__name__)

router = APIRouter()


class SyncProfileRequest(BaseModel):
    role: Optional[str] = None  # Optional role: 'field_researcher' or 'public'


def _generate_username_from_email(email: str, supabase, max_attempts: int = 100) -> str:
    """
    Generate a unique username from email address.
    
    Args:
        email: User's email address
        supabase: Supabase client instance
        max_attempts: Maximum number of attempts to find unique username
        
    Returns:
        Unique username string
    """
    if not email:
        raise ValueError("Email is required to generate username")
    
    base_username = email.split("@")[0].lower()
    # Remove invalid characters (keep alphanumeric, underscore, hyphen)
    base_username = ''.join(c for c in base_username if c.isalnum() or c in ['_', '-'])
    # Ensure username starts with alphanumeric
    base_username = base_username.lstrip('_-') or 'user'
    # Limit length
    base_username = base_username[:20]
    
    username = base_username
    for counter in range(1, max_attempts + 1):
        try:
            existing = supabase.table("profiles").select("id").eq("username", username).execute()
            if not existing.data:
                return username  # Username is available
            username = f"{base_username}{counter}"
        except Exception as e:
            logger.warning(f"Error checking username '{username}': {e}")
            # If check fails, try the username anyway and let database handle conflict
            return username
    
    # Last resort: use hash of email
    logger.warning(f"Could not find unique username after {max_attempts} attempts, using hash")
    hash_suffix = hashlib.md5(email.encode()).hexdigest()[:8]
    return f"{base_username[:12]}_{hash_suffix}"


def _generate_username_from_user_id(user_id: str, supabase, max_attempts: int = 100) -> str:
    """
    Generate a unique username from Auth0 user ID.
    
    Args:
        user_id: Auth0 user ID (e.g., "auth0|xxxxx" or "google-oauth2|xxxxx")
        supabase: Supabase client instance
        max_attempts: Maximum number of attempts to find unique username
        
    Returns:
        Unique username string
    """
    # Extract meaningful part from user ID
    user_id_parts = user_id.split("|")
    if len(user_id_parts) > 1:
        # Use the part after the pipe (provider user ID)
        base_username = f"user_{user_id_parts[1][:8]}"
    else:
        # Use first 8 characters, removing invalid characters
        clean_id = ''.join(c for c in user_id[:8] if c.isalnum() or c == '-')
        base_username = f"user_{clean_id}" if clean_id else "user"
    
    username = base_username
    for counter in range(1, max_attempts + 1):
        try:
            existing = supabase.table("profiles").select("id").eq("username", username).execute()
            if not existing.data:
                return username  # Username is available
            username = f"{base_username}{counter}"
        except Exception as e:
            logger.warning(f"Error checking username '{username}': {e}")
            return username
    
    # Last resort: use hash of user ID
    logger.warning(f"Could not find unique username after {max_attempts} attempts, using hash")
    hash_suffix = hashlib.md5(user_id.encode()).hexdigest()[:8]
    return f"user_{hash_suffix}"


def _get_or_generate_username(
    auth0_user_id: str, 
    email: str, 
    existing_username: Optional[str],
    supabase
) -> str:
    """
    Get existing username or generate a new unique one.
    
    Args:
        auth0_user_id: Auth0 user ID
        email: User's email address
        existing_username: Existing username if profile already exists
        supabase: Supabase client instance
        
    Returns:
        Username string
    """
    # If profile exists, use existing username
    if existing_username:
        return existing_username
    
    # Generate new username
    try:
        if email:
            return _generate_username_from_email(email, supabase)
        else:
            return _generate_username_from_user_id(auth0_user_id, supabase)
    except Exception as e:
        logger.error(f"Error generating username: {e}", exc_info=True)
        # Fallback to hash-based username
        hash_suffix = hashlib.md5(auth0_user_id.encode()).hexdigest()[:8]
        return f"user_{hash_suffix}"


def _create_profile(
    auth0_user_id: str,
    username: str,
    role: str,
    supabase
) -> dict:
    """
    Create user profile using RPC function or direct insert.
    
    Args:
        auth0_user_id: Auth0 user ID
        username: Unique username
        role: User role
        supabase: Supabase client instance
        
    Returns:
        Created profile data
    """
    # Try RPC function first (preferred method)
    try:
        rpc_result = supabase.rpc('create_user_profile', {
            'p_id': auth0_user_id,
            'p_username': username,
            'p_role': role,
            'p_full_name': None
        }).execute()
        
        # If RPC succeeds, fetch the profile
        profile_response = supabase.table("profiles").select("*").eq("id", auth0_user_id).execute()
        if profile_response.data:
            return profile_response.data[0]
            
    except Exception as rpc_error:
        logger.warning(f"RPC create_user_profile failed: {rpc_error}, trying direct insert")
        
        # Fallback to direct insert
        error_str = str(rpc_error).lower()
        if 'username' in error_str and ('already exists' in error_str or 'duplicate' in error_str):
            # Username conflict - this shouldn't happen if we checked, but handle it
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Username '{username}' is already taken. Please try again."
            )
    
    # If RPC didn't return data, try direct insert
    try:
        insert_result = supabase.table("profiles").insert({
            "id": auth0_user_id,
            "username": username,
            "role": role
        }).execute()
        
        if not insert_result.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Profile creation completed but no data returned"
            )
        
        return insert_result.data[0]
        
    except HTTPException:
        raise
    except Exception as insert_error:
        error_str = str(insert_error).lower()
        if 'username' in error_str and ('unique' in error_str or 'duplicate' in error_str):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Username '{username}' is already taken. Please try again."
            )
        logger.error(f"Direct insert failed: {insert_error}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create profile: {str(insert_error)}"
        )


@router.get("/me", response_model=User)
async def get_current_user_info(current_user: dict = Depends(get_current_active_user)):
    """
    Get current authenticated user's information from profile.
    
    Requires valid Auth0 JWT token in Authorization header.
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


@router.post("/sync-profile", response_model=User)
async def sync_profile(
    request_body: SyncProfileRequest = Body(default=SyncProfileRequest()),
    current_user: dict = Depends(get_current_active_user)
):
    """
    Sync Auth0 user data to profiles table.
    
    This creates or updates the profile entry for the authenticated Auth0 user.
    Call this after first login to create the profile entry.
    
    Optional request body:
    - role: 'field_researcher' or 'public' (defaults to 'public' if not provided)
    """
    supabase = get_admin_supabase_client()
    auth0_user_id = current_user["id"]
    email = current_user.get("email", "")
    
    # Validate and determine role
    valid_roles = ['field_researcher', 'public', 'admin']
    requested_role = 'public'  # Default
    if request_body and request_body.role:
        if request_body.role in valid_roles:
            requested_role = request_body.role
        else:
            logger.warning(f"Invalid role requested: {request_body.role}, using default 'public'")
    
    try:
        # Check if profile exists
        profile_response = supabase.table("profiles").select("*").eq("id", auth0_user_id).execute()
        profile = profile_response.data[0] if profile_response.data else None
        
        # Get or generate username
        existing_username = profile.get("username") if profile else None
        username = _get_or_generate_username(auth0_user_id, email, existing_username, supabase)
        
        # Create profile if it doesn't exist
        if not profile:
            logger.info(f"Creating new profile for user {auth0_user_id}")
            profile_data = _create_profile(auth0_user_id, username, requested_role, supabase)
        else:
            # Profile exists, just return it
            logger.debug(f"Profile already exists for user {auth0_user_id}")
            profile_data = profile
        
        # Fetch the profile to ensure we have the latest data
        profile_response = supabase.table("profiles").select("*").eq("id", auth0_user_id).execute()
        if not profile_response.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Profile not found after sync operation"
            )
        
        profile_data = profile_response.data[0]
        
        return User(
            id=auth0_user_id,
            email=email,
            username=profile_data.get("username", username),
            full_name=profile_data.get("full_name"),
            role=profile_data.get("role", "public"),
            is_active=True,
            created_at=None,
            updated_at=None
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error syncing profile for user {auth0_user_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error syncing profile: {str(e)}"
        )
