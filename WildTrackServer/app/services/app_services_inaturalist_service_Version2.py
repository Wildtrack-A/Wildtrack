import time
import requests
from typing import List, Dict, Optional
from datetime import datetime
from app.database import get_admin_supabase_client

INAT_BASE = "https://api.inaturalist.org/v1"
DEFAULT_PER_PAGE = 100

_taxon_cache = {}

def _transform_inat_obs(inat: Dict) -> Dict:
    """Map iNaturalist observation JSON to our DB record shape."""
    lat, lon = None, None
    if inat.get("location"):
        try:
            lat_str, lon_str = inat["location"].split(",")
            lat, lon = float(lat_str), float(lon_str)
        except Exception:
            pass
    if not lat and inat.get("geojson") and inat["geojson"].get("coordinates"):
        coords = inat["geojson"]["coordinates"]
        if len(coords) >= 2:
            lon, lat = coords[0], coords[1]

    first_photo = (inat.get("photos") or [None])[0]

    taxon_id = (inat.get("taxon") or {}).get("id")
    common_name = fetch_common_name(taxon_id)

    return {
        "inat_id": inat.get("id"),
        "observed_on": inat.get("observed_on"),
        "observed_at": inat.get("time_observed_at") or None,
        "species_guess": inat.get("species_guess"),
        "taxon_id": (inat.get("taxon") or {}).get("id"),
        "taxon_name": (inat.get("taxon") or {}).get("name") or (inat.get("taxon") or {}).get("preferred_common_name"),
        "common_name": common_name,
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

def fetch_common_name(taxon_id: int, locale: str = "en", place_id: int = 1) -> Optional[str]:
    """Fetch the preferred common name from iNaturalist for a given taxon_id."""
    if not taxon_id:
        return None
    if taxon_id in _taxon_cache:
        return _taxon_cache[taxon_id]
    try:
        url = f"https://api.inaturalist.org/v1/taxa/{taxon_id}"
        resp = requests.get(url, params={"locale": locale, "preferred_place_id": place_id}, timeout=10)
        resp.raise_for_status()
        result = resp.json().get("results", [{}])[0]
        common_name = result.get("vernacular_name") or result.get("preferred_common_name")
        _taxon_cache[taxon_id] = common_name
        return common_name
    except Exception as e:
        print(f"Error fetching common name for taxon {taxon_id}: {e}")
        return None

def fetch_inat_page(page: int = 1, per_page: int = DEFAULT_PER_PAGE, params: Optional[Dict] = None) -> Dict:
    params = params.copy() if params else {}
    params.update({
        "page": page, 
        "per_page": per_page, 
        "order": "desc",
        "has[]": "geo", 
        "quality_grade": "research" 
    })
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
        time.sleep(0.25)

def upsert_inat_observations(records: List[Dict]) -> Dict:
    """Upsert a batch of transformed records into Supabase table `inaturalist_observations`."""
    supabase = get_admin_supabase_client()
    try:
        response = supabase.table("inaturalist_observations").upsert(
            records,
            on_conflict="inat_id"
        ).execute()
        return {"status_code": 200, "data": response.data, "error": None}
    except Exception as e:
        print(f"Upsert error: {e}")
        return {"status_code": 500, "data": None, "error": str(e)}

def get_last_sync() -> Optional[str]:
    """Read last sync timestamp from sync_state table (key='inat_last_sync')."""
    supabase = get_admin_supabase_client()
    try:
        resp = supabase.table("sync_state").select("value").eq("key", "inat_last_sync").execute()
        if resp and resp.data and len(resp.data) > 0:
            return resp.data[0].get("value", {}).get("last_synced")
    except Exception as e:
        print(f"Error reading last sync: {e}")
        return None
    return None

def set_last_sync(iso_ts: str):
    supabase = get_admin_supabase_client()
    supabase.table("sync_state").upsert({"key": "inat_last_sync", "value": {"last_synced": iso_ts}}).execute()