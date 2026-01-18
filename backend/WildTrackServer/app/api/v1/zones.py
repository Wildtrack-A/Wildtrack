from fastapi import APIRouter, Depends, HTTPException
from typing import Optional
import sys
import os

# Add project root to path
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
sys.path.insert(0, PROJECT_ROOT)

from app.models.dbscan_db import load_zones, get_zone_info, species_summary_dbscan, load_from_supabase
from app.api.v1.auth import get_current_user
from app.database import get_supabase_client

router = APIRouter()

# Helper function to check if user is researcher
async def is_researcher(current_user: dict = Depends(get_current_user)) -> bool:
    """Check if current user has researcher role"""
    supabase = get_supabase_client()
    
    # Get user profile to check role
    response = supabase.table("profiles").select("role").eq("id", current_user["id"]).execute()
    
    if not response.data:
        raise HTTPException(status_code=404, detail="User profile not found")
    
    return response.data[0].get("role") == "field_researcher"  # Changed from "researcher"

@router.get("/zones/all")
async def get_all_zones(
    current_user: dict = Depends(get_current_user)
):
    """
    Get all zones for all species.
    - Researchers: Get boundaries + all individual GPS points for every zone
    - Citizens: Get only boundaries for every zone
    """
    try:
        # Load zones model
        zones = load_zones('wildtrack_zones_dbscan.pkl')
        
        # Check user role
        user_is_researcher = await is_researcher(current_user)
        
        if user_is_researcher:
            # Researchers get everything: all boundaries + all GPS points
            # Load all GPS data
            gps_data, species_list, timestamps = load_from_supabase()
            
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
                "role": "researcher",
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
                "role": "citizen",
                "total_zones": zones['n_zones'],
                "unique_species": zones['unique_species'],
                "zones": zones_boundaries
            }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/zones/summary")
async def get_zones_summary(
    current_user: dict = Depends(get_current_user),
    species_filter: Optional[str] = None
):
    """
    Get summary of all zones.
    - Researchers: Get full summary with zone details
    - Citizens: Get simplified summary without exact coordinates
    """
    try:
        # Load zones model
        zones = load_zones('wildtrack_zones_dbscan.pkl')
        
        # Load species list for summary
        _, species_list, _ = load_from_supabase(species_filter=species_filter)
        
        # Get full summary
        summary = species_summary_dbscan(zones, species_list)
        
        # Check user role
        user_is_researcher = await is_researcher(current_user)
        
        if user_is_researcher:
            # Researchers get full data
            return {
                "role": "researcher",
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
                "role": "citizen",
                "summary": citizen_summary,
                "total_zones": zones['n_zones'],
                "unique_species": zones['unique_species']
            }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/zones/{zone_id}")
async def get_zone_details(
    zone_id: int,
    current_user: dict = Depends(get_current_user)
):
    """
    Get details for a specific zone.
    - Researchers: Get full details including exact GPS points
    - Citizens: Get only bounding box/convex hull boundary
    """
    try:
        # Load zones model
        zones = load_zones('wildtrack_zones_dbscan.pkl')
        
        # Get zone info
        zone_info = get_zone_info(zone_id, zones)
        
        # Check user role
        user_is_researcher = await is_researcher(current_user)
        
        if user_is_researcher:
            # Researchers get everything: center, boundary, and individual GPS points
            # Get all GPS points for this zone
            gps_data, species_list, timestamps = load_from_supabase()
            zone_points = []
            
            for i, label in enumerate(zones['labels']):
                if label == zone_id:
                    zone_points.append({
                        'latitude': gps_data[i][0],
                        'longitude': gps_data[i][1],
                        'timestamp': timestamps[i]
                    })
            
            return {
                "role": "researcher",
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
                "role": "citizen",
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
    current_user: dict = Depends(get_current_user)
):
    """
    Get all zones for a specific species.
    - Researchers: Get full zone details
    - Citizens: Get only boundaries
    """
    try:
        zones = load_zones('wildtrack_zones_dbscan.pkl')
        
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
            "role": "researcher" if user_is_researcher else "citizen",
            "species": species_name,
            "zone_count": len(zones_data),
            "zones": zones_data
        }
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))