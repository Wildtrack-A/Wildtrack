"""Animal search API endpoint using Google Gemini."""
from fastapi import APIRouter, HTTPException, status, Depends, Query
from app.auth import get_current_user
from app.config import settings
import logging
import httpx
from typing import Optional

logger = logging.getLogger(__name__)

router = APIRouter()

# Gemini API configuration
GEMINI_API_KEY = settings.gemini_api_key
# Models to try (in order of preference):
# gemini-2.5-flash-lite - requested model (likely best for free tier with higher quotas)
# gemini-2.5-flash - standard flash model
# gemini-2.0-flash-exp - experimental 2.0 model
# gemini-1.5-flash-002 - stable flash model with free tier
FREE_TIER_MODELS = [
    "gemini-2.5-flash-lite", # Requested model (best for free tier - higher quotas)
    "gemini-2.5-flash",      # Standard flash model
    "gemini-2.0-flash-exp",  # Experimental 2.0 model
    "gemini-1.5-flash-002",  # Stable flash model with free tier
]
GEMINI_MODEL = FREE_TIER_MODELS[0]  # Default to first model


@router.get("/search-animal")
async def search_animal(
    animal_name: str = Query(..., min_length=1, max_length=100, description="Animal name to search for"),
    current_user: dict = Depends(get_current_user)
):
    """
    Search for information about an animal using Google Gemini 2.5 Flash Lite.
    
    Returns detailed information and description about the requested animal.
    """
    if not GEMINI_API_KEY:
        logger.error("Gemini API key not configured - check .env file for GEMINI_API_KEY")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Animal search service is not configured. The Gemini API key is missing. Please add GEMINI_API_KEY to your .env file."
        )
    
    try:
        # Construct the prompt for Gemini
        prompt = f"""Provide a comprehensive description and information about the animal: {animal_name}.

Please include:
1. Common name and scientific name (if applicable)
2. Basic description (appearance, size, physical characteristics)
3. Habitat and geographic distribution
4. Diet and feeding habits
5. Behavior and notable characteristics
6. Conservation status (if applicable)
7. Any other interesting facts

Format the response in a clear, well-organized manner. Be specific and informative."""

        # Call Gemini API - try multiple free tier models and API versions
        async with httpx.AsyncClient(timeout=30.0) as client:
            last_error = None
            response = None
            successful_model = None  # Track which model worked
            
            # Try each model until one works
            for model_name in FREE_TIER_MODELS:
                # Try v1beta first (most models available here), then v1
                api_versions = ["v1beta", "v1"]
                
                for api_version in api_versions:
                    api_url = f"https://generativelanguage.googleapis.com/{api_version}/models/{model_name}:generateContent"
                    
                    try:
                        logger.info(f"Trying Gemini {api_version} with model: {model_name}")
                        response = await client.post(
                            f"{api_url}?key={GEMINI_API_KEY}",
                            json={
                                "contents": [{
                                    "parts": [{
                                        "text": prompt
                                    }]
                                }],
                                "generationConfig": {
                                    "temperature": 0.7,
                                    "topK": 40,
                                    "topP": 0.95,
                                    "maxOutputTokens": 2048,
                                }
                            },
                            headers={
                                "Content-Type": "application/json",
                            }
                        )
                        
                        if response.status_code == 200:
                            successful_model = model_name
                            logger.info(f"Successfully using model: {model_name} via {api_version}")
                            break  # Success!
                        elif response.status_code == 404:
                            # Model not found, try next API version or next model
                            logger.debug(f"Model {model_name} not found in {api_version}, trying next...")
                            last_error = response
                            continue
                        elif response.status_code == 429:
                            # Rate limit - wait a bit and try next model
                            logger.warning(f"Rate limit hit with {model_name}, trying next model...")
                            last_error = response
                            continue
                        else:
                            # Other error - log and try next
                            logger.warning(f"Error {response.status_code} with {model_name}: {response.text[:200]}")
                            last_error = response
                            continue
                    except Exception as e:
                        logger.warning(f"Exception with {model_name} ({api_version}): {e}")
                        last_error = e
                        continue
                    
                    if response and response.status_code == 200:
                        break  # Success, exit model loop
                
                if response and response.status_code == 200:
                    break  # Success, exit outer loop
            
            # Check if we got a successful response
            if not response or response.status_code != 200:
                if last_error and hasattr(last_error, 'status_code'):
                    status_code = last_error.status_code
                    error_text = last_error.text if hasattr(last_error, 'text') else str(last_error)
                elif last_error:
                    status_code = 500
                    error_text = str(last_error)
                else:
                    status_code = 503
                    error_text = "No available models"
                
                logger.error(f"All Gemini models failed. Last error: {status_code} - {error_text[:200]}")
                
                # Provide helpful error messages
                if status_code == 404:
                    raise HTTPException(
                        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                        detail="No free tier models available. Please check your API key permissions or upgrade your plan."
                    )
                elif status_code == 429:
                    # Extract retry info from error if available
                    try:
                        if hasattr(last_error, 'json'):
                            error_data = last_error.json()
                            retry_delay = None
                            if "error" in error_data and "details" in error_data["error"]:
                                for detail in error_data["error"]["details"]:
                                    if detail.get("@type") == "type.googleapis.com/google.rpc.RetryInfo":
                                        retry_delay = detail.get("retryDelay", "28").replace("s", "")
                            if retry_delay:
                                raise HTTPException(
                                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                                    detail=f"API rate limit exceeded. Please wait {retry_delay} seconds and try again. Free tier has daily limits."
                                )
                    except:
                        pass
                    
                    raise HTTPException(
                        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                        detail="API rate limit exceeded. Free tier has daily limits. Please wait a few minutes and try again, or upgrade your plan."
                    )
                else:
                    raise HTTPException(
                        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                        detail=f"Failed to get information from search service (error {status_code}). Please try again later."
                    )
            
            data = response.json()
            
            # Extract the text from Gemini's response
            if "candidates" in data and len(data["candidates"]) > 0:
                candidate = data["candidates"][0]
                if "content" in candidate and "parts" in candidate["content"]:
                    parts = candidate["content"]["parts"]
                    if len(parts) > 0 and "text" in parts[0]:
                        animal_info = parts[0]["text"]
                        
                        logger.info(f"Successfully retrieved information for animal: {animal_name} using model: {successful_model or GEMINI_MODEL}")
                        return {
                            "animal_name": animal_name,
                            "information": animal_info,
                            "source": f"Google Gemini ({successful_model or GEMINI_MODEL})"
                        }
            
            # If we get here, the response format was unexpected
            logger.warning(f"Unexpected response format from Gemini API: {data}")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Unexpected response format from search service."
            )
            
    except httpx.TimeoutException:
        logger.error("Timeout calling Gemini API")
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Search service timed out. Please try again."
        )
    except httpx.HTTPStatusError as e:
        logger.error(f"HTTP error calling Gemini API: {e.response.status_code} - {e.response.text}")
        
        # Handle rate limiting/quota errors specifically
        if e.response.status_code == 429:
            try:
                error_data = e.response.json()
                error_message = error_data.get("error", {}).get("message", "Rate limit exceeded")
                retry_after = None
                
                # Try to extract retry delay from error details
                if "details" in error_data.get("error", {}):
                    for detail in error_data["error"]["details"]:
                        if detail.get("@type") == "type.googleapis.com/google.rpc.RetryInfo":
                            retry_delay = detail.get("retryDelay", "")
                            if retry_delay:
                                retry_after = retry_delay.replace("s", "")
                
                detail_msg = "You've exceeded the API rate limit. Please wait a moment and try again."
                if retry_after:
                    detail_msg = f"You've exceeded the API rate limit. Please wait {retry_after} seconds and try again."
                elif "quota" in error_message.lower():
                    detail_msg = "API quota exceeded. The free tier has daily limits. Please try again later or upgrade your API plan."
                
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=detail_msg
                )
            except:
                # Fallback if error parsing fails
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="API rate limit exceeded. Please wait a moment and try again."
                )
        
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Search service is currently unavailable. Please try again later."
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error searching for animal {animal_name}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"An error occurred while searching for information: {str(e)}"
        )
