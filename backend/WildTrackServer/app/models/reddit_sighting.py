"""Reddit sighting models for wildlife data from Reddit."""
from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


class RedditSightingCreate(BaseModel):
    """Schema for creating a Reddit sighting - all fields optional except reddit_id and reddit_url."""
    reddit_id: str = Field(..., description="Reddit post ID")
    title: Optional[str] = Field(None, description="Reddit post title")
    content: Optional[str] = Field(None, description="Post content")
    species: Optional[List[str]] = Field(None, description="List of species names found")
    location_name: Optional[str] = Field(None, description="Location name")
    latitude: Optional[float] = Field(None, description="GPS latitude")
    longitude: Optional[float] = Field(None, description="GPS longitude")
    full_address: Optional[str] = Field(None, description="Full geocoded address")
    timestamp: Optional[datetime] = Field(None, description="When the sighting was reported")
    reddit_url: str = Field(..., description="URL to Reddit post")
    subreddit: Optional[str] = Field(None, description="Subreddit name")
    score: int = Field(0, description="Reddit post score")
    num_comments: int = Field(0, description="Number of comments")
    raw_data: Optional[Dict[str, Any]] = Field(None, description="Raw Reddit post data (JSON)")
    metadata: Optional[Dict[str, Any]] = Field(None, description="Additional processed metadata (JSON)")


class RedditSighting(BaseModel):
    """Schema for Reddit sighting response - flexible schema."""
    id: str
    reddit_id: str
    title: Optional[str] = None
    content: Optional[str] = None
    species: Optional[List[str]] = None
    location_name: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    full_address: Optional[str] = None
    timestamp: Optional[datetime] = None
    reddit_url: str
    subreddit: Optional[str] = None
    score: int = 0
    num_comments: int = 0
    raw_data: Optional[Dict[str, Any]] = None
    metadata: Optional[Dict[str, Any]] = None
    created_at: datetime
    updated_at: datetime
    
    model_config = {"from_attributes": True}
