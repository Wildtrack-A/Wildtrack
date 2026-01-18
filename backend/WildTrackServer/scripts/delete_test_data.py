"""
Delete test/fake Reddit sightings from the database.

This removes all sightings with reddit_id starting with "test_" which are
fake test data, not real Reddit posts.
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.database import get_admin_supabase_client

def delete_test_data():
    """Delete all test sightings (reddit_id starting with 'test_')."""
    supabase = get_admin_supabase_client()
    
    try:
        # Get all test sightings
        response = supabase.table("reddit_sightings").select("id, reddit_id, title").like("reddit_id", "test_%").execute()
        
        if not response.data:
            print("No test data found to delete.")
            return
        
        test_ids = [sighting["id"] for sighting in response.data]
        print(f"Found {len(test_ids)} test sightings to delete:")
        for sighting in response.data[:10]:  # Show first 10
            print(f"  - {sighting['reddit_id']}: {sighting.get('title', 'No title')[:50]}")
        if len(response.data) > 10:
            print(f"  ... and {len(response.data) - 10} more")
        
        # Delete them
        deleted_count = 0
        for sighting_id in test_ids:
            try:
                supabase.table("reddit_sightings").delete().eq("id", sighting_id).execute()
                deleted_count += 1
            except Exception as e:
                print(f"Error deleting {sighting_id}: {e}")
        
        print(f"\n✅ Deleted {deleted_count} test sightings from database.")
        print("Now run the real scraper to get actual Reddit data.")
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    print("=" * 60)
    print("Deleting Test/Fake Reddit Sightings")
    print("=" * 60)
    delete_test_data()
