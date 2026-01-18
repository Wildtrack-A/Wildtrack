"""Auth0 authentication API endpoints."""
from fastapi import APIRouter, HTTPException, status, Request
from app.database import get_admin_supabase_client

router = APIRouter()


@router.get("/me")
async def get_current_user(request: Request):
    """
    Get current authenticated user information.
    
    This endpoint will be used by the frontend to get user info after Auth0 login.
    """
    # TODO: Implement Auth0 token validation
    # For now, return a placeholder response
    return {
        "message": "Auth0 integration pending",
        "user": None
    }


@router.post("/logout")
async def logout(request: Request):
    """
    Logout endpoint.
    
    Clears session/token on the frontend.
    """
    return {"message": "Logged out successfully"}
