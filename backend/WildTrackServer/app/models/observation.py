"""Observation models for raw GPS pings."""
from datetime import datetime
from typing import Optional
import re
from pydantic import BaseModel, Field, ConfigDict, field_validator, ValidationInfo


class ObservationCreate(BaseModel):
    """Schema for creating a new observation."""
    animal_id: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="Unique identifier for the animal"
    )
    latitude: float = Field(
        ...,
        ge=-90,
        le=90,
        description="Latitude in decimal degrees"
    )
    longitude: float = Field(
        ...,
        ge=-180,
        le=180,
        description="Longitude in decimal degrees"
    )
    timestamp: datetime = Field(
        default_factory=datetime.utcnow,
        description="Timestamp of the observation"
    )
    species: Optional[str] = Field(
        None,
        max_length=200,
        description="Species name"
    )
    metadata: Optional[dict] = Field(
        default_factory=dict,
        description="Additional metadata (max 10KB when serialized)"
    )
    
    @field_validator('animal_id')
    @classmethod
    def validate_animal_id(cls, v: str) -> str:
        """Validate animal_id format (alphanumeric, underscores, hyphens only)."""
        if not re.match(r'^[a-zA-Z0-9_-]+$', v):
            raise ValueError("animal_id must contain only alphanumeric characters, underscores, and hyphens")
        return v
    
    @field_validator('metadata')
    @classmethod
    def validate_metadata_size(cls, v: dict, info: ValidationInfo) -> dict:
        """Ensure metadata doesn't exceed reasonable size."""
        if v:
            import json
            serialized = json.dumps(v)
            if len(serialized.encode('utf-8')) > 10240:  # 10KB limit
                raise ValueError("Metadata exceeds maximum size of 10KB")
            # Limit number of keys
            if len(v) > 50:
                raise ValueError("Metadata cannot have more than 50 keys")
        return v


class Observation(BaseModel):
    """Schema for observation response."""
    id: int
    animal_id: str
    latitude: float
    longitude: float
    timestamp: datetime
    species: Optional[str] = None
    metadata: Optional[dict] = None
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)
