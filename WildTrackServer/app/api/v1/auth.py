"""Authentication API endpoints using Supabase Auth."""
from fastapi import APIRouter, HTTPException, status, Depends
from app.models.user import UserCreate, UserLogin, User, Token
from app.auth import get_current_active_user
from app.database import get_admin_supabase_client

router = APIRouter()


@router.post("/register", response_model=User, status_code=status.HTTP_201_CREATED)
async def register(user_data: UserCreate):
    """
    Register a new user account using Supabase Auth.
    
    Roles: 'field_researcher', 'admin', or 'public' (default)
    Password hashing and email verification handled by Supabase.
    """
    supabase = get_admin_supabase_client()
    
    # Check if username already exists in profiles
    profile_check = supabase.table("profiles").select("id").eq("username", user_data.username).execute()
    if profile_check.data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already taken"
        )
    
    # Validate role
    valid_roles = ["field_researcher", "admin", "public"]
    if user_data.role not in valid_roles:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid role. Must be one of: {', '.join(valid_roles)}"
        )
    
    try:
        # Sign up user using Supabase Auth
        # This automatically creates entry in auth.users
        signup_response = supabase.auth.sign_up({
            "email": user_data.email,
            "password": user_data.password,
            "options": {
                "data": {
                    "username": user_data.username,
                    "full_name": user_data.full_name or "",
                    "role": user_data.role
                }
            }
        })
        
        if not signup_response.user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to create user account"
            )
        
        # Check if profile exists (trigger may not have run)
        profile_response = supabase.table("profiles").select("*").eq("id", signup_response.user.id).execute()
        profile = profile_response.data[0] if profile_response.data else None
        
        # If profile doesn't exist, create it using SECURITY DEFINER function
        if not profile:
            # Use RPC function to bypass RLS
            supabase.rpc('create_user_profile', {
                'p_id': str(signup_response.user.id),
                'p_username': user_data.username,
                'p_role': user_data.role,
                'p_full_name': user_data.full_name
            }).execute()
            
            # Fetch the created profile
            profile_response = supabase.table("profiles").select("*").eq("id", signup_response.user.id).execute()
            profile = profile_response.data[0] if profile_response.data else {
                "id": signup_response.user.id,
                "username": user_data.username,
                "role": user_data.role,
                "full_name": user_data.full_name
            }
        else:
            # Update existing profile with provided info
            update_data = {
                "username": user_data.username,
                "role": user_data.role
            }
            if user_data.full_name:
                update_data["full_name"] = user_data.full_name
            supabase.table("profiles").update(update_data).eq("id", signup_response.user.id).execute()
            profile = {**profile, **update_data}
        
        # Parse datetime strings if they exist, otherwise use current time
        from datetime import datetime
        created_at = profile.get("created_at")
        updated_at = profile.get("updated_at")
        
        # If timestamps are strings, parse them
        if created_at and isinstance(created_at, str):
            created_at = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
        elif not created_at:
            created_at = datetime.utcnow()
            
        if updated_at and isinstance(updated_at, str):
            updated_at = datetime.fromisoformat(updated_at.replace('Z', '+00:00'))
        elif not updated_at:
            updated_at = datetime.utcnow()
        
        return User(
            id=str(signup_response.user.id),
            email=signup_response.user.email or user_data.email,
            username=profile.get("username", user_data.username),
            full_name=profile.get("full_name", user_data.full_name),
            role=profile.get("role", user_data.role),
            is_active=True,
            created_at=created_at,
            updated_at=updated_at
        )
        
    except Exception as e:
        error_msg = str(e)
        if "already registered" in error_msg.lower() or "already exists" in error_msg.lower():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered"
            )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error creating user: {error_msg}"
        )


@router.post("/login", response_model=Token)
async def login(credentials: UserLogin):
    """
    Authenticate user using Supabase Auth and return access token.
    Returns Supabase JWT token that can be used for subsequent requests.
    """
    supabase = get_admin_supabase_client()
    
    try:
        # Sign in using Supabase Auth
        signin_response = supabase.auth.sign_in_with_password({
            "email": credentials.email,
            "password": credentials.password
        })
        
        if not signin_response.user or not signin_response.session:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect email or password",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        # Return the Supabase access token
        return {
            "access_token": signin_response.session.access_token,
            "token_type": "bearer"
        }
        
    except Exception as e:
        error_msg = str(e)
        if "invalid" in error_msg.lower() or "credentials" in error_msg.lower():
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect email or password",
                headers={"WWW-Authenticate": "Bearer"},
            )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Authentication error"
        )


@router.get("/me", response_model=User)
async def get_current_user_info(current_user: dict = Depends(get_current_active_user)):
    """
    Get current authenticated user's information from profile.
    """
    return User(
        id=current_user["id"],
        email=current_user["email"],
        username=current_user["username"],
        full_name=current_user.get("full_name"),
        role=current_user["role"],
        is_active=current_user["is_active"],
        created_at=None,  # Can be fetched from profile if needed
        updated_at=None
    )
