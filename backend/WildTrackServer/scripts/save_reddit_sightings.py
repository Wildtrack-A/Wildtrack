"""
Script to scrape Reddit and save sightings to database.

Run this periodically (e.g., daily via cron) to keep the database updated.

Usage:
    python scripts/save_reddit_sightings.py
"""

import sys
import os
from pathlib import Path

# Add parent directory to path to import app modules
sys.path.insert(0, str(Path(__file__).parent.parent))

from scripts.scrape_reddit_wildlife import SimpleRedditScraper
from app.database import get_admin_supabase_client
from datetime import datetime
import uuid


def save_sightings_to_db(posts: list):
    """Save scraped sightings to Supabase database."""
    supabase = get_admin_supabase_client()
    
    saved_count = 0
    skipped_count = 0
    
    for sighting in posts:
        try:
            # Check if already exists (by reddit_id)
            existing = supabase.table("reddit_sightings").select("id").eq("reddit_id", sighting["reddit_id"]).execute()
            
            if existing.data:
                skipped_count += 1
                continue  # Skip duplicates
            
            # Prepare data for insertion - simplified format (no location required)
            record = {
                "id": str(uuid.uuid4()),
                "reddit_id": sighting["reddit_id"],
                "title": sighting.get("title"),
                "content": sighting.get("content"),
                "species": sighting.get("species"),
                "location_name": None,  # Simplified scraper doesn't extract locations
                "latitude": None,
                "longitude": None,
                "full_address": None,
                "timestamp": sighting.get("timestamp").isoformat() if sighting.get("timestamp") else None,
                "reddit_url": sighting["url"],
                "subreddit": sighting.get("subreddit"),
                "score": sighting.get("score", 0),
                "num_comments": sighting.get("num_comments", 0),
                "raw_data": {
                    "author": sighting.get("author", "[deleted]"),
                },
                "metadata": sighting.get("metadata"),
            }
            
            # Insert into database
            response = supabase.table("reddit_sightings").insert(record).execute()
            
            if response.data:
                saved_count += 1
                species_str = ', '.join(sighting['species']) if sighting.get('species') else 'No species'
                title_str = sighting.get('title', 'Untitled')[:50]
                print(f"✓ Saved: {species_str} - '{title_str}...'")
            else:
                title = sighting.get('title', 'Untitled')
                print(f"✗ Failed to save: {title}")
                
        except Exception as e:
            print(f"✗ Error saving sighting {sighting.get('reddit_id', 'unknown')}: {e}")
    
    print(f"\nSummary: {saved_count} new sightings saved, {skipped_count} duplicates skipped")


def main():
    """Main function."""
    print("=" * 60)
    print("Reddit Wildlife Scraper - Saving to Database")
    print("Saving posts about endangered species")
    print("=" * 60)
    
    scraper = SimpleRedditScraper()
    posts = scraper.scrape_all(max_total=100)
    
    print(f"\nTotal posts found: {len(posts)}")
    
    if posts:
        save_sightings_to_db(posts)
    else:
        print("No posts found to save.")


if __name__ == "__main__":
    main()
