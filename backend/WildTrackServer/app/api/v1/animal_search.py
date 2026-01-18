"""Animal search API endpoint using Google Gemini."""
from fastapi import APIRouter, HTTPException, status, Depends, Query, UploadFile, File, Request
from slowapi import Limiter
from slowapi.util import get_remote_address
from app.auth import get_current_user
from app.config import settings
import logging
import httpx
import json
import base64
from typing import Optional

logger = logging.getLogger(__name__)

router = APIRouter()

# Rate limiter for Gemini API calls
# Limit to prevent API quota exhaustion and control costs
limiter = Limiter(key_func=get_remote_address)

# Gemini API configuration
GEMINI_API_KEY = settings.gemini_api_key
# Models to try (in order of preference) - Using Google AI Pro models:
# gemini-2.0-flash-exp - Latest experimental 2.0 model (best performance)
# gemini-1.5-pro - Pro model with advanced capabilities
# gemini-1.5-flash - Fast pro model
# gemini-2.5-flash - Latest stable flash model
PRO_MODELS = [
    "gemini-2.0-flash-exp",  # Latest experimental model (best for AI Pro)
    "gemini-1.5-pro",        # Pro model with advanced reasoning
    "gemini-1.5-flash",      # Fast pro model
    "gemini-2.5-flash",      # Latest stable flash model
]
GEMINI_MODEL = PRO_MODELS[0]  # Default to first model


@router.get("/search-animal")
@limiter.limit("10/minute")  # Limit to 10 searches per minute per IP
async def search_animal(
    request: Request,
    animal_name: str = Query(..., min_length=1, max_length=100, description="Animal name to search for"),
    current_user: dict = Depends(get_current_user)
):
    """
    Search for information about an animal using Google Gemini AI Pro models.
    
    Returns detailed structured information including icons, statistics, and graph data.
    """
    if not GEMINI_API_KEY:
        logger.error("Gemini API key not configured - check .env file for GEMINI_API_KEY")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Animal search service is not configured. The Gemini API key is missing. Please add GEMINI_API_KEY to your .env file."
        )
    
    try:
        # Construct the enhanced prompt for Gemini Pro - requesting structured JSON response
        prompt = f"""You are an expert zoologist and data visualization specialist. Provide comprehensive information about the animal: {animal_name}.

Return your response as a JSON object with the following structure:
{{
  "common_name": "string",
  "scientific_name": "string",
  "icon_emoji": "string (best emoji representing this animal)",
  "description": "string (2-3 paragraph comprehensive description)",
  "physical_characteristics": {{
    "size": "string (e.g., '1.2-1.8 meters')",
    "weight": "string (e.g., '45-90 kg')",
    "lifespan": "string (e.g., '15-20 years')",
    "appearance": "string (detailed physical description)"
  }},
  "habitat": {{
    "type": "string (e.g., 'Forest, Grassland')",
    "geographic_distribution": "string (continents/regions)",
    "habitat_data": {{
      "forest": number (percentage 0-100),
      "grassland": number,
      "desert": number,
      "aquatic": number,
      "mountain": number,
      "urban": number
    }}
  }},
  "diet": {{
    "type": "string (e.g., 'Carnivore, Herbivore, Omnivore')",
    "primary_food": "string",
    "diet_data": {{
      "carnivore": number (percentage 0-100),
      "herbivore": number,
      "omnivore": number,
      "insectivore": number,
      "piscivore": number
    }}
  }},
  "behavior": {{
    "social_structure": "string",
    "activity_pattern": "string (e.g., 'Nocturnal, Diurnal')",
    "notable_behaviors": ["string", "string"]
  }},
  "conservation": {{
    "status": "string (IUCN status)",
    "population_trend": "string (e.g., 'Decreasing, Stable, Increasing')",
    "estimated_population": "string (if known)",
    "threats": ["string", "string"]
  }},
  "statistics": {{
    "speed_kmh": number (top speed in km/h),
    "height_cm": number (average height in cm),
    "weight_kg": number (average weight in kg),
    "lifespan_years": number (average lifespan)
  }},
  "interesting_facts": ["string", "string", "string"]
}}

Be specific, accurate, and provide numerical data where possible. For habitat_data and diet_data, ensure percentages add up to approximately 100. Use realistic estimates based on scientific knowledge."""

        # Call Gemini API - try multiple free tier models and API versions
        async with httpx.AsyncClient(timeout=30.0) as client:
            last_error = None
            response = None
            successful_model = None  # Track which model worked
            
            # Try each model until one works
            for model_name in PRO_MODELS:
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
                                    "temperature": 0.3,
                                    "topK": 40,
                                    "topP": 0.95,
                                    "maxOutputTokens": 4096,
                                    "responseMimeType": "application/json"
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
            
            # Extract the JSON response from Gemini
            if "candidates" in data and len(data["candidates"]) > 0:
                candidate = data["candidates"][0]
                if "content" in candidate and "parts" in candidate["content"]:
                    parts = candidate["content"]["parts"]
                    if len(parts) > 0 and "text" in parts[0]:
                        response_text = parts[0]["text"]
                        
                        # Try to parse as JSON
                        try:
                            # Clean the response text (remove markdown code blocks if present)
                            cleaned_text = response_text.strip()
                            if cleaned_text.startswith("```json"):
                                cleaned_text = cleaned_text[7:]
                            if cleaned_text.startswith("```"):
                                cleaned_text = cleaned_text[3:]
                            if cleaned_text.endswith("```"):
                                cleaned_text = cleaned_text[:-3]
                            cleaned_text = cleaned_text.strip()
                            
                            animal_data = json.loads(cleaned_text)
                            
                            logger.info(f"Successfully retrieved structured information for animal: {animal_name} using model: {successful_model or GEMINI_MODEL}")
                            
                            # Return structured data
                            return {
                                "animal_name": animal_data.get("common_name", animal_name),
                                "scientific_name": animal_data.get("scientific_name", ""),
                                "icon_emoji": animal_data.get("icon_emoji", "🐾"),
                                "description": animal_data.get("description", ""),
                                "physical_characteristics": animal_data.get("physical_characteristics", {}),
                                "habitat": animal_data.get("habitat", {}),
                                "diet": animal_data.get("diet", {}),
                                "behavior": animal_data.get("behavior", {}),
                                "conservation": animal_data.get("conservation", {}),
                                "statistics": animal_data.get("statistics", {}),
                                "interesting_facts": animal_data.get("interesting_facts", []),
                                "source": f"Google Gemini AI Pro ({successful_model or GEMINI_MODEL})"
                            }
                        except json.JSONDecodeError as e:
                            logger.warning(f"Failed to parse JSON response, falling back to text: {e}")
                            # Fallback to text format if JSON parsing fails
                            return {
                                "animal_name": animal_name,
                                "information": response_text,
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


@router.post("/detect-animal-from-image")
@limiter.limit("5/minute")  # Limit to 5 detections per minute per IP (more expensive operation)
async def detect_animal_from_image(
    request: Request,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """
    Detect animal species from an uploaded image using Google Gemini Vision API.
    
    Returns the detected animal species name that can be used to auto-fill the species field.
    """
    if not GEMINI_API_KEY:
        logger.error("Gemini API key not configured - check .env file for GEMINI_API_KEY")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Animal detection service is not configured. The Gemini API key is missing. Please add GEMINI_API_KEY to your .env file."
        )
    
    # Validate file type
    if not file.content_type or not file.content_type.startswith('image/'):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File must be an image"
        )
    
    try:
        # Read image file
        image_data = await file.read()
        
        # Convert to base64
        image_base64 = base64.b64encode(image_data).decode('utf-8')
        
        # Determine MIME type
        mime_type = file.content_type or 'image/jpeg'
        
        # Construct the prompt for Gemini Vision
        prompt = """Analyze this image and identify the animal species shown. 

IMPORTANT: Only identify if there is a LIVING ANIMAL in the image. Do NOT identify:
- Plants, trees, or vegetation
- Buildings, structures, or objects
- Vehicles or machines
- Food items
- Inanimate objects
- Dead animals (unless specifically asked)

Please provide:
1. The common name of the animal (e.g., "African Elephant", "Red Fox", "Bald Eagle")
2. If multiple animals are present, identify the most prominent one
3. If no animal is clearly visible, respond with "No animal detected"
4. If the image contains something that is NOT an animal, respond with "No animal detected"
5. Be specific with the species name (e.g., "African Elephant" not just "Elephant")

Return your response as a JSON object with this structure:
{
  "species": "string (common name of the animal OR 'No animal detected')",
  "confidence": "string (High, Medium, Low, or None)",
  "notes": "string (any relevant notes about the detection, including if the image contains non-animal objects)"
}

If no animal is detected (including if the image shows plants, objects, buildings, etc.), set species to "No animal detected" and confidence to "None"."""
        
        # Call Gemini Vision API - try multiple models
        async with httpx.AsyncClient(timeout=30.0) as client:
            last_error = None
            response = None
            successful_model = None
            
            # Try each model until one works
            for model_name in PRO_MODELS:
                # Try v1beta first (most models available here), then v1
                api_versions = ["v1beta", "v1"]
                
                for api_version in api_versions:
                    api_url = f"https://generativelanguage.googleapis.com/{api_version}/models/{model_name}:generateContent"
                    
                    try:
                        logger.info(f"Trying Gemini Vision {api_version} with model: {model_name}")
                        response = await client.post(
                            f"{api_url}?key={GEMINI_API_KEY}",
                            json={
                                "contents": [{
                                    "parts": [
                                        {
                                            "text": prompt
                                        },
                                        {
                                            "inline_data": {
                                                "mime_type": mime_type,
                                                "data": image_base64
                                            }
                                        }
                                    ]
                                }],
                                "generationConfig": {
                                    "temperature": 0.3,
                                    "topK": 40,
                                    "topP": 0.95,
                                    "maxOutputTokens": 1024,
                                    "responseMimeType": "application/json"
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
                
                logger.error(f"All Gemini Vision models failed. Last error: {status_code} - {error_text[:200]}")
                
                # Provide helpful error messages
                if status_code == 404:
                    raise HTTPException(
                        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                        detail="No vision models available. Please check your API key permissions or upgrade your plan."
                    )
                elif status_code == 429:
                    raise HTTPException(
                        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                        detail="API rate limit exceeded. Please wait a few minutes and try again."
                    )
                else:
                    raise HTTPException(
                        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                        detail=f"Failed to detect animal from image (error {status_code}). Please try again later."
                    )
            
            data = response.json()
            
            # Extract the JSON response from Gemini
            if "candidates" in data and len(data["candidates"]) > 0:
                candidate = data["candidates"][0]
                if "content" in candidate and "parts" in candidate["content"]:
                    parts = candidate["content"]["parts"]
                    if len(parts) > 0 and "text" in parts[0]:
                        response_text = parts[0]["text"]
                        
                        # Try to parse as JSON
                        try:
                            # Clean the response text (remove markdown code blocks if present)
                            cleaned_text = response_text.strip()
                            if cleaned_text.startswith("```json"):
                                cleaned_text = cleaned_text[7:]
                            if cleaned_text.startswith("```"):
                                cleaned_text = cleaned_text[3:]
                            if cleaned_text.endswith("```"):
                                cleaned_text = cleaned_text[:-3]
                            cleaned_text = cleaned_text.strip()
                            
                            detection_data = json.loads(cleaned_text)
                            
                            species = detection_data.get("species", "Unknown")
                            confidence = detection_data.get("confidence", "Unknown")
                            notes = detection_data.get("notes", "")
                            
                            logger.info(f"Successfully detected animal: {species} (confidence: {confidence}) using model: {successful_model or GEMINI_MODEL}")
                            
                            # Return detection result
                            return {
                                "species": species,
                                "confidence": confidence,
                                "notes": notes,
                                "source": f"Google Gemini Vision ({successful_model or GEMINI_MODEL})"
                            }
                        except json.JSONDecodeError as e:
                            logger.warning(f"Failed to parse JSON response, extracting species from text: {e}")
                            # Fallback: try to extract species from text response
                            # Look for common patterns
                            if "No animal detected" in response_text or "no animal" in response_text.lower():
                                return {
                                    "species": "No animal detected",
                                    "confidence": "None",
                                    "notes": "Could not detect an animal in the image",
                                    "source": f"Google Gemini Vision ({successful_model or GEMINI_MODEL})"
                                }
                            # Return the text as species (might contain the name)
                            return {
                                "species": response_text.strip()[:100],  # Limit length
                                "confidence": "Unknown",
                                "notes": "Could not parse structured response",
                                "source": f"Google Gemini Vision ({successful_model or GEMINI_MODEL})"
                            }
            
            # If we get here, the response format was unexpected
            logger.warning(f"Unexpected response format from Gemini Vision API: {data}")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Unexpected response format from detection service."
            )
            
    except httpx.TimeoutException:
        logger.error("Timeout calling Gemini Vision API")
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Animal detection service timed out. Please try again."
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error detecting animal from image: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"An error occurred while detecting animal: {str(e)}"
        )
