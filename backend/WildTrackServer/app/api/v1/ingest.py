"""Ingestion API endpoint for receiving animal sightings."""
from typing import List
from collections import Counter
from fastapi import APIRouter, HTTPException, status, Request, Depends
from slowapi import Limiter
from slowapi.util import get_remote_address
from app.models.observation import Observation, ObservationCreate
from app.database import get_admin_supabase_client
from app.auth import require_field_researcher
from app.models.zone_retraining import check_and_trigger_retraining

router = APIRouter()

# Maximum observations per request (prevent memory exhaustion)
MAX_OBSERVATIONS_PER_REQUEST = 1000


@router.post("/ingest", response_model=List[Observation], status_code=status.HTTP_201_CREATED)
async def ingest_observations(
    request: Request,
    observations: List[ObservationCreate],
    current_user: dict = Depends(require_field_researcher)
):
    """
    Ingest a list of animal sightings into the database.
    
    This endpoint receives raw GPS pings from the data collection system
    and stores them in the observations table.
    
    Rate Limit: 100 requests per minute per IP address (configured via SlowAPIMiddleware)
    Max Observations: 1000 per request
    
    Uses service role key to bypass RLS policies (admin-only operation).
    """
    # Rate limiting is automatically enforced by SlowAPIMiddleware configured in main.py
    # Validate list is not empty
    if not observations:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Empty observations list. At least one observation is required."
        )
    
    # Validate list size to prevent memory exhaustion and abuse
    if len(observations) > MAX_OBSERVATIONS_PER_REQUEST:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Too many observations. Maximum {MAX_OBSERVATIONS_PER_REQUEST} observations per request. Received {len(observations)}."
        )
    
    supabase = get_admin_supabase_client()
    
    # Prepare data for insertion
    records = []
    for idx, obs in enumerate(observations):
        try:
            record = {
                "animal_id": obs.animal_id.strip() if obs.animal_id else obs.animal_id,
                "latitude": float(obs.latitude),
                "longitude": float(obs.longitude),
                "timestamp": obs.timestamp.isoformat(),
                "species": obs.species.strip() if obs.species else obs.species,
                "metadata": obs.metadata or {}
            }
            records.append(record)
        except (ValueError, AttributeError) as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid data in observation at index {idx}: {str(e)}"
            )
    
    try:
        # Insert observations into Supabase
        response = supabase.table("observations").insert(records).execute()
        
        if not response.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to insert observations into database"
            )
        
        # Convert response data to Observation models
        created_observations = [
            Observation(**item) for item in response.data
        ]

        # Check if retraining threshold is met and trigger if needed
        # Count observations by species for per-species threshold tracking
        try:
            species_counts = Counter(obs.species for obs in observations if obs.species)
            # Use the most common species for per-species threshold check
            if species_counts:
                most_common_species = species_counts.most_common(1)[0][0]
                check_and_trigger_retraining(
                    observation_count=len(observations),
                    species=most_common_species
                )
            else:
                check_and_trigger_retraining(observation_count=len(observations))
        except Exception as e:
            # Don't fail the ingestion if retraining check fails
            print(f"Warning: Retraining check failed: {e}")

        return created_observations
        
    except HTTPException:
        # Re-raise HTTP exceptions as-is
        raise
    except ValueError as e:
        # Handle validation errors from Supabase
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Data validation error: {str(e)}"
        )
    except Exception as e:
        # Generic error handling - don't expose internal details in production
        error_msg = str(e)
        # Check for RLS or auth errors
        if "row-level security" in error_msg.lower() or "permission denied" in error_msg.lower():
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Permission denied. Check service role key configuration."
            )
        # For other errors, provide generic message
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred while processing the request. Please try again later."
        )
