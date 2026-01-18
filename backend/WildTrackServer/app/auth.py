"""Auth0 authentication helpers and middleware."""
from typing import Optional
from fastapi import HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt
import os


# Security scheme for Bearer token
security = HTTPBearer()


def get_user_id_from_token(request: Request) -> str:
    """
    Extract user ID from Auth0 JWT token.
    
    For proof of concept: If no auth token is provided, returns a default user ID.
    This allows testing without Auth0 integration.
    
    Once Auth0 is integrated, remove the fallback and require authentication.
    
    Args:
        request: FastAPI Request object
        
    Returns:
        str: User ID from the token, or default user ID if no token provided
    """
    # Get authorization header
    auth_header = request.headers.get("Authorization")
    if not auth_header:
        # PROOF OF CONCEPT: Return default user ID when no auth token
        # Remove this in production once Auth0 is integrated!
        return "default_user_for_poc"
    
    # Extract token
    try:
        scheme, token = auth_header.split()
        if scheme.lower() != "bearer":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authorization scheme. Expected 'Bearer'"
            )
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization header format"
        )
    
    # TODO: Replace this with actual Auth0 token validation
    # For now, decode without verification (NOT SECURE - for development only)
    # Once Auth0 is set up, you'll need to:
    # 1. Get Auth0 domain from environment
    # 2. Get Auth0 audience from environment
    # 3. Verify token signature and claims
    # 4. Extract user_id from the appropriate claim (usually 'sub')
    
    try:
        # TEMPORARY: Decode without verification (remove in production!)
        # In production, use: jwt.decode(token, jwks, algorithms=["RS256"], audience=auth0_audience)
        decoded_token = jwt.decode(token, options={"verify_signature": False})
        
        # Extract user ID from token (Auth0 typically uses 'sub' claim)
        user_id = decoded_token.get("sub")
        
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token missing user ID (sub claim)"
            )
        
        return user_id
        
    except jwt.DecodeError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token format"
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Token validation failed: {str(e)}"
        )


# Example of how to properly validate Auth0 tokens (commented out for now):
"""
import requests
from jose import jwt
from jose.utils import base64url_decode

def get_jwks(auth0_domain: str):
    '''Fetch Auth0 JSON Web Key Set'''
    jwks_url = f"https://{auth0_domain}/.well-known/jwks.json"
    response = requests.get(jwks_url)
    return response.json()

def verify_token(token: str, auth0_domain: str, auth0_audience: str) -> dict:
    '''Verify and decode Auth0 JWT token'''
    jwks = get_jwks(auth0_domain)
    
    # Get the key ID from token header
    unverified_header = jwt.get_unverified_header(token)
    rsa_key = {}
    for key in jwks["keys"]:
        if key["kid"] == unverified_header["kid"]:
            rsa_key = {
                "kty": key["kty"],
                "kid": key["kid"],
                "use": key["use"],
                "n": key["n"],
                "e": key["e"]
            }
    
    if rsa_key:
        # Verify and decode
        payload = jwt.decode(
            token,
            rsa_key,
            algorithms=["RS256"],
            audience=auth0_audience,
            issuer=f"https://{auth0_domain}/"
        )
        return payload
    
    raise ValueError("Unable to find appropriate key")
"""
