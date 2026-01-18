"""
AI Image Detector Service
Detects if an uploaded image is AI-generated or fake.
"""
from transformers import pipeline
from PIL import Image
import io
from typing import Dict, Any
import logging

logger = logging.getLogger(__name__)

# Global detector instance (lazy loaded)
_detector = None


def get_detector():
    """Get or create the AI image detector pipeline."""
    global _detector
    if _detector is None:
        try:
            logger.info("Loading AI image detector model...")
            _detector = pipeline(
                task="image-classification",
                model="umm-maybe/AI-image-detector",
                device=-1  # Use CPU (set to 0 for GPU if available)
            )
            logger.info("✅ AI image detector loaded successfully")
        except Exception as e:
            logger.error(f"❌ Failed to load AI image detector: {e}")
            raise
    return _detector


def detect_ai_image(image_data: bytes) -> Dict[str, Any]:
    """
    Detect if an image is AI-generated or fake.
    
    Args:
        image_data: Image file bytes
        
    Returns:
        Dictionary with:
        - is_ai: bool - True if image is detected as AI-generated
        - confidence: float - Confidence score (0-1)
        - details: list - Full classification results
    """
    try:
        # Load detector
        detector = get_detector()
        
        # Convert bytes to PIL Image
        image = Image.open(io.BytesIO(image_data)).convert("RGB")
        
        # Run detection
        results = detector(image)
        
        # Parse results
        # The model returns a list of predictions with labels and scores
        # We need to check if "AI-generated" or similar label has high confidence
        is_ai = False
        confidence = 0.0
        ai_score = 0.0
        real_score = 0.0
        
        for result in results:
            label = result.get("label", "").lower()
            score = result.get("score", 0.0)
            
            # Check for AI-related labels
            if any(keyword in label for keyword in ["ai", "artificial", "generated", "fake", "synthetic"]):
                ai_score = score
                if score > confidence:
                    confidence = score
                    is_ai = score > 0.5  # Threshold: if AI confidence > 50%, consider it fake
            elif any(keyword in label for keyword in ["real", "human", "natural", "authentic"]):
                real_score = score
        
        # If we have both scores, use the higher one
        if ai_score > real_score:
            is_ai = ai_score > 0.5
            confidence = ai_score
        else:
            is_ai = False
            confidence = real_score
        
        return {
            "is_ai": is_ai,
            "confidence": confidence,
            "ai_score": ai_score,
            "real_score": real_score,
            "details": results
        }
        
    except Exception as e:
        logger.error(f"Error detecting AI image: {e}")
        # If detection fails, we'll allow the image (fail open)
        # You can change this to fail closed if preferred
        return {
            "is_ai": False,
            "confidence": 0.0,
            "error": str(e),
            "details": []
        }
