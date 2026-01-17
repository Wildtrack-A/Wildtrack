"""Database connection and Supabase client setup."""
from supabase import create_client, Client
from app.config import settings


def get_supabase_client() -> Client:
    """Get Supabase client instance."""
    return create_client(settings.supabase_url, settings.supabase_key)


def get_admin_supabase_client() -> Client:
    """Get Supabase client with service key for admin operations."""
    if not settings.supabase_service_key:
        raise ValueError("Service key not configured for admin operations")
    return create_client(settings.supabase_url, settings.supabase_service_key)
