"""
Test script to add sample Reddit sightings without needing Reddit API.

Use this to test the system while setting up Reddit API credentials.
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.database import get_admin_supabase_client
from datetime import datetime, timedelta
import uuid

# Sample Reddit sightings data for testing
SAMPLE_SIGHTINGS = [
    {
        "reddit_id": "test_001",
        "title": "Saw an endangered tiger in Yosemite National Park!",
        "content": "Amazing sighting today. The tiger was near the trail. Very rare!",
        "species": ["Tiger"],
        "location": {
            "name": "Yosemite National Park",
            "latitude": 37.8651,
            "longitude": -119.5383,
            "full_address": "Yosemite National Park, CA, USA"
        },
        "timestamp": datetime.now() - timedelta(days=2),
        "url": "https://reddit.com/r/wildlife/test_001",
        "subreddit": "wildlife",
        "score": 45,
        "num_comments": 12,
    },
    {
        "reddit_id": "test_002",
        "title": "Elephant spotted in Serengeti",
        "content": "Incredible experience seeing this majestic creature in the wild.",
        "species": ["Elephant"],
        "location": {
            "name": "Serengeti National Park",
            "latitude": -2.3333,
            "longitude": 34.8333,
            "full_address": "Serengeti National Park, Tanzania"
        },
        "timestamp": datetime.now() - timedelta(days=5),
        "url": "https://reddit.com/r/nature/test_002",
        "subreddit": "nature",
        "score": 128,
        "num_comments": 23,
    },
    {
        "reddit_id": "test_003",
        "title": "Rare sea turtle nesting site discovered",
        "content": "Found a nesting area for endangered sea turtles. Location kept private for protection.",
        "species": ["Sea Turtle"],
        "location": {
            "name": "Costa Rica",
            "latitude": 9.7489,
            "longitude": -83.7534,
            "full_address": "Costa Rica"
        },
        "timestamp": datetime.now() - timedelta(days=1),
        "url": "https://reddit.com/r/conservation/test_003",
        "subreddit": "conservation",
        "score": 89,
        "num_comments": 15,
    },
    {
        "reddit_id": "test_004",
        "title": "Panda sighting in Sichuan Province",
        "content": "Rare wild panda spotted in the bamboo forests. Conservation efforts are working!",
        "species": ["Panda"],
        "location": {
            "name": "Sichuan Province",
            "latitude": 30.5728,
            "longitude": 104.0668,
            "full_address": "Sichuan Province, China"
        },
        "timestamp": datetime.now() - timedelta(days=3),
        "url": "https://reddit.com/r/wildlife/test_004",
        "subreddit": "wildlife",
        "score": 234,
        "num_comments": 45,
    },
    {
        "reddit_id": "test_005",
        "title": "Orangutan in Borneo rainforest",
        "content": "Documented an orangutan family in their natural habitat. Critical habitat protection needed.",
        "species": ["Orangutan"],
        "location": {
            "name": "Borneo",
            "latitude": -0.9619,
            "longitude": 114.5548,
            "full_address": "Borneo, Indonesia"
        },
        "timestamp": datetime.now() - timedelta(days=7),
        "url": "https://reddit.com/r/ecology/test_005",
        "subreddit": "ecology",
        "score": 156,
        "num_comments": 28,
    },
]


def save_sample_sightings():
    """Save sample sightings to database for testing."""
    supabase = get_admin_supabase_client()
    
    saved_count = 0
    
    for sighting in SAMPLE_SIGHTINGS:
        try:
            # Check if already exists
            existing = supabase.table("reddit_sightings").select("id").eq("reddit_id", sighting["reddit_id"]).execute()
            
            if existing.data:
                print(f"⏭ Skipping {sighting['reddit_id']} (already exists)")
                continue
            
            # Prepare data - flexible schema, all fields optional except reddit_id and reddit_url
            record = {
                "id": str(uuid.uuid4()),
                "reddit_id": sighting["reddit_id"],
                "title": sighting.get("title"),
                "content": sighting.get("content"),
                "species": sighting.get("species"),
                "location_name": sighting.get("location", {}).get("name") if sighting.get("location") else None,
                "latitude": sighting.get("location", {}).get("latitude") if sighting.get("location") else None,
                "longitude": sighting.get("location", {}).get("longitude") if sighting.get("location") else None,
                "full_address": sighting.get("location", {}).get("full_address") if sighting.get("location") else None,
                "timestamp": sighting.get("timestamp").isoformat() if sighting.get("timestamp") else None,
                "reddit_url": sighting["url"],
                "subreddit": sighting.get("subreddit"),
                "score": sighting.get("score", 0),
                "num_comments": sighting.get("num_comments", 0),
                "raw_data": sighting.get("raw_data"),  # Store any additional raw Reddit data
                "metadata": sighting.get("metadata"),  # Store processed metadata
            }
            
            # Insert
            response = supabase.table("reddit_sightings").insert(record).execute()
            
            if response.data:
                saved_count += 1
                print(f"✓ Saved: {', '.join(sighting['species'])} at {sighting['location'].get('name')}")
            else:
                print(f"✗ Failed to save: {sighting['title']}")
                
        except Exception as e:
            print(f"✗ Error saving {sighting.get('reddit_id')}: {e}")
    
    print(f"\n✅ {saved_count} sample sightings saved to database!")
    print("You can now test the map UI with this data.")


if __name__ == "__main__":
    print("=" * 60)
    print("Adding Sample Reddit Sightings (No API Required)")
    print("=" * 60)
    save_sample_sightings()
