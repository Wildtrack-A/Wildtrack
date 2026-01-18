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
import logging
from datetime import datetime, timedelta
from typing import Optional

logger = logging.getLogger(__name__)

# HTTP Bearer token scheme
security = HTTPBearer(auto_error=False)

# Cache for Auth0 JWKS with expiry (refresh every 24 hours)
_jwks_cache: Optional[dict] = None
_jwks_cache_expiry: Optional[datetime] = None
JWKS_CACHE_TTL = timedelta(hours=24)


def get_auth0_jwks():
    """
    Get Auth0 JSON Web Key Set (JWKS) for token validation.
    Caches JWKS for 24 hours to reduce API calls.
    """
    global _jwks_cache, _jwks_cache_expiry
    
    if not settings.auth0_domain:
        logger.error("Auth0 domain not configured")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Auth0 domain not configured"
        )
    
    # Check if cache is valid
    now = datetime.utcnow()
    if _jwks_cache is None or _jwks_cache_expiry is None or now > _jwks_cache_expiry:
        jwks_url = f"https://{settings.auth0_domain}/.well-known/jwks.json"
        try:
            logger.debug(f"Fetching Auth0 JWKS from {jwks_url}")
            response = httpx.get(jwks_url, timeout=10.0)
            response.raise_for_status()
            _jwks_cache = response.json()
            _jwks_cache_expiry = now + JWKS_CACHE_TTL
            logger.debug("Successfully cached Auth0 JWKS")
        except httpx.TimeoutException:
            logger.error("Timeout fetching Auth0 JWKS")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Timeout connecting to Auth0. Please try again."
            )
        except httpx.HTTPStatusError as e:
            logger.error(f"HTTP error fetching Auth0 JWKS: {e.response.status_code}")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Failed to fetch Auth0 JWKS: HTTP {e.response.status_code}"
            )
        except Exception as e:
            logger.error(f"Error fetching Auth0 JWKS: {e}", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Failed to fetch Auth0 JWKS. Please try again later."
            )
    
    return _jwks_cache


def get_rsa_key(token: str):
    """
    Get RSA public key from Auth0 JWKS for token validation.
    
    Args:
        token: JWT token string
        
    Returns:
        RSA public key object
        
    Raises:
        HTTPException: If key cannot be found or processed
    """
    try:
        unverified_header = jwt.get_unverified_header(token)
        kid = unverified_header.get("kid")
        
        if not kid:
            logger.warning("Token missing 'kid' in header")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token: missing key ID",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        jwks = get_auth0_jwks()
        
        # Find the matching key by kid
        rsa_key = None
        for key in jwks.get("keys", []):
            if key.get("kid") == kid:
                rsa_key = key
                break
        
        if not rsa_key:
            logger.warning(f"Key ID '{kid}' not found in JWKS")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Unable to find appropriate key for token validation",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        # Convert JWK to RSA public key
        def decode_base64url(value):
            """Decode base64url-encoded value (RFC 4648 Section 5)."""
            if isinstance(value, bytes):
                value = value.decode('utf-8')
            # Add padding if needed
            missing_padding = len(value) % 4
            if missing_padding:
                value = value + ('=' * (4 - missing_padding))
            # Replace URL-safe characters
            value = value.replace('-', '+').replace('_', '/')
            return base64.b64decode(value)
        
        try:
            n_bytes = decode_base64url(rsa_key["n"])
            e_bytes = decode_base64url(rsa_key["e"])
            
            public_numbers = rsa.RSAPublicNumbers(
                int.from_bytes(e_bytes, 'big'),
                int.from_bytes(n_bytes, 'big')
            )
            public_key = public_numbers.public_key(default_backend())
            
            return public_key
        except (KeyError, ValueError, TypeError) as e:
            logger.error(f"Error processing RSA key parameters: {e}", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Error processing token key: invalid key format",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error getting RSA key: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Error processing token key",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> dict:
    """
    Get current authenticated user from Auth0 JWT token.
    Validates token and returns user info including profile data.
    
    Args:
        credentials: HTTP Bearer token credentials
        
    Returns:
        dict: User information including id, email, username, role, etc.
        
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
            logger.warning("Token missing subject (sub) claim")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token: missing subject",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        # Get profile data from our profiles table
        try:
            supabase = get_admin_supabase_client()
            profile_response = supabase.table("profiles").select("*").eq("id", user_id).execute()
            profile_data = profile_response.data[0] if profile_response.data else {}
        except Exception as e:
            logger.warning(f"Failed to fetch profile for user {user_id}: {e}")
            # Continue with empty profile data rather than failing auth
            profile_data = {}
        
        return {
            "id": user_id,
            "email": payload.get("email", ""),
            "username": profile_data.get("username", ""),
            "full_name": profile_data.get("full_name"),
            "role": profile_data.get("role", "public"),
            "is_active": True
        }
        
    except JWTError as e:
        error_msg = str(e).lower()
        logger.warning(f"JWT validation error: {e}")
        
        # Provide helpful error messages for common JWT errors
        if "audience" in error_msg:
            detail = (
                f"Invalid token audience. Expected: {settings.auth0_api_audience}. "
                "Please sign out and sign in again to get a new token."
            )
        elif "expired" in error_msg:
            detail = "Your session has expired. Please sign in again."
        elif "signature" in error_msg:
            detail = "Invalid token signature. Please sign in again."
        elif "issuer" in error_msg or "iss" in error_msg:
            detail = "Invalid token issuer. Please sign in again."
        else:
            detail = "Invalid or malformed token. Please sign in again."
        
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=detail,
            headers={"WWW-Authenticate": "Bearer"},
        )
    except HTTPException:
        raise
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
