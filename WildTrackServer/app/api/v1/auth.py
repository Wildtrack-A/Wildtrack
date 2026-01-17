"""Authentication API endpoints using Auth0.

Note: Registration and login are handled by Auth0's hosted pages.
This module provides endpoints for managing user profiles and getting user info.
"""
from fastapi import APIRouter, HTTPException, status, Depends
from app.models.user import User, Token
from app.auth import get_current_active_user
from app.database import get_admin_supabase_client

router = APIRouter()


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


@router.post("/sync-profile")
async def sync_profile(current_user: dict = Depends(get_current_active_user)):
    """
    Sync Auth0 user data to profiles table.
    
    This creates or updates the profile entry for the authenticated Auth0 user.
    Call this after first login to create the profile entry.
    """
    supabase = get_admin_supabase_client()
    auth0_user_id = current_user["id"]
    email = current_user["email"]
    
    # Check if profile exists
    profile_response = supabase.table("profiles").select("*").eq("id", auth0_user_id).execute()
    profile = profile_response.data[0] if profile_response.data else None
    
    if not profile:
        # Create profile from Auth0 user data
        # Extract username from email (or use Auth0 nickname if available)
        username = email.split("@")[0] if email else f"user_{auth0_user_id[:8]}"
        
        # Use RPC function to create profile (bypasses RLS)
        try:
            supabase.rpc('create_user_profile', {
                'p_id': auth0_user_id,
                'p_username': username,
                'p_role': 'public',  # Default role
                'p_full_name': None
            }).execute()
        except:
            # Fallback: direct insert if RPC fails
            supabase.table("profiles").insert({
                "id": auth0_user_id,
                "username": username,
                "role": "public"
            }).execute()
    
    # Return updated profile
    profile_response = supabase.table("profiles").select("*").eq("id", auth0_user_id).execute()
    profile_data = profile_response.data[0] if profile_response.data else {}
    
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
