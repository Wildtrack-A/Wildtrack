"""Database connection and Supabase client setup."""
from supabase import create_client, Client
from app.config import settings


def get_supabase_client() -> Client:
    """Get Supabase client instance."""
    return create_client(settings.supabase_url, settings.supabase_key)


def get_admin_supabase_client() -> Client:
    """Get Supabase client with service key for admin operations."""
    if not settings.supabase_service_key:
        raise ValueError(
            "SUPABASE_SERVICE_KEY not configured. "
            "Please add it to your .env file. "
            "You can find it in Supabase Dashboard > Settings > API > service_role key (secret)"
        )
    try:
        return create_client(settings.supabase_url, settings.supabase_service_key)
    except Exception as e:
        if "invalid" in str(e).lower() or "api key" in str(e).lower():
            raise ValueError(
                f"Invalid Supabase service key. Please check your SUPABASE_SERVICE_KEY in .env file. "
                f"Error: {str(e)}"
            )
        raise
