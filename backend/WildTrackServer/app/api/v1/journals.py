"""Journal and Log API endpoints for user journals and animal logs."""
from typing import List
from fastapi import APIRouter, HTTPException, status, Depends
from app.models.journal import (
    Journal,
    JournalCreate,
    JournalUpdate,
    AnimalLog,
    AnimalLogCreate,
    AnimalLogUpdate
)
from app.database import get_admin_supabase_client
from app.auth import get_current_user
from datetime import datetime

router = APIRouter()


@router.get("/journals", response_model=List[Journal], status_code=status.HTTP_200_OK)
async def get_journals(current_user: dict = Depends(get_current_user)):
    """
    Get all journals with their logs for the authenticated user.
    
    Returns a list of all journals belonging to the authenticated user, each containing its associated logs.
    """
    # Extract user ID from current user
    user_id = current_user["id"]
    
    supabase = get_admin_supabase_client()
    
    try:
        # Get all journals for this user only
        journals_response = supabase.table("journals").select("*").eq("user_id", user_id).order("created_at", desc=True).execute()
        
        if not journals_response.data:
            return []
        
        # Get all logs for journals belonging to this user
        journal_ids = [str(j["id"]) for j in journals_response.data] if journals_response.data else []
        logs_data = []
        if journal_ids:
            logs_response = supabase.table("logs").select("*").in_("journal_id", journal_ids).order("timestamp", desc=True).execute()
            logs_data = logs_response.data if logs_response.data else []
        
        # Group logs by journal_id
        journals_with_logs = []
        for journal_data in journals_response.data:
            # Convert journal data
            journal_logs = [
                AnimalLog(
                    id=str(log["id"]),
                    species=log["species"],
                    description=log.get("description"),
                    photo_uri=log.get("photo_uri"),
                    latitude=log.get("latitude"),
                    longitude=log.get("longitude"),
                    timestamp=datetime.fromisoformat(log["timestamp"].replace("Z", "+00:00")),
                    journal_id=str(log["journal_id"]),
                    created_at=datetime.fromisoformat(log["created_at"].replace("Z", "+00:00"))
                )
                for log in logs_data
                if str(log["journal_id"]) == str(journal_data["id"])
            ]
            
            journal = Journal(
                id=str(journal_data["id"]),
                name=journal_data["name"],
                user_id=journal_data.get("user_id"),
                created_at=datetime.fromisoformat(journal_data["created_at"].replace("Z", "+00:00")),
                logs=journal_logs
            )
            journals_with_logs.append(journal)
        
        return journals_with_logs
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch journals: {str(e)}"
        )


@router.post("/journals", response_model=Journal, status_code=status.HTTP_201_CREATED)
async def create_journal(journal: JournalCreate, current_user: dict = Depends(get_current_user)):
    """
    Create a new journal for the authenticated user.
    
    Creates a new journal with the provided name, automatically associated with the authenticated user.
    """
    # Extract user ID from current user
    user_id = current_user["id"]
    
    try:
        supabase = get_admin_supabase_client()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database connection error: {str(e)}"
        )
    
    try:
        # Generate ID (using timestamp as string for compatibility with frontend)
        journal_id = str(int(datetime.utcnow().timestamp() * 1000))
        created_at = datetime.utcnow().isoformat()
        
        record = {
            "id": journal_id,
            "name": journal.name.strip(),
            "user_id": user_id,
            "created_at": created_at
        }
        
        print(f"Attempting to insert journal: {record}")  # Debug log
        response = supabase.table("journals").insert(record).execute()
        print(f"Supabase response: {response}")  # Debug log
        
        if not response.data:
            error_msg = getattr(response, 'error', None) or "No data returned from database"
            print(f"Error: {error_msg}")  # Debug log
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to create journal: {error_msg}"
            )
        
        journal_data = response.data[0]
        return Journal(
            id=str(journal_data["id"]),
            name=journal_data["name"],
            user_id=journal_data.get("user_id"),
            created_at=datetime.fromisoformat(journal_data["created_at"].replace("Z", "+00:00")),
            logs=[]
        )
        
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"Exception in create_journal: {error_trace}")  # Debug log
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create journal: {str(e)}"
        )


@router.put("/journals/{journal_id}", response_model=Journal, status_code=status.HTTP_200_OK)
async def update_journal(journal_id: str, journal_update: JournalUpdate, current_user: dict = Depends(get_current_user)):
    """
    Update a journal.
    
    Updates the journal name. Only the journal owner can update it.
    """
    # Extract user ID from current user
    user_id = current_user["id"]
    
    supabase = get_admin_supabase_client()
    
    try:
        # Verify journal exists and belongs to user
        journal_check = supabase.table("journals").select("id, user_id").eq("id", journal_id).execute()
        if not journal_check.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Journal not found"
            )
        
        if journal_check.data[0].get("user_id") != user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't have permission to update this journal"
            )
        
        update_data = {}
        if journal_update.name is not None:
            update_data["name"] = journal_update.name.strip()
        
        if not update_data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No fields to update"
            )
        
        response = supabase.table("journals").update(update_data).eq("id", journal_id).eq("user_id", user_id).execute()
        
        if not response.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Journal not found"
            )
        
        journal_data = response.data[0]
        
        # Get logs for this journal
        logs_response = supabase.table("logs").select("*").eq("journal_id", journal_id).order("timestamp", desc=True).execute()
        logs_data = logs_response.data if logs_response.data else []
        
        journal_logs = [
            AnimalLog(
                id=str(log["id"]),
                species=log["species"],
                description=log.get("description"),
                photo_uri=log.get("photo_uri"),
                latitude=log.get("latitude"),
                longitude=log.get("longitude"),
                timestamp=datetime.fromisoformat(log["timestamp"].replace("Z", "+00:00")),
                journal_id=str(log["journal_id"]),
                created_at=datetime.fromisoformat(log["created_at"].replace("Z", "+00:00"))
            )
            for log in logs_data
        ]
        
        return Journal(
            id=str(journal_data["id"]),
            name=journal_data["name"],
            user_id=journal_data.get("user_id"),
            created_at=datetime.fromisoformat(journal_data["created_at"].replace("Z", "+00:00")),
            logs=journal_logs
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update journal: {str(e)}"
        )


@router.delete("/journals/{journal_id}", status_code=status.HTTP_200_OK)
async def delete_journal(journal_id: str, current_user: dict = Depends(get_current_user)):
    """
    Delete a journal and all its logs.
    
    This will cascade delete all logs associated with the journal. Only the journal owner can delete it.
    """
    # Extract user ID from current user
    user_id = current_user["id"]
    
    supabase = get_admin_supabase_client()
    
    try:
        # Verify journal exists and belongs to user
        journal_check = supabase.table("journals").select("id, user_id").eq("id", journal_id).execute()
        if not journal_check.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Journal not found"
            )
        
        if journal_check.data[0].get("user_id") != user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't have permission to delete this journal"
            )
        
        # Delete journal - CASCADE delete will automatically delete associated logs
        # This is faster than deleting logs first, then journal
        # Note: Supabase DELETE may return empty data even on success
        response = supabase.table("journals").delete().eq("id", journal_id).eq("user_id", user_id).execute()
        
        # Supabase will raise an error if delete fails, so if we get here, it succeeded
        # Even if response.data is empty, the deletion was successful
        return {"message": "Journal deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete journal: {str(e)}"
        )


@router.post("/journals/{journal_id}/logs", response_model=AnimalLog, status_code=status.HTTP_201_CREATED)
async def create_log(journal_id: str, log: AnimalLogCreate, current_user: dict = Depends(get_current_user)):
    """
    Create a new log entry in a journal.
    
    Creates a new animal log entry associated with the specified journal. Only the journal owner can add logs.
    """
    # Extract user ID from current user
    user_id = current_user["id"]
    
    supabase = get_admin_supabase_client()
    
    try:
        # Verify journal exists and belongs to user
        journal_check = supabase.table("journals").select("id, user_id").eq("id", journal_id).execute()
        if not journal_check.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Journal not found"
            )
        
        if journal_check.data[0].get("user_id") != user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't have permission to add logs to this journal"
            )
        
        # Generate ID
        log_id = str(int(datetime.utcnow().timestamp() * 1000))
        timestamp = datetime.utcnow().isoformat()
        created_at = datetime.utcnow().isoformat()
        
        record = {
            "id": log_id,
            "journal_id": journal_id,
            "species": log.species.strip(),
            "description": log.description.strip() if log.description else None,
            "photo_uri": log.photo_uri,
            "latitude": log.latitude,
            "longitude": log.longitude,
            "timestamp": timestamp,
            "created_at": created_at
        }
        
        response = supabase.table("logs").insert(record).execute()
        
        if not response.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create log"
            )
        
        log_data = response.data[0]
        return AnimalLog(
            id=str(log_data["id"]),
            species=log_data["species"],
            description=log_data.get("description"),
            photo_uri=log_data.get("photo_uri"),
            latitude=log_data.get("latitude"),
            longitude=log_data.get("longitude"),
            timestamp=datetime.fromisoformat(log_data["timestamp"].replace("Z", "+00:00")),
            journal_id=str(log_data["journal_id"]),
            created_at=datetime.fromisoformat(log_data["created_at"].replace("Z", "+00:00"))
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create log: {str(e)}"
        )


@router.put("/logs/{log_id}", response_model=AnimalLog, status_code=status.HTTP_200_OK)
async def update_log(log_id: str, log_update: AnimalLogUpdate, current_user: dict = Depends(get_current_user)):
    """
    Update a log entry.
    
    Updates the species, description, or photo_uri of a log entry. Only the log owner can update it.
    """
    # Extract user ID from current user
    user_id = current_user["id"]
    
    supabase = get_admin_supabase_client()
    
    try:
        # Verify log exists and belongs to user's journal
        log_check = supabase.table("logs").select("id, journal_id").eq("id", log_id).execute()
        if not log_check.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Log not found"
            )
        
        journal_id = log_check.data[0].get("journal_id")
        journal_check = supabase.table("journals").select("user_id").eq("id", journal_id).execute()
        if not journal_check.data or journal_check.data[0].get("user_id") != user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't have permission to update this log"
            )
        
        update_data = {}
        if log_update.species is not None:
            update_data["species"] = log_update.species.strip()
        if log_update.description is not None:
            update_data["description"] = log_update.description.strip() if log_update.description else None
        if log_update.photo_uri is not None:
            update_data["photo_uri"] = log_update.photo_uri
        
        if not update_data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No fields to update"
            )
        
        response = supabase.table("logs").update(update_data).eq("id", log_id).execute()
        
        if not response.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Log not found"
            )
        
        log_data = response.data[0]
        return AnimalLog(
            id=str(log_data["id"]),
            species=log_data["species"],
            description=log_data.get("description"),
            photo_uri=log_data.get("photo_uri"),
            latitude=log_data.get("latitude"),
            longitude=log_data.get("longitude"),
            timestamp=datetime.fromisoformat(log_data["timestamp"].replace("Z", "+00:00")),
            journal_id=str(log_data["journal_id"]),
            created_at=datetime.fromisoformat(log_data["created_at"].replace("Z", "+00:00"))
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update log: {str(e)}"
        )


@router.delete("/logs/{log_id}", status_code=status.HTTP_200_OK)
async def delete_log(log_id: str, current_user: dict = Depends(get_current_user)):
    """
    Delete a log entry.
    
    Permanently deletes the specified log entry. Only the log owner can delete it.
    """
    # Extract user ID from current user
    user_id = current_user["id"]
    
    supabase = get_admin_supabase_client()
    
    try:
        # Verify log exists and belongs to user's journal
        log_check = supabase.table("logs").select("id, journal_id").eq("id", log_id).execute()
        if not log_check.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Log not found"
            )
        
        journal_id = log_check.data[0].get("journal_id")
        journal_check = supabase.table("journals").select("user_id").eq("id", journal_id).execute()
        if not journal_check.data or journal_check.data[0].get("user_id") != user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't have permission to delete this log"
            )
        
        response = supabase.table("logs").delete().eq("id", log_id).execute()
        
        if not response.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Log not found"
            )
        
        return {"message": "Log deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete log: {str(e)}"
        )
