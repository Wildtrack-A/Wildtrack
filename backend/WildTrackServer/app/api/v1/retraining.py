"""Retraining API endpoint for zone model management."""
from fastapi import APIRouter, HTTPException, Depends
from app.auth import require_field_researcher
from app.models.zone_retraining import (
    get_retraining_status,
    retrain_zones_model,
    reset_observation_counters,
    GLOBAL_THRESHOLD,
    PER_SPECIES_THRESHOLD
)

router = APIRouter()


@router.get("/retraining/status/public")
async def get_status_public():
    """
    Get the current status of zone model retraining (public, no auth required).
    Useful for monitoring dashboards.
    """
    try:
        status = get_retraining_status()
        status["thresholds"] = {
            "global": GLOBAL_THRESHOLD,
            "per_species": PER_SPECIES_THRESHOLD
        }
        return status
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/retraining/status")
async def get_status(current_user: dict = Depends(require_field_researcher)):
    """
    Get the current status of zone model retraining.

    Returns:
        - is_retraining: Whether a retraining job is currently running
        - observations_since_last_training: Count of new observations
        - global_threshold: Threshold that triggers automatic retraining
        - progress_percent: Progress towards threshold
        - remaining_until_retrain: Observations needed before automatic retrain
        - last_training_timestamp: When the model was last trained
        - last_training_result: Result of the last training attempt
    """
    try:
        status = get_retraining_status()
        status["thresholds"] = {
            "global": GLOBAL_THRESHOLD,
            "per_species": PER_SPECIES_THRESHOLD
        }
        return status
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/retraining/trigger")
async def trigger_retraining(
    background: bool = True,
    current_user: dict = Depends(require_field_researcher)
):
    """
    Manually trigger zone model retraining.

    Args:
        background: If True (default), run retraining in background.
                   If False, wait for retraining to complete (may timeout).

    Returns:
        - status: 'started', 'already_running', 'success', or 'error'
        - message: Description of the result
    """
    try:
        result = retrain_zones_model(background=background)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/retraining/reset-counters")
async def reset_counters(
    species: str = None,
    current_user: dict = Depends(require_field_researcher)
):
    """
    Reset observation counters without retraining.
    Useful if you want to manually reset the threshold counter.

    Args:
        species: Optional species name to reset only that species' counter.
                If not provided, resets all counters.
    """
    try:
        reset_observation_counters(species=species)
        return {
            "status": "success",
            "message": f"Counters reset" + (f" for {species}" if species else " (all)")
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
