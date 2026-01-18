"""Authentication utilities using Auth0."""
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
import base64
import httpx
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.backends import default_backend
from app.database import get_admin_supabase_client
from app.config import settings

# HTTP Bearer token scheme
security = HTTPBearer()

# Cache for Auth0 JWKS
_jwks_cache = None


def get_auth0_jwks():
    """Get Auth0 JSON Web Key Set (JWKS) for token validation."""
    global _jwks_cache
    if not settings.auth0_domain:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Auth0 domain not configured"
        )
    if _jwks_cache is None:
        jwks_url = f"https://{settings.auth0_domain}/.well-known/jwks.json"
        try:
            response = httpx.get(jwks_url, timeout=5.0)
            response.raise_for_status()
            _jwks_cache = response.json()
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Failed to fetch Auth0 JWKS: {str(e)}"
            )
    return _jwks_cache


def get_rsa_key(token: str):
    """Get RSA public key from Auth0 JWKS for token validation."""
    try:
        unverified_header = jwt.get_unverified_header(token)
        jwks = get_auth0_jwks()
        
        rsa_key = {}
        for key in jwks["keys"]:
            if key["kid"] == unverified_header["kid"]:
                rsa_key = key
                break
        
        if not rsa_key:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Unable to find appropriate key in JWKS",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        # Convert JWK to RSA public key
        # Decode base64url-encoded values (add padding if needed)
        def decode_base64url(value):
            # Ensure value is a string
            if isinstance(value, bytes):
                value = value.decode('utf-8')
            # Add padding if needed
            missing_padding = len(value) % 4
            if missing_padding:
                value = value + ('=' * (4 - missing_padding))
            # Replace URL-safe characters
            value = value.replace('-', '+').replace('_', '/')
            return base64.b64decode(value)
        
        n_bytes = decode_base64url(rsa_key["n"])
        e_bytes = decode_base64url(rsa_key["e"])
        
        public_numbers = rsa.RSAPublicNumbers(
            int.from_bytes(e_bytes, 'big'),
            int.from_bytes(n_bytes, 'big')
        )
        public_key = public_numbers.public_key(default_backend())
        
        return public_key
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Error processing token key: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> dict:
    """
    Get current authenticated user from Auth0 JWT token.
    Validates token and returns user info including profile data.
    """
    token = credentials.credentials
    
    try:
        # Validate Auth0 JWT token
        rsa_key = get_rsa_key(token)
        
        # Decode and verify Auth0 JWT token with audience validation
        payload = jwt.decode(
            token,
            rsa_key,
            algorithms=[settings.auth0_algorithm],
            audience=settings.auth0_api_audience,
            issuer=f"https://{settings.auth0_domain}/"
        )
        
        user_id = payload.get("sub")  # Auth0 user ID (e.g., "auth0|xxxxx")
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token: missing subject",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        # Get profile data from our profiles table
        supabase = get_admin_supabase_client()
        profile_response = supabase.table("profiles").select("*").eq("id", user_id).execute()
        profile_data = profile_response.data[0] if profile_response.data else {}
        
        return {
            "id": user_id,
            "email": payload.get("email", ""),
            "username": profile_data.get("username", ""),
            "full_name": profile_data.get("full_name"),
            "role": profile_data.get("role", "public"),
            "is_active": True
        }
        
    except JWTError as e:
        error_msg = str(e)
        # Provide more helpful error messages for common JWT errors
        if "audience" in error_msg.lower():
            detail = f"Invalid token audience. Expected: {settings.auth0_api_audience}. Please sign out and sign in again to get a new token."
        elif "expired" in error_msg.lower():
            detail = "Your session has expired. Please sign in again."
        elif "signature" in error_msg.lower():
            detail = "Invalid token signature. Please sign in again."
        else:
            detail = f"Invalid token: {error_msg}. Please sign in again."
        
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=detail,
            headers={"WWW-Authenticate": "Bearer"},
        )
    except HTTPException:
        raise
    except Exception as e:
        # Include the actual error message for debugging
        error_detail = f"Could not validate credentials: {str(e)}"
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=error_detail,
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
