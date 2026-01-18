"""API endpoints for Reddit-sourced wildlife sightings."""
from typing import List, Optional, Dict
from fastapi import APIRouter, HTTPException, status, Query, BackgroundTasks, Request
from app.models.reddit_sighting import RedditSighting
from app.database import get_admin_supabase_client
from datetime import datetime, timedelta
import sys
from pathlib import Path
from collections import defaultdict

# Add scripts directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "scripts"))

router = APIRouter()

# Rate limiting disabled for development
# In production, use Redis or database for distributed systems
# _last_scrape_times: Dict[str, datetime] = {}
# RATE_LIMIT_HOURS = 1


@router.get("/reddit-sightings", response_model=List[RedditSighting], status_code=status.HTTP_200_OK)
async def get_reddit_sightings(
    species: Optional[str] = Query(None, description="Filter by species name"),
    limit: int = Query(100, ge=1, le=500, description="Maximum number of sightings to return"),
    days: int = Query(30, ge=1, le=365, description="Number of days back to search")
):
    """
    Get Reddit-sourced wildlife sightings.
    
    Returns endangered species sightings scraped from Reddit with location and timestamp.
    """
    supabase = get_admin_supabase_client()
    
    try:
        query = supabase.table("reddit_sightings").select("*")
        
        # Filter by species if provided (only if species column has data)
        if species:
            query = query.contains("species", [species.lower()])
        
        # For analytics dashboard, show all posts (don't filter by date)
        # Order by created_at (newest first) since all posts have this, then limit
        query = query.order("created_at", desc=True).limit(limit)
        
        response = query.execute()
        
        if not response.data:
            return []
        
        sightings = []
        for sighting_data in response.data:
            # Helper function to safely parse timestamps
            def parse_timestamp(ts_str):
                if not ts_str:
                    return None
                try:
                    # Replace Z with +00:00 if present
                    ts_str = ts_str.replace("Z", "+00:00")
                    
                    # Normalize microseconds to 6 digits (pad or truncate)
                    if '.' in ts_str and '+' in ts_str:
                        # Split by timezone
                        if '+00:00' in ts_str or '-00:00' in ts_str:
                            timezone = '+00:00'
                        elif '+' in ts_str:
                            timezone = '+' + ts_str.split('+')[1]
                        else:
                            timezone = '+00:00'
                        
                        # Get the part before timezone
                        main_part = ts_str.split('+')[0].split('-')[0] if '+' in ts_str else ts_str.split('-')[0]
                        
                        if '.' in main_part:
                            date_part, microsec_part = main_part.split('.')
                            # Normalize microseconds to exactly 6 digits
                            if len(microsec_part) > 6:
                                microsec_part = microsec_part[:6]
                            elif len(microsec_part) < 6:
                                microsec_part = microsec_part.ljust(6, '0')
                            ts_str = f"{date_part}.{microsec_part}{timezone}"
                    
                    return datetime.fromisoformat(ts_str)
                except (ValueError, AttributeError) as e:
                    # If parsing fails, try simpler approach - just strip microseconds
                    try:
                        if '.' in ts_str:
                            # Remove microseconds entirely
                            base = ts_str.split('.')[0]
                            if '+' in ts_str:
                                timezone = '+' + ts_str.split('+')[1]
                            elif 'Z' in ts_str:
                                timezone = '+00:00'
                            else:
                                timezone = '+00:00'
                            ts_str = f"{base}{timezone}"
                        return datetime.fromisoformat(ts_str)
                    except:
                        # If all else fails, return None
                        return None
            
            # Handle optional timestamp
            timestamp = parse_timestamp(sighting_data.get("timestamp"))
            created_at = parse_timestamp(sighting_data.get("created_at"))
            updated_at = parse_timestamp(sighting_data.get("updated_at"))
            
            # Ensure we have valid timestamps for required fields
            if not created_at:
                created_at = datetime.utcnow()
            if not updated_at:
                updated_at = datetime.utcnow()
            
            sighting = RedditSighting(
                id=str(sighting_data["id"]),
                reddit_id=sighting_data["reddit_id"],
                title=sighting_data.get("title"),
                content=sighting_data.get("content"),
                species=sighting_data.get("species"),
                location_name=sighting_data.get("location_name"),
                latitude=sighting_data.get("latitude"),
                longitude=sighting_data.get("longitude"),
                full_address=sighting_data.get("full_address"),
                timestamp=timestamp,
                reddit_url=sighting_data["reddit_url"],
                subreddit=sighting_data.get("subreddit"),
                score=sighting_data.get("score", 0),
                num_comments=sighting_data.get("num_comments", 0),
                raw_data=sighting_data.get("raw_data"),
                metadata=sighting_data.get("metadata"),
                created_at=created_at,
                updated_at=updated_at
            )
            sightings.append(sighting)
        
        return sightings
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch Reddit sightings: {str(e)}"
        )


@router.get("/reddit-sightings/{sighting_id}", response_model=RedditSighting, status_code=status.HTTP_200_OK)
async def get_reddit_sighting(sighting_id: str):
    """Get a specific Reddit sighting by ID."""
    supabase = get_admin_supabase_client()
    
    try:
        response = supabase.table("reddit_sightings").select("*").eq("id", sighting_id).execute()
        
        if not response.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Sighting not found"
            )
        
        sighting_data = response.data[0]
        
        # Helper function to safely parse timestamps
        def parse_timestamp(ts_str):
            if not ts_str:
                return None
            try:
                ts_str = ts_str.replace("Z", "+00:00")
                
                # Normalize microseconds to 6 digits
                if '.' in ts_str and '+' in ts_str:
                    if '+00:00' in ts_str:
                        timezone = '+00:00'
                    else:
                        timezone = '+' + ts_str.split('+')[1]
                    main_part = ts_str.split('+')[0]
                    
                    if '.' in main_part:
                        date_part, microsec_part = main_part.split('.')
                        if len(microsec_part) > 6:
                            microsec_part = microsec_part[:6]
                        elif len(microsec_part) < 6:
                            microsec_part = microsec_part.ljust(6, '0')
                        ts_str = f"{date_part}.{microsec_part}{timezone}"
                
                return datetime.fromisoformat(ts_str)
            except (ValueError, AttributeError):
                try:
                    # Fallback: remove microseconds
                    if '.' in ts_str:
                        base = ts_str.split('.')[0]
                        timezone = '+00:00' if 'Z' in ts_str or '+00:00' in ts_str else ('+' + ts_str.split('+')[1] if '+' in ts_str else '+00:00')
                        ts_str = f"{base}{timezone}"
                    return datetime.fromisoformat(ts_str)
                except:
                    return None
        
        timestamp = parse_timestamp(sighting_data.get("timestamp"))
        created_at = parse_timestamp(sighting_data.get("created_at")) or datetime.utcnow()
        updated_at = parse_timestamp(sighting_data.get("updated_at")) or datetime.utcnow()
        
        return RedditSighting(
            id=str(sighting_data["id"]),
            reddit_id=sighting_data["reddit_id"],
            title=sighting_data.get("title"),
            content=sighting_data.get("content"),
            species=sighting_data.get("species"),
            location_name=sighting_data.get("location_name"),
            latitude=sighting_data.get("latitude"),
            longitude=sighting_data.get("longitude"),
            full_address=sighting_data.get("full_address"),
            timestamp=timestamp,
            reddit_url=sighting_data["reddit_url"],
            subreddit=sighting_data.get("subreddit"),
            score=sighting_data.get("score", 0),
            num_comments=sighting_data.get("num_comments", 0),
            raw_data=sighting_data.get("raw_data"),
            metadata=sighting_data.get("metadata"),
            created_at=created_at,
            updated_at=updated_at
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch sighting: {str(e)}"
        )


def run_scraper_background():
    """Background task to run the Reddit scraper. Only saves sightings with valid coordinates."""
    try:
        from scripts.scrape_reddit_wildlife import RedditWildlifeScraper
        from scripts.save_reddit_sightings import save_sightings_to_db
        
        scraper = RedditWildlifeScraper()
        # Scrape until we get up to 50 sightings with valid location coordinates
        sightings = scraper.scrape_all(max_total=50, limit_per_subreddit=100)
        
        if sightings:
            save_sightings_to_db(sightings)
            print(f"✅ Background scraper completed: {len(sightings)} sightings with locations saved")
        else:
            print("ℹ️ Background scraper completed: No sightings with valid locations found")
    except Exception as e:
        print(f"❌ Error in background scraper: {e}")


@router.post("/reddit-sightings/scrape", status_code=status.HTTP_202_ACCEPTED)
async def trigger_scraper(request: Request, background_tasks: BackgroundTasks):
    """
    Trigger Reddit scraper to fetch new wildlife sightings.
    
    Rate limiting disabled for development.
    This endpoint runs the scraper in the background and returns immediately.
    The scraper will fetch posts from wildlife subreddits and save them to the database.
    
    Returns:
        Message confirming the scraper has been started
    """
    # Rate limiting disabled - removed for development
    # In production, re-enable rate limiting to prevent abuse
    
    # Add the scraper task to run in the background
    background_tasks.add_task(run_scraper_background)
    
    return {
        "message": "Reddit scraper started in background",
        "status": "processing",
        "note": "New sightings will appear in the database when complete."
    }
