"""API endpoints for image verification."""
from fastapi import APIRouter, UploadFile, File, HTTPException, status
from app.services.image_detector import detect_ai_image
import logging

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/verify-image", status_code=status.HTTP_200_OK)
async def verify_image(file: UploadFile = File(...)):
    """
    Verify if an uploaded image is real or AI-generated.
    
    Returns:
        - is_real: bool - True if image is real, False if AI-generated
        - confidence: float - Confidence score
        - message: str - Human-readable message
    """
    try:
        # Check file type
        if not file.content_type or not file.content_type.startswith("image/"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="File must be an image"
            )
        
        # Read image data
        image_data = await file.read()
        
        if len(image_data) == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Image file is empty"
            )
        
        # Run AI detection
        result = detect_ai_image(image_data)
        
        is_real = not result.get("is_ai", False)
        confidence = result.get("confidence", 0.0)
        
        return {
            "is_real": is_real,
            "confidence": confidence,
            "message": "Image is real" if is_real else "Image appears to be AI-generated",
            "details": {
                "ai_score": result.get("ai_score", 0.0),
                "real_score": result.get("real_score", 0.0),
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error verifying image: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to verify image: {str(e)}"
        )
