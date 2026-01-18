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

router = APIRouter()


class SyncProfileRequest(BaseModel):
    role: Optional[str] = None  # Optional role: 'field_researcher' or 'public'


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
    try:
        supabase = get_admin_supabase_client()
        auth0_user_id = current_user["id"]
        email = current_user["email"]
        
        # Check if profile exists
        profile_response = supabase.table("profiles").select("*").eq("id", auth0_user_id).execute()
        profile = profile_response.data[0] if profile_response.data else None
        
        # Determine role: use from request_body if provided, otherwise default to 'public'
        # Only set role on profile creation (not update)
        requested_role = 'public'  # Default
        if request_body and request_body.role:
            if request_body.role in ['field_researcher', 'public', 'admin']:
                requested_role = request_body.role
        
        if not profile:
            # Create profile from Auth0 user data
            # Extract username from email (or use Auth0 nickname if available)
            username = email.split("@")[0] if email else f"user_{auth0_user_id[:8]}"
            
            # Use RPC function to create profile (bypasses RLS)
            try:
                supabase.rpc('create_user_profile', {
                    'p_id': auth0_user_id,
                    'p_username': username,
                    'p_role': requested_role,  # Use requested role or default to 'public'
                    'p_full_name': None
                }).execute()
            except Exception as rpc_error:
                # Fallback: direct insert if RPC fails
                try:
                    supabase.table("profiles").insert({
                        "id": auth0_user_id,
                        "username": username,
                        "role": requested_role
                    }).execute()
                except Exception as insert_error:
                    raise HTTPException(
                        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                        detail=f"Failed to create profile: RPC error: {str(rpc_error)}, Insert error: {str(insert_error)}"
                    )
        
        # Return updated profile
        profile_response = supabase.table("profiles").select("*").eq("id", auth0_user_id).execute()
        profile_data = profile_response.data[0] if profile_response.data else {}
        
        return User(
            id=auth0_user_id,
            email=email,
            username=profile_data.get("username", username if not profile else profile.get("username", "")),
            full_name=profile_data.get("full_name"),
            role=profile_data.get("role", "public"),
            is_active=True,
            created_at=None,
            updated_at=None
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error syncing profile: {str(e)}"
        )
