"""
Test script for Auth0 authentication endpoints.

Prerequisites:
1. Auth0 account with API created
2. AUTH0_DOMAIN and AUTH0_API_AUDIENCE in .env file
3. Auth0 test token or access token from frontend

Usage:
    python test_auth0.py
"""

import requests
import os
from dotenv import load_dotenv

load_dotenv()

BASE_URL = "http://localhost:8000/api/v1"

# Get Auth0 config
AUTH0_DOMAIN = os.getenv("AUTH0_DOMAIN")
AUTH0_API_AUDIENCE = os.getenv("AUTH0_API_AUDIENCE")

print("=" * 60)
print("Auth0 Authentication Test")
print("=" * 60)
print(f"\nAuth0 Domain: {AUTH0_DOMAIN}")
print(f"API Audience: {AUTH0_API_AUDIENCE}")
print(f"Base URL: {BASE_URL}\n")

# Step 1: Get Auth0 token
print("To test this endpoint, you need an Auth0 access token.")
print("\nOption 1: Use Auth0's Test Client")
print("  1. Go to Auth0 Dashboard -> Applications")
print("  2. Click on 'Test Application' (or create a new one)")
print("  3. Go to 'Try It Out' tab")
print("  4. Use 'Machine to Machine' grant type")
print("  5. Authorize it for your API")
print("  6. Copy the access token")

print("\nOption 2: Use Auth0's API Explorer")
print("  1. Go to Auth0 Dashboard -> APIs -> Your API")
print("  2. Click 'Test' tab")
print("  3. Copy the access token from the test section")

print("\nOption 3: Get token from your frontend")
print("  After user logs in via Auth0, frontend gets access token")
print("  Use that token here")

print("\n" + "=" * 60)
print("Enter your Auth0 access token:")
print("(Or press Enter to skip and see manual curl command)")
print("=" * 60)

token = input().strip()

if not token:
    print("\n" + "=" * 60)
    print("Manual Testing Instructions:")
    print("=" * 60)
    print("\n1. Get an Auth0 token (see options above)")
    print("\n2. Test /api/v1/auth/me with curl:")
    print(f'   curl -X GET "{BASE_URL}/auth/me" \\')
    print('        -H "Authorization: Bearer YOUR_AUTH0_TOKEN"')
    print('\n3. Or test in FastAPI docs at http://localhost:8000/docs')
    print('   - Click on GET /api/v1/auth/me')
    print('   - Click "Authorize" button')
    print('   - Enter: Bearer YOUR_AUTH0_TOKEN')
    print('   - Click "Authorize" then "Try it out"')
    exit(0)

# Test /api/v1/auth/me
print("\n" + "=" * 60)
print("Testing GET /api/v1/auth/me")
print("=" * 60)

headers = {
    "Authorization": f"Bearer {token}",
    "Content-Type": "application/json"
}

try:
    response = requests.get(f"{BASE_URL}/auth/me", headers=headers)
    
    print(f"\nStatus Code: {response.status_code}")
    print(f"Response Headers: {dict(response.headers)}\n")
    
    if response.status_code == 200:
        user_data = response.json()
        print("✅ Success! User data:")
        print(f"   ID: {user_data.get('id')}")
        print(f"   Email: {user_data.get('email')}")
        print(f"   Username: {user_data.get('username')}")
        print(f"   Role: {user_data.get('role')}")
        print(f"   Full Name: {user_data.get('full_name')}")
        print(f"   Is Active: {user_data.get('is_active')}")
    else:
        print(f"❌ Error: {response.status_code}")
        print(f"Response: {response.text}")
        
except requests.exceptions.ConnectionError:
    print("❌ Error: Could not connect to server.")
    print("   Make sure your FastAPI server is running:")
    print("   uvicorn app.main:app --reload")
except Exception as e:
    print(f"❌ Error: {str(e)}")

# Test /api/v1/auth/sync-profile
print("\n" + "=" * 60)
print("Testing POST /api/v1/auth/sync-profile")
print("=" * 60)

try:
    response = requests.post(f"{BASE_URL}/auth/sync-profile", headers=headers)
    
    print(f"\nStatus Code: {response.status_code}")
    
    if response.status_code == 200:
        user_data = response.json()
        print("✅ Success! Profile synced:")
        print(f"   ID: {user_data.get('id')}")
        print(f"   Email: {user_data.get('email')}")
        print(f"   Username: {user_data.get('username')}")
        print(f"   Role: {user_data.get('role')}")
    else:
        print(f"❌ Error: {response.status_code}")
        print(f"Response: {response.text}")
        
except Exception as e:
    print(f"❌ Error: {str(e)}")

print("\n" + "=" * 60)
print("Test Complete")
print("=" * 60)
