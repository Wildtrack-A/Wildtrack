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
        email = current_user.get("email", "")  # Email might not be in token
        
        # Check if profile exists
        try:
            profile_response = supabase.table("profiles").select("*").eq("id", auth0_user_id).execute()
            profile = profile_response.data[0] if profile_response.data else None
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to check existing profile: {str(e)}"
            )
        
        # Determine role: use from request_body if provided, otherwise default to 'public'
        # Only set role on profile creation (not update)
        requested_role = 'public'  # Default
        if request_body and request_body.role:
            if request_body.role in ['field_researcher', 'public', 'admin']:
                requested_role = request_body.role
        
        # If profile exists, use existing username
        if profile:
            username = profile.get("username", "")
        else:
            # Generate a unique username
            # First try to use email prefix if available
            if email:
                base_username = email.split("@")[0]
            else:
                # Use a sanitized version of the user ID
                # For "google-oauth2|1110..." use the part after the pipe
                user_id_parts = auth0_user_id.split("|")
                if len(user_id_parts) > 1:
                    base_username = f"user_{user_id_parts[1][:8]}"
                else:
                    base_username = f"user_{auth0_user_id[:8].replace('-', '')}"
            
            # Check if username exists and generate unique one if needed
            username = base_username
            counter = 1
            while True:
                try:
                    # Check if username already exists
                    existing = supabase.table("profiles").select("id").eq("username", username).execute()
                    if not existing.data:
                        break  # Username is available
                    # Username exists, try with a number suffix
                    username = f"{base_username}{counter}"
                    counter += 1
                    if counter > 1000:  # Safety limit
                        # Last resort: use full user ID hash
                        import hashlib
                        username = f"user_{hashlib.md5(auth0_user_id.encode()).hexdigest()[:8]}"
                        break
                except Exception:
                    # If check fails, try the username anyway and let database handle conflict
                    break
        
        if not profile:
            # Create profile from Auth0 user data
            # Use RPC function to create profile (bypasses RLS)
            # The RPC function uses ON CONFLICT, so it will update if ID exists
            try:
                rpc_result = supabase.rpc('create_user_profile', {
                    'p_id': auth0_user_id,
                    'p_username': username,
                    'p_role': requested_role,  # Use requested role or default to 'public'
                    'p_full_name': None
                }).execute()
            except Exception as rpc_error:
                # Fallback: direct insert with ON CONFLICT handling
                # Check if it's a username conflict specifically
                rpc_error_str = str(rpc_error).lower()
                if ('username' in rpc_error_str and 'already exists' in rpc_error_str) or 'duplicate' in rpc_error_str:
                    # Username conflict - try to find available username
                    base_username = username
                    counter = 1
                    username_found = False
                    for attempt in range(100):
                        try:
                            test_username = f"{base_username}{counter}" if counter > 1 else base_username
                            # Try insert with new username
                            insert_result = supabase.table("profiles").insert({
                                "id": auth0_user_id,
                                "username": test_username,
                                "role": requested_role
                            }).execute()
                            username = test_username
                            username_found = True
                            break
                        except Exception:
                            counter += 1
                            if counter > 100:
                                # Use hashed username as last resort
                                import hashlib
                                username = f"user_{hashlib.md5(auth0_user_id.encode()).hexdigest()[:8]}"
                                try:
                                    insert_result = supabase.table("profiles").insert({
                                        "id": auth0_user_id,
                                        "username": username,
                                        "role": requested_role
                                    }).execute()
                                    username_found = True
                                except:
                                    pass
                                break
                    
                    if not username_found:
                        raise HTTPException(
                            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                            detail=f"Failed to create profile: Could not find available username after multiple attempts. RPC error: {str(rpc_error)}"
                        )
                else:
                    # Other error - try direct insert
                    try:
                        insert_result = supabase.table("profiles").insert({
                            "id": auth0_user_id,
                            "username": username,
                            "role": requested_role
                        }).execute()
                        
                        # Verify the insert succeeded
                        if not insert_result.data:
                            raise HTTPException(
                                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                                detail="Profile insert completed but no data returned"
                            )
                    except HTTPException:
                        raise
                    except Exception as insert_error:
                        raise HTTPException(
                            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                            detail=f"Failed to create profile: RPC error: {str(rpc_error)}, Insert error: {str(insert_error)}"
                        )
        
        # Fetch the updated/created profile to return
        try:
            profile_response = supabase.table("profiles").select("*").eq("id", auth0_user_id).execute()
            if not profile_response.data:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Profile not found after sync operation"
                )
            profile_data = profile_response.data[0]
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to fetch profile after sync: {str(e)}"
            )
        
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
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error syncing profile: {str(e)}"
        )
