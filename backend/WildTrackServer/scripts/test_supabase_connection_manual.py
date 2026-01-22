"""Test Supabase connection with service key."""
from app.config import settings
from supabase import create_client

print("Testing Supabase connection...")
print(f"URL: {settings.supabase_url}")
service_key = settings.supabase_service_key
print(f"Service Key length: {len(service_key) if service_key else 0}")
print(f"Service Key starts with: {service_key[:20] if service_key else 'None'}...")
print()

# Check key format
if service_key and service_key.startswith("sb_secret_"):
    print("WARNING: Service key format looks incorrect!")
    print("Supabase service_role keys typically:")
    print("  - Start with 'eyJ' (JWT format)")
    print("  - Are much longer (200+ characters)")
    print("  - Can be found in: Supabase Dashboard > Settings > API > service_role key (secret)")
    print()
    print("The 'sb_secret_' format appears to be from Supabase CLI, not the service_role key.")
    print()

try:
    client = create_client(settings.supabase_url, settings.supabase_service_key)
    result = client.table('profiles').select('*').limit(1).execute()
    print("SUCCESS: Supabase connection works! Service key is valid.")
except Exception as e:
    print(f"ERROR: {type(e).__name__}")
    print(f"   {str(e)}")
