import time
import requests
from typing import List, Dict, Optional
from datetime import datetime
from app.database import get_admin_supabase_client

INAT_BASE = "https://api.inaturalist.org/v1"
DEFAULT_PER_PAGE = 100  # sensible default; iNat supports up to 200

def _transform_inat_obs(inat: Dict) -> Dict:
    """Map iNaturalist observation JSON to our DB record shape."""
    # iNaturalist supplies a location string like "lat,lon" in many cases,
    # or coordinates in geojson. We try to extract a lat/lon robustly.
    lat, lon = None, None
    if inat.get("location"):
        try:
            lat_str, lon_str = inat["location"].split(",")
            lat, lon = float(lat_str), float(lon_str)
        except Exception:
            pass
    # fallback to geojson/coordinates if present
    if not lat and inat.get("geojson") and inat["geojson"].get("coordinates"):
        coords = inat["geojson"]["coordinates"]  # [lon, lat]
        if len(coords) >= 2:
            lon, lat = coords[0], coords[1]

    first_photo = (inat.get("photos") or [None])[0]
    return {
        "inat_id": inat.get("id"),
        "observed_on": inat.get("observed_on"),
        "observed_at": inat.get("time_observed_at") or None,
        "species_guess": inat.get("species_guess"),
        "taxon_id": (inat.get("taxon") or {}).get("id"),
        "taxon_name": (inat.get("taxon") or {}).get("name") or (inat.get("taxon") or {}).get("preferred_common_name"),
        "latitude": lat,
        "longitude": lon,
        "user_id": (inat.get("user") or {}).get("id"),
        "user_login": (inat.get("user") or {}).get("login"),
        "photos": inat.get("photos") or [],
        "license": first_photo.get("license_code") if first_photo else None,
        "raw_json": inat,
        "created_at": inat.get("created_at"),
        "updated_at": inat.get("updated_at"),
        "source": "inaturalist"
    }

def fetch_inat_page(page: int = 1, per_page: int = DEFAULT_PER_PAGE, params: Optional[Dict] = None) -> Dict:
    params = params.copy() if params else {}
    params.update({"page": page, "per_page": per_page, "order": "desc"})
    resp = requests.get(f"{INAT_BASE}/observations", params=params, timeout=30)
    resp.raise_for_status()
    return resp.json()

def fetch_all_inat(params: Optional[Dict] = None, per_page: int = DEFAULT_PER_PAGE):
    """Generator that yields batches (lists) of iNat observations."""
    page = 1
    while True:
        data = fetch_inat_page(page=page, per_page=per_page, params=params)
        results = data.get("results") or data.get("observations") or data.get("data") or []
        if not results:
            break
        yield results, data.get("total_results")
        if len(results) < per_page:
            break
        page += 1
        # Respect any nominal throttling
        time.sleep(0.25)

def upsert_inat_observations(records: List[Dict]) -> Dict:
    """
    Upsert a batch of transformed records into Supabase table `inaturalist_observations`.
    Requires the SQL table created (see sql/06_create_inaturalist_table.sql).
    """
    supabase = get_admin_supabase_client()
    # Upsert uses unique constraint on inat_id to deduplicate. If the client supports .upsert(), use it:
    response = supabase.table("inaturalist_observations").upsert(records).execute()
    return {"status_code": response.status_code, "data": response.data, "error": getattr(response, "error", None)}

def get_last_sync() -> Optional[str]:
    """Read last sync timestamp from sync_state table (key='inat_last_sync')."""
    supabase = get_admin_supabase_client()
    resp = supabase.table("sync_state").select("value").eq("key", "inat_last_sync").single().execute()
    if resp and resp.data:
        try:
            return resp.data.get("value", {}).get("last_synced")
        except Exception:
            return None
    return None

def set_last_sync(iso_ts: str):
    supabase = get_admin_supabase_client()
    # Upsert sync_state row
    supabase.table("sync_state").upsert({"key": "inat_last_sync", "value": {"last_synced": iso_ts}}).execute()