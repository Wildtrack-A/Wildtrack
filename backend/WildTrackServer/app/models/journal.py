"""Journal and Log models for user journals and animal logs."""
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field


class AnimalLogCreate(BaseModel):
    """Schema for creating a new animal log."""
    species: str = Field(..., min_length=1, max_length=200, description="Species name")
    description: Optional[str] = Field(None, max_length=250, description="Description of the animal")
    photo_uri: Optional[str] = Field(None, description="URI of the photo")
    journal_id: str = Field(..., description="ID of the journal this log belongs to")


class AnimalLog(BaseModel):
    """Schema for animal log response."""
    id: str
    species: str
    description: Optional[str] = None
    photo_uri: Optional[str] = None
    timestamp: datetime
    journal_id: str
    created_at: datetime
    
    model_config = {"from_attributes": True}


class AnimalLogUpdate(BaseModel):
    """Schema for updating an animal log."""
    species: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=250)
    photo_uri: Optional[str] = None


class JournalCreate(BaseModel):
    """Schema for creating a new journal."""
    name: str = Field(..., min_length=1, max_length=200, description="Journal name")


class Journal(BaseModel):
    """Schema for journal response."""
    id: str
    name: str
    created_at: datetime
    logs: List[AnimalLog] = []
    
    model_config = {"from_attributes": True}


class JournalUpdate(BaseModel):
    """Schema for updating a journal."""
    name: Optional[str] = Field(None, min_length=1, max_length=200)
