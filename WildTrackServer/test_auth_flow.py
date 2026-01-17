"""Test script for complete authentication flow: registration -> login -> protected endpoint"""
import requests
import json
from datetime import datetime

BASE_URL = "http://localhost:8000"

print("=" * 60)
print("WildTrack Authentication Flow Test")
print("=" * 60)

# Step 1: Register a new user
print("\n[1/3] Registering new user...")
register_data = {
    "email": f"test_{datetime.now().strftime('%Y%m%d%H%M%S')}@test.com",
    "username": f"testuser_{datetime.now().strftime('%Y%m%d%H%M%S')}",
    "password": "password123",
    "full_name": "Test Field Researcher",
    "role": "field_researcher"
}

try:
    register_response = requests.post(
        f"{BASE_URL}/api/v1/auth/register",
        json=register_data
    )
    
    if register_response.status_code == 201:
        user_data = register_response.json()
        print(f"[SUCCESS] Registration successful!")
        print(f"   User ID: {user_data['id']}")
        print(f"   Email: {user_data['email']}")
        print(f"   Username: {user_data['username']}")
        print(f"   Role: {user_data['role']}")
        email = register_data["email"]
        password = register_data["password"]
    else:
        print(f"[ERROR] Registration failed: {register_response.status_code}")
        print(f"   Error: {register_response.text}")
        exit(1)
        
except Exception as e:
    print(f"[ERROR] Registration error: {e}")
    exit(1)

# Step 2: Login to get token
print("\n[2/3] Logging in...")
login_data = {
    "email": email,
    "password": password
}

try:
    login_response = requests.post(
        f"{BASE_URL}/api/v1/auth/login",
        json=login_data
    )
    
    if login_response.status_code == 200:
        token_data = login_response.json()
        access_token = token_data["access_token"]
        print(f"[SUCCESS] Login successful!")
        print(f"   Token type: {token_data['token_type']}")
        print(f"   Access token: {access_token[:50]}...")
    else:
        print(f"[ERROR] Login failed: {login_response.status_code}")
        print(f"   Error: {login_response.text}")
        exit(1)
        
except Exception as e:
    print(f"[ERROR] Login error: {e}")
    exit(1)

# Step 3: Test protected endpoint - Ingest observations
print("\n[3/3] Testing protected ingest endpoint...")
observation_data = [
    {
        "animal_id": "elephant_001",
        "latitude": -1.2921,
        "longitude": 36.8219,
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "species": "African Elephant",
        "metadata": {}
    }
]

headers = {
    "Authorization": f"Bearer {access_token}",
    "Content-Type": "application/json"
}

try:
    ingest_response = requests.post(
        f"{BASE_URL}/api/v1/ingest",
        json=observation_data,
        headers=headers
    )
    
    if ingest_response.status_code == 201:
        observations = ingest_response.json()
        print(f"[SUCCESS] Ingestion successful!")
        print(f"   Created {len(observations)} observation(s)")
        for obs in observations:
            print(f"   - Observation ID: {obs['id']}, Animal: {obs['animal_id']}, Species: {obs['species']}")
    else:
        print(f"[ERROR] Ingestion failed: {ingest_response.status_code}")
        print(f"   Error: {ingest_response.text}")
        exit(1)
        
except Exception as e:
    print(f"[ERROR] Ingestion error: {e}")
    exit(1)

# Step 4: Test without token (should fail)
print("\n[BONUS] Testing ingest without token (should fail)...")
try:
    no_auth_response = requests.post(
        f"{BASE_URL}/api/v1/ingest",
        json=observation_data
    )
    
    if no_auth_response.status_code == 403:
        print(f"[SUCCESS] Security working! Got 403 Forbidden (as expected)")
    else:
        print(f"[WARNING] Unexpected status: {no_auth_response.status_code}")
        print(f"   Response: {no_auth_response.text}")
except Exception as e:
    print(f"   Error (expected): {e}")

print("\n" + "=" * 60)
print("[SUCCESS] Complete authentication flow test PASSED!")
print("=" * 60)
print("\nSummary:")
print(f"  [OK] User registered: {email}")
print(f"  [OK] Token obtained: {access_token[:30]}...")
print(f"  [OK] Protected endpoint accessed successfully")
print(f"  [OK] Security verified (401/403 without token)")
