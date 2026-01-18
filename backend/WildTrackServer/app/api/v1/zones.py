from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional, List
import sys
import os
import math

# Add project root to path
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
sys.path.insert(0, PROJECT_ROOT)

from app.models.dbscan_db import load_zones, get_zone_info, species_summary_dbscan, load_from_supabase
from app.auth import get_current_active_user
from app.database import get_supabase_client
import time

# Create router with NO dependencies - all routes are public by default
router = APIRouter()

# Cache for observation data - load once, reuse for all endpoints
_observation_cache = {
    "data": None,
    "timestamp": 0,
    "cache_ttl": 300  # Cache for 5 minutes (300 seconds)
}

def get_cached_observations(limit=2000):
    """
    Get observations from cache or load from database if cache is empty/expired.
    Returns: (gps_data, species_list, timestamps)
    Limited to 2000 points by default for faster loading.
    """
    current_time = time.time()
    
    # Check if cache is valid
    if (_observation_cache["data"] is None or 
        (current_time - _observation_cache["timestamp"]) > _observation_cache["cache_ttl"]):
        print(f"Loading observations from database (cache miss or expired)... Limit: {limit}")
        # Limit to reduce load time
        gps_data, species_list, timestamps = load_from_supabase(limit=limit)
        _observation_cache["data"] = (gps_data, species_list, timestamps)
        _observation_cache["timestamp"] = current_time
        print(f"Cached {len(gps_data)} observations")
    else:
        print(f"Using cached observations ({len(_observation_cache['data'][0])} points)")
    
    return _observation_cache["data"]

# Helper function to check if user is researcher
async def is_researcher(current_user: dict = Depends(get_current_active_user)) -> bool:
    """Check if current user has researcher role"""
    # Check role from current_user dict first (for mock users)
    if current_user.get("role") == "field_researcher":
        return True
    
    # If not in dict, check database profile
    try:
        supabase = get_supabase_client()
        response = supabase.table("profiles").select("role").eq("id", current_user["id"]).execute()
        
        if response.data and response.data[0].get("role") == "field_researcher":
            return True
    except Exception:
        # If profile doesn't exist or query fails, default to researcher for mock user
        pass
    
    # Default to researcher role for mock users (dev mode)
    return current_user.get("role") == "field_researcher" or current_user.get("id", "").startswith("dev-")

@router.get("/zones/all")
async def get_all_zones(
    current_user: dict = Depends(get_current_active_user)
):
    """
    Get all zones for all species.
    - Researchers: Get boundaries + all individual GPS points for every zone
    - Citizens: Get only boundaries for every zone
    """
    try:
        # Load zones model - check if file exists first
        zones_file = 'app/models/wildtrack_zones_dbscan.pkl'
        import os
        if not os.path.exists(zones_file):
            # If zones file doesn't exist, return empty zones
            return {
                "role": "public",
                "total_zones": 0,
                "unique_species": [],
                "zones": {}
            }
        
        zones = load_zones(zones_file)

        
        # Check user role
        user_is_researcher = await is_researcher(current_user)
        
        if user_is_researcher:
            # Researchers get everything: all boundaries + all GPS points
            # Load all GPS data
            gps_data, species_list, timestamps = get_cached_observations()
            
            # Group points by zone
            zones_with_points = {}
            
            for zone_id in range(zones['n_zones']):
                zone_info = get_zone_info(zone_id, zones)
                
                # Get all GPS points for this zone
                zone_points = []
                for i, label in enumerate(zones['labels']):
                    if label == zone_id:
                        zone_points.append({
                            'latitude': float(gps_data[i][0]),
                            'longitude': float(gps_data[i][1]),
                            'timestamp': timestamps[i]
                        })
                
                zones_with_points[zone_id] = {
                    "zone_id": zone_id,
                    "species": zone_info['species'],
                    "center": {
                        "latitude": float(zone_info['center'][0]),
                        "longitude": float(zone_info['center'][1])
                    },
                    "boundary": [
                        {"latitude": float(point[0]), "longitude": float(point[1])}
                        for point in zone_info['boundary']
                    ],
                    "individual_points": zone_points,
                    "point_count": len(zone_points)
                }
            
            return {
                "role": "field_researcher",
                "total_zones": zones['n_zones'],
                "unique_species": zones['unique_species'],
                "zones": zones_with_points
            }
        else:
            # Citizens only get boundaries for all zones
            zones_boundaries = {}
            
            for zone_id in range(zones['n_zones']):
                zone_info = get_zone_info(zone_id, zones)
                
                zones_boundaries[zone_id] = {
                    "zone_id": zone_id,
                    "species": zone_info['species'],
                    "boundary": [
                        {"latitude": float(point[0]), "longitude": float(point[1])}
                        for point in zone_info['boundary']
                    ]
                }
            
            return {
                "role": "public",
                "total_zones": zones['n_zones'],
                "unique_species": zones['unique_species'],
                "zones": zones_boundaries
            }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/zones/summary")
async def get_zones_summary(
    current_user: dict = Depends(get_current_active_user),
    species_filter: Optional[str] = None
):
    """
    Get summary of all zones.
    - Researchers: Get full summary with zone details
    - Citizens: Get simplified summary without exact coordinates
    """
    try:
        # Load zones model
        load_zones('app/models/wildtrack_zones_dbscan.pkl')

        
        # Load species list for summary
        _, species_list, _ = load_from_supabase(species_filter=species_filter)
        
        # Get full summary
        summary = species_summary_dbscan(zones, species_list)
        
        # Check user role
        user_is_researcher = await is_researcher(current_user)
        
        if user_is_researcher:
            # Researchers get full data
            return {
                "role": "field_researcher",
                "summary": summary,
                "total_zones": zones['n_zones'],
                "unique_species": zones['unique_species']
            }
        else:
            # Citizens get limited data (no zone IDs, just counts)
            citizen_summary = {}
            for species, data in summary.items():
                citizen_summary[species] = {
                    'total_sightings': data['total_sightings'],
                    'number_of_zones': data['number_of_zones'],
                    'avg_sightings_per_zone': data['avg_sightings_per_zone']
                    # Exclude: assigned_to_zones, noise_outliers, zone_ids
                }
            
            return {
                "role": "public",
                "summary": citizen_summary,
                "total_zones": zones['n_zones'],
                "unique_species": zones['unique_species']
            }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Public endpoints must come BEFORE parameterized routes to avoid route conflicts
@router.get("/zones/clusters")
async def get_clusters():
    """
    Simple: Database -> return clusters for map display.
    No auth required - public data.
    Optimized: Uses spatial grid for faster clustering, limited to 2000 points.
    """
    try:
        # Load observations with reduced limit for faster loading
        MAX_POINTS = 2000
        gps_data, species_list, timestamps = get_cached_observations(limit=MAX_POINTS)
        
        if not gps_data:
            return {"clusters": [], "total_points": 0}
        
        print(f"Starting clustering for {len(gps_data)} points...")
        
        # Optimized clustering: Use spatial grid (0.1 degree ≈ 11km)
        # Group points by grid cell first, then cluster within cells
        grid_size = 0.1  # degrees
        grid_clusters = {}  # {(grid_lat, grid_lon, species): [points]}
        
        print("Building spatial grid...")
        for i, (lat, lon) in enumerate(gps_data):
            species = species_list[i] if i < len(species_list) else "Unknown"
            
            # Calculate grid cell
            grid_lat = int(lat / grid_size)
            grid_lon = int(lon / grid_size)
            grid_key = (grid_lat, grid_lon, species)
            
            if grid_key not in grid_clusters:
                grid_clusters[grid_key] = []
            
            grid_clusters[grid_key].append({
                "latitude": float(lat),
                "longitude": float(lon),
                "timestamp": timestamps[i] if i < len(timestamps) else None
            })
        
        print(f"Created {len(grid_clusters)} grid cells, now creating clusters...")
        
        # Convert grid cells to clusters
        clusters = []
        cluster_id = 0
        
        for grid_key, points in grid_clusters.items():
            if not points:
                continue
            
            # Calculate center of grid cell
            center_lat = sum(p["latitude"] for p in points) / len(points)
            center_lon = sum(p["longitude"] for p in points) / len(points)
            
            clusters.append({
                "cluster_id": cluster_id,
                "species": grid_key[2],  # species from grid key
                "center": {"latitude": center_lat, "longitude": center_lon},
                "points": points,
                "count": len(points)
            })
            cluster_id += 1
        
        print(f"Created {len(clusters)} clusters from {len(gps_data)} points")
        
        return {
            "clusters": clusters,
            "total_points": len(gps_data)
        }
        
    except Exception as e:
        import traceback
        error_msg = f"Error in get_clusters: {str(e)}\n{traceback.format_exc()}"
        print(error_msg)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/zones/nearby-endangered")
async def get_nearby_endangered_species(
    latitude: float = Query(..., description="User's latitude"),
    longitude: float = Query(..., description="User's longitude"),
    radius_km: float = Query(50, description="Search radius in kilometers (default: 50km)")
):
    """
    Simple: Database -> calculate top 3 endangered near user -> return.
    No auth required - public data.
    """
    try:
        from app.database import get_admin_supabase_client
        
        supabase = get_admin_supabase_client()
        
        # Get endangered species list
        try:
            endangered_response = supabase.table("endangered_species").select("species_name").eq("is_endangered", True).execute()
            endangered_species_names = [row["species_name"] for row in endangered_response.data] if endangered_response.data else []
        except Exception as e:
            print(f"Warning: Could not query endangered_species table: {e}")
            endangered_species_names = []
        
        if not endangered_species_names:
            return {
                "user_location": {"latitude": latitude, "longitude": longitude},
                "radius_km": radius_km,
                "top_species": []
            }
        
        # Load observations from cache (or database if not cached)
        gps_data, species_list, timestamps = get_cached_observations()
        
        # Count endangered species within radius
        species_data = {}
        
        for i, (lat, lon) in enumerate(gps_data):
            species = species_list[i] if i < len(species_list) else "Unknown"
            
            if species in endangered_species_names:
                distance = calculate_distance(latitude, longitude, float(lat), float(lon))
                
                if distance <= radius_km:
                    if species not in species_data:
                        species_data[species] = {"count": 0, "min_distance": distance}
                    
                    species_data[species]["count"] += 1
                    if distance < species_data[species]["min_distance"]:
                        species_data[species]["min_distance"] = distance
        
        # Sort by count (descending), then distance (ascending), get top 3
        sorted_species = sorted(
            species_data.items(),
            key=lambda x: (-x[1]["count"], x[1]["min_distance"])
        )[:3]
        
        # Format response
        result = []
        for species, data in sorted_species:
            result.append({
                "species": species,
                "sighting_count": data["count"],
                "distance_km": round(data["min_distance"], 2)
            })
        
        return {
            "user_location": {"latitude": latitude, "longitude": longitude},
            "radius_km": radius_km,
            "top_species": result
        }
        
    except Exception as e:
        import traceback
        error_msg = f"Error in get_nearby_endangered_species: {str(e)}\n{traceback.format_exc()}"
        print(error_msg)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/zones/{zone_id}")
async def get_zone_details(
    zone_id: int,
    current_user: dict = Depends(get_current_active_user)
):
    """
    Get details for a specific zone.
    - Researchers: Get full details including exact GPS points
    - Citizens: Get only bounding box/convex hull boundary
    """
    try:
        # Load zones model
        zones = load_zones('app/models/wildtrack_zones_dbscan.pkl')

        
        # Get zone info
        zone_info = get_zone_info(zone_id, zones)
        
        # Check user role
        user_is_researcher = await is_researcher(current_user)
        
        if user_is_researcher:
            # Researchers get everything: center, boundary, and individual GPS points
            # Get all GPS points for this zone
            gps_data, species_list, timestamps = get_cached_observations()
            zone_points = []
            
            for i, label in enumerate(zones['labels']):
                if label == zone_id:
                    zone_points.append({
                        'latitude': gps_data[i][0],
                        'longitude': gps_data[i][1],
                        'timestamp': timestamps[i]
                    })
            
            return {
                "role": "field_researcher",
                "zone_id": zone_info['zone_id'],
                "species": zone_info['species'],
                "center": {
                    "latitude": float(zone_info['center'][0]),
                    "longitude": float(zone_info['center'][1])
                },
                "boundary": [
                    {"latitude": float(point[0]), "longitude": float(point[1])}
                    for point in zone_info['boundary']
                ],
                "individual_points": zone_points,
                "point_count": len(zone_points)
            }
        else:
            # Citizens only get boundary (convex hull) - NO exact GPS points, NO center
            return {
                "role": "public",
                "zone_id": zone_info['zone_id'],
                "species": zone_info['species'],
                "boundary": [
                    {"latitude": float(point[0]), "longitude": float(point[1])}
                    for point in zone_info['boundary']
                ],
                # No center, no individual points
            }
    
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/zones/species/{species_name}")
async def get_zones_by_species(
    species_name: str,
    current_user: dict = Depends(get_current_active_user)
):
    """
    Get all zones for a specific species.
    - Researchers: Get full zone details
    - Citizens: Get only boundaries
    """
    try:
        zones = load_zones('app/models/wildtrack_zones_dbscan.pkl')

        
        if species_name not in zones['unique_species']:
            raise HTTPException(status_code=404, detail=f"Species '{species_name}' not found")
        
        # Find all zones for this species
        species_zones = [zid for zid, sp in zones['zone_to_species'].items() if sp == species_name]
        
        user_is_researcher = await is_researcher(current_user)
        
        zones_data = []
        for zone_id in species_zones:
            zone_info = get_zone_info(zone_id, zones)
            
            if user_is_researcher:
                zones_data.append({
                    "zone_id": zone_info['zone_id'],
                    "center": {
                        "latitude": float(zone_info['center'][0]),
                        "longitude": float(zone_info['center'][1])
                    },
                    "boundary": [
                        {"latitude": float(point[0]), "longitude": float(point[1])}
                        for point in zone_info['boundary']
                    ]
                })
            else:
                zones_data.append({
                    "zone_id": zone_info['zone_id'],
                    "boundary": [
                        {"latitude": float(point[0]), "longitude": float(point[1])}
                        for point in zone_info['boundary']
                    ]
                })
        
        return {
            "role": "field_researcher" if user_is_researcher else "public",
            "species": species_name,
            "zone_count": len(zones_data),
            "zones": zones_data
        }
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
@router.get("/zones/all/test-public")
async def test_zones_public():
    """Test endpoint - Public view (no auth required)"""
    try:
        zones = load_zones('app/models/wildtrack_zones_dbscan.pkl')

        zones_boundaries = {}
        
        for zone_id in range(zones['n_zones']):
            zone_info = get_zone_info(zone_id, zones)
            
            zones_boundaries[zone_id] = {
                "zone_id": zone_id,
                "species": zone_info['species'],
                "boundary": [
                    {"latitude": float(point[0]), "longitude": float(point[1])}
                    for point in zone_info['boundary']
                ]
            }
        
        return {
            "role": "public",
            "total_zones": zones['n_zones'],
            "unique_species": zones['unique_species'],
            "zones": zones_boundaries
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/zones/all/test-researcher")
async def test_zones_researcher():
    """Test endpoint - Researcher view (no auth required)"""
    try:
        zones = load_zones('app/models/wildtrack_zones_dbscan.pkl')

        gps_data, species_list, timestamps = load_from_supabase()
        
        zones_with_points = {}
        
        for zone_id in range(zones['n_zones']):
            zone_info = get_zone_info(zone_id, zones)
            zone_points = []
            
            for i, label in enumerate(zones['labels']):
                if label == zone_id:
                    zone_points.append({
                        'latitude': float(gps_data[i][0]),
                        'longitude': float(gps_data[i][1]),
                        'timestamp': timestamps[i]
                    })
            
            zones_with_points[zone_id] = {
                "zone_id": zone_id,
                "species": zone_info['species'],
                "center": {
                    "latitude": float(zone_info['center'][0]),
                    "longitude": float(zone_info['center'][1])
                },
                "boundary": [
                    {"latitude": float(point[0]), "longitude": float(point[1])}
                    for point in zone_info['boundary']
                ],
                "individual_points": zone_points,
                "point_count": len(zone_points)
            }
        
        return {
            "role": "field_researcher",
            "total_zones": zones['n_zones'],
            "unique_species": zones['unique_species'],
            "zones": zones_with_points
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def calculate_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance between two points in kilometers using Haversine formula"""
    R = 6371  # Earth's radius in kilometers
    
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
    c = 2 * math.asin(math.sqrt(a))
    
    return R * c