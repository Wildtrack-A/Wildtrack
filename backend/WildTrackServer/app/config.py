import os
from pathlib import Path
from typing import Optional
from pydantic_settings import BaseSettings, SettingsConfigDict

# Get the directory where this config file is located
BASE_DIR = Path(__file__).parent.parent
ENV_FILE = BASE_DIR / ".env"


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # Supabase Configuration
    supabase_url: str
    supabase_key: str
    supabase_service_key: Optional[str] = None  # For admin operations
    
    # Auth0 Configuration
    auth0_domain: str = ""  # e.g., "your-app.us.auth0.com"
    auth0_api_audience: str = ""  # e.g., "https://your-api-identifier"
    auth0_client_id: Optional[str] = None  # For Auth0 management operations (optional)
    auth0_client_secret: Optional[str] = None  # For Auth0 management operations (optional)
    auth0_algorithm: str = "RS256"
    
    # Database Configuration (if using direct connection)
    db_host: Optional[str] = None
    db_port: Optional[int] = 5432
    db_name: Optional[str] = None
    db_user: Optional[str] = None
    db_password: Optional[str] = None
    
    # API Configuration
    api_v1_prefix: str = "/api/v1"
    
    model_config = SettingsConfigDict(
        env_file=str(ENV_FILE) if ENV_FILE.exists() else ".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore"  # Ignore extra environment variables
    )


# Global settings instance
settings = Settings()
