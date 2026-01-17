"""Zone models for AI-calculated danger areas."""
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict


class ZoneCreate(BaseModel):
    """Schema for creating/updating a zone."""
    center_latitude: float = Field(..., ge=-90, le=90, description="Center latitude")
    center_longitude: float = Field(..., ge=-180, le=180, description="Center longitude")
    radius_meters: float = Field(..., gt=0, description="Radius in meters")
    threat_level: str = Field(..., description="Threat level: low, medium, high, critical")
    species: Optional[str] = Field(None, description="Primary species in this zone")
    metadata: Optional[dict] = Field(default_factory=dict, description="Additional zone metadata")


class Zone(BaseModel):
    """Schema for zone response."""
    id: int
    center_latitude: float
    center_longitude: float
    radius_meters: float
    threat_level: str
    species: Optional[str] = None
    metadata: Optional[dict] = None
    created_at: datetime
    updated_at: datetime
    
    model_config = ConfigDict(from_attributes=True)
