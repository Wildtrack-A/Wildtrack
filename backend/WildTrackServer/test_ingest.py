"""Quick test script to verify the ingestion endpoint works."""
import requests
import json
from datetime import datetime

# Test data
test_observations = [
    {
        "animal_id": "elephant_001",
        "latitude": -1.2921,
        "longitude": 36.8219,
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "species": "African Elephant",
        "metadata": {}
    }
]

try:
    response = requests.post(
        "http://localhost:8000/api/v1/ingest",
        json=test_observations
    )
    
    print(f"Status Code: {response.status_code}")
    print(f"Response: {json.dumps(response.json(), indent=2)}")
    
    if response.status_code == 201:
        print("\nSuccess! Data should now be in Supabase.")
    else:
        print(f"\nError: {response.text}")
        
except requests.exceptions.ConnectionError:
    print("Error: Could not connect to server. Make sure it's running on http://localhost:8000")
except Exception as e:
    print(f"Error: {e}")
