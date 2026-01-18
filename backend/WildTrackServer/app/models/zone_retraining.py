"""
Zone Retraining Service

Handles automatic retraining of DBSCAN zone model when observation thresholds are met.
Supports both global threshold (1000 total new observations) and per-species threshold.
"""

import os
import threading
from datetime import datetime
from typing import Optional, Dict, Any
from app.database import get_admin_supabase_client
from app.models.dbscan_db import load_from_supabase, train_model, load_zones

# Configuration
GLOBAL_THRESHOLD = 1000  # Retrain after 1000 new observations total
PER_SPECIES_THRESHOLD = 100  # Retrain species zones after 100 new observations of that species
MODEL_PATH = 'app/models/wildtrack_zones_dbscan.pkl'
MODEL_BACKUP_PATH = 'app/models/wildtrack_zones_dbscan_backup.pkl'

# Lock to prevent concurrent retraining
_retraining_lock = threading.Lock()
_is_retraining = False


def ensure_metadata_table():
    """Create model_metadata table if it doesn't exist."""
    supabase = get_admin_supabase_client()

    # Check if table exists by trying to query it
    try:
        supabase.table("model_metadata").select("key").limit(1).execute()
        return True
    except Exception:
        # Table doesn't exist - it needs to be created via SQL
        return False


def get_metadata(key: str) -> Optional[Dict[str, Any]]:
    """Get a metadata value from the model_metadata table."""
    supabase = get_admin_supabase_client()

    try:
        response = supabase.table("model_metadata").select("*").eq("key", key).execute()
        if response.data and len(response.data) > 0:
            return response.data[0]
        return None
    except Exception as e:
        print(f"Error getting metadata '{key}': {e}")
        return None


def set_metadata(key: str, value: Any, metadata: Optional[Dict] = None):
    """Set a metadata value in the model_metadata table."""
    supabase = get_admin_supabase_client()

    data = {
        "key": key,
        "value": value,
        "updated_at": datetime.utcnow().isoformat(),
    }
    if metadata:
        data["metadata"] = metadata

    try:
        # Try upsert
        supabase.table("model_metadata").upsert(data, on_conflict="key").execute()
    except Exception as e:
        print(f"Error setting metadata '{key}': {e}")


def increment_observation_count(count: int = 1, species: Optional[str] = None):
    """
    Increment the observation counter and check if retraining is needed.

    Args:
        count: Number of observations to add
        species: Optional species name for per-species tracking

    Returns:
        dict with 'needs_retraining' and 'reason' if threshold met
    """
    supabase = get_admin_supabase_client()

    # Increment global counter
    global_key = "observations_since_last_training"
    current = get_metadata(global_key)
    current_count = int(current["value"]) if current else 0
    new_count = current_count + count
    set_metadata(global_key, new_count)

    # Increment per-species counter if species provided
    if species:
        species_key = f"observations_since_training_{species.replace(' ', '_').lower()}"
        species_current = get_metadata(species_key)
        species_count = int(species_current["value"]) if species_current else 0
        new_species_count = species_count + count
        set_metadata(species_key, new_species_count)

        # Check per-species threshold
        if new_species_count >= PER_SPECIES_THRESHOLD:
            return {
                "needs_retraining": True,
                "reason": f"per_species_threshold",
                "species": species,
                "count": new_species_count
            }

    # Check global threshold
    if new_count >= GLOBAL_THRESHOLD:
        return {
            "needs_retraining": True,
            "reason": "global_threshold",
            "count": new_count
        }

    return {
        "needs_retraining": False,
        "global_count": new_count,
        "remaining": GLOBAL_THRESHOLD - new_count
    }


def reset_observation_counters(species: Optional[str] = None):
    """Reset observation counters after successful retraining."""
    if species:
        # Reset only the specific species counter
        species_key = f"observations_since_training_{species.replace(' ', '_').lower()}"
        set_metadata(species_key, 0)
    else:
        # Reset global counter
        set_metadata("observations_since_last_training", 0)

        # Reset all species counters
        supabase = get_admin_supabase_client()
        try:
            response = supabase.table("model_metadata").select("key").like("key", "observations_since_training_%").execute()
            if response.data:
                for row in response.data:
                    set_metadata(row["key"], 0)
        except Exception as e:
            print(f"Error resetting species counters: {e}")


def get_retraining_status() -> Dict[str, Any]:
    """Get current retraining status and counters."""
    global _is_retraining

    global_meta = get_metadata("observations_since_last_training")
    last_training = get_metadata("last_training_timestamp")
    last_training_result = get_metadata("last_training_result")

    global_count = int(global_meta["value"]) if global_meta else 0

    return {
        "is_retraining": _is_retraining,
        "observations_since_last_training": global_count,
        "global_threshold": GLOBAL_THRESHOLD,
        "progress_percent": round((global_count / GLOBAL_THRESHOLD) * 100, 1),
        "remaining_until_retrain": max(0, GLOBAL_THRESHOLD - global_count),
        "last_training_timestamp": last_training["value"] if last_training else None,
        "last_training_result": last_training_result["value"] if last_training_result else None,
    }


def retrain_zones_model(background: bool = True) -> Dict[str, Any]:
    """
    Trigger zone model retraining.

    Args:
        background: If True, run retraining in background thread

    Returns:
        Status dict with training info
    """
    global _is_retraining

    if _is_retraining:
        return {
            "status": "already_running",
            "message": "A retraining job is already in progress"
        }

    if background:
        thread = threading.Thread(target=_do_retrain, daemon=True)
        thread.start()
        return {
            "status": "started",
            "message": "Retraining job started in background"
        }
    else:
        return _do_retrain()


def _do_retrain() -> Dict[str, Any]:
    """Internal function to perform the actual retraining."""
    global _is_retraining

    with _retraining_lock:
        if _is_retraining:
            return {"status": "already_running"}
        _is_retraining = True

    start_time = datetime.utcnow()
    result = {
        "status": "unknown",
        "started_at": start_time.isoformat()
    }

    try:
        print(f"[{start_time}] Starting zone model retraining...")

        # Set training status
        set_metadata("training_status", "in_progress", {"started_at": start_time.isoformat()})

        # Backup existing model
        if os.path.exists(MODEL_PATH):
            import shutil
            shutil.copy(MODEL_PATH, MODEL_BACKUP_PATH)
            print(f"  Backed up existing model to {MODEL_BACKUP_PATH}")

        # Load fresh data from Supabase
        print("  Loading data from Supabase...")
        gps_data, species_list, timestamps = load_from_supabase()

        if not gps_data:
            raise ValueError("No data found in Supabase observations table")

        print(f"  Loaded {len(gps_data)} observations for {len(set(species_list))} species")

        # Train new model
        print("  Training DBSCAN model...")
        zones = train_model(
            gps_data=gps_data,
            species_list=species_list,
            eps_km=100,
            save_path=MODEL_PATH
        )

        end_time = datetime.utcnow()
        duration = (end_time - start_time).total_seconds()

        # Update result
        result = {
            "status": "success",
            "started_at": start_time.isoformat(),
            "completed_at": end_time.isoformat(),
            "duration_seconds": duration,
            "total_observations": len(gps_data),
            "total_zones": zones['n_zones'],
            "unique_species": len(zones['unique_species']),
            "model_path": MODEL_PATH
        }

        # Reset counters
        reset_observation_counters()

        # Save training result metadata
        set_metadata("last_training_timestamp", end_time.isoformat())
        set_metadata("last_training_result", "success", result)
        set_metadata("training_status", "idle")

        print(f"[{end_time}] Retraining completed successfully in {duration:.1f}s")
        print(f"  Created {zones['n_zones']} zones for {len(zones['unique_species'])} species")

    except Exception as e:
        end_time = datetime.utcnow()
        error_msg = str(e)

        result = {
            "status": "error",
            "started_at": start_time.isoformat(),
            "completed_at": end_time.isoformat(),
            "error": error_msg
        }

        # Try to restore backup
        if os.path.exists(MODEL_BACKUP_PATH):
            try:
                import shutil
                shutil.copy(MODEL_BACKUP_PATH, MODEL_PATH)
                print(f"  Restored backup model from {MODEL_BACKUP_PATH}")
                result["backup_restored"] = True
            except Exception as restore_error:
                result["backup_restore_error"] = str(restore_error)

        set_metadata("last_training_result", "error", result)
        set_metadata("training_status", "idle")

        print(f"[{end_time}] Retraining failed: {error_msg}")

    finally:
        with _retraining_lock:
            _is_retraining = False

    return result


def check_and_trigger_retraining(observation_count: int = 1, species: Optional[str] = None) -> Dict[str, Any]:
    """
    Check if retraining is needed and trigger it if threshold is met.
    This is the main function to call after ingesting observations.

    Args:
        observation_count: Number of observations just ingested
        species: Species name (for per-species threshold tracking)

    Returns:
        Status dict
    """
    # Increment counter and check threshold
    check_result = increment_observation_count(observation_count, species)

    if check_result.get("needs_retraining"):
        # Trigger background retraining
        retrain_result = retrain_zones_model(background=True)
        return {
            "threshold_check": check_result,
            "retraining": retrain_result
        }

    return {
        "threshold_check": check_result,
        "retraining": None
    }
