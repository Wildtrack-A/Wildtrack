from sklearn.cluster import DBSCAN
import numpy as np
from scipy.spatial import ConvexHull
import pickle
import sys
import os
from dotenv import load_dotenv

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))

load_dotenv(os.path.join(PROJECT_ROOT, '.env'))

sys.path.insert(0, PROJECT_ROOT)

from app.database import get_admin_supabase_client
from visual import visualize_points, visualize_boundaries, visualize_dbscan_no_centers, visualize_boundaries_only_clean

def load_from_supabase(species_filter=None, limit=None):
    supabase = get_admin_supabase_client()
    
    all_data = []
    page_size = 100 
    offset = 0
    
    print("Starting to fetch data from Supabase...")
    
    count_query = supabase.table("observations").select("*", count='exact').not_.is_("latitude", "null").not_.is_("longitude", "null")
    if species_filter:
        count_query = count_query.eq("species", species_filter)
    
    count_response = count_query.execute()
    total_count = count_response.count
    print(f"Total records in database: {total_count}")
    
    while offset < total_count:
        # Build fresh query for each page
        query = supabase.table("observations").select(
            "latitude, longitude, species, timestamp"
        ).not_.is_("latitude", "null").not_.is_("longitude", "null")
        
        if species_filter:
            query = query.eq("species", species_filter)
        
        # Use offset and limit
        response = query.order("timestamp").limit(page_size).offset(offset).execute()
        
        if not response.data or len(response.data) == 0:
            print(f"No more data at offset {offset}")
            break
        
        fetched_count = len(response.data)
        all_data.extend(response.data)
        
        # Print progress every 10 pages
        if (offset // page_size) % 10 == 0:
            print(f"Progress: {len(all_data)}/{total_count} records ({(len(all_data)/total_count*100):.1f}%)")
        
        offset += fetched_count
        
        # Safety check
        if len(all_data) >= total_count:
            break
    
    print(f"Finished fetching {len(all_data)} records")
    
    if limit:
        all_data = all_data[:limit]
    
    if not all_data:
        print("No data found in observations table")
        return [], [], []
    
    gps_data = []
    species_list = []
    timestamps = []
    
    for record in all_data:
        lat = record.get("latitude")
        lon = record.get("longitude")
        
        if lat is None or lon is None:
            continue
        
        gps_data.append([lat, lon])
        species = record.get("species") or "Unknown"
        species_list.append(species)
        timestamps.append(record.get("timestamp"))
    
    print(f"Loaded {len(gps_data)} data points from Supabase")
    
    return gps_data, species_list, timestamps

def create_geofence_zones_dbscan(gps_points, species_list, eps_km=100):

    gps_array = np.array(gps_points)
    species_array = np.array(species_list)
    unique_species = np.unique(species_array)

    print(f"Processing {len(gps_array)} GPS points with DBSCAN...")

    all_labels = np.zeros(len(gps_array), dtype=int)
    all_centers = []
    all_boundaries = {}
    zone_to_species = {}
    zone_offset = 0

    for species in unique_species:
        mask = species_array == species
        species_gps = gps_array[mask]

        if len(species_gps) < 3:
            all_labels[mask] = zone_offset
            center = np.mean(species_gps, axis=0)
            all_centers.append(center)
            all_boundaries[zone_offset] = species_gps
            zone_to_species[zone_offset] = species
            print(f"  {species}: {len(species_gps)} points - 1 zone (too few points)")
            zone_offset += 1
            continue

        gps_rad = np.radians(species_gps)

        eps_rad = eps_km / 6371.0

        dbscan = DBSCAN(eps=eps_rad, min_samples=3, metric='haversine')
        cluster_labels = dbscan.fit_predict(gps_rad)

        valid_clusters = set(cluster_labels) - {-1}
        n_clusters = len(valid_clusters)
        n_noise = np.sum(cluster_labels == -1)

        print(f"  {species}: {len(species_gps)} points - {n_clusters} zones ({n_noise} noise points)")

        for local_cluster_id in sorted(valid_clusters):
            cluster_mask = cluster_labels == local_cluster_id
            cluster_points = species_gps[cluster_mask]

            global_zone_id = zone_offset

            # Assign labels
            species_indices = np.where(mask)[0]
            cluster_indices = species_indices[cluster_mask]
            all_labels[cluster_indices] = global_zone_id

            # Calculate center
            center = np.mean(cluster_points, axis=0)
            all_centers.append(center)

            # Calculate boundary
            if len(cluster_points) >= 3:
                try:
                    hull = ConvexHull(cluster_points)
                    all_boundaries[global_zone_id] = cluster_points[hull.vertices]
                except:
                    all_boundaries[global_zone_id] = cluster_points
            else:
                all_boundaries[global_zone_id] = cluster_points

            zone_to_species[global_zone_id] = species
            zone_offset += 1

        if n_noise > 0:
            noise_mask = cluster_labels == -1
            noise_points = species_gps[noise_mask]
            species_indices = np.where(mask)[0]
            noise_indices = species_indices[noise_mask]

            all_labels[noise_indices] = -1

    return {
        'labels': all_labels,
        'centers': np.array(all_centers),
        'boundaries': all_boundaries,
        'n_zones': zone_offset,
        'unique_species': unique_species.tolist(),
        'zone_to_species': zone_to_species,
        'eps_km': eps_km
    }

def classify_new_point_dbscan(lat, lon, zones, species):
    if species not in zones['unique_species']:
        raise ValueError(f"Unknown species: {species}")

    # Find all zones for this species
    species_zones = [zid for zid, sp in zones['zone_to_species'].items() if sp == species]

    if not species_zones:
        raise ValueError(f"No zones found for species: {species}")

    # Find nearest zone center
    point = np.array([lat, lon])
    min_dist = float('inf')
    nearest_zone = None

    for zone_id in species_zones:
        center = zones['centers'][zone_id]
        dist = np.linalg.norm(point - center)
        if dist < min_dist:
            min_dist = dist
            nearest_zone = zone_id

    return nearest_zone


def species_summary_dbscan(zones, species_list):
    species_array = np.array(species_list)
    unique_species = zones['unique_species']

    summary = {}

    for species in sorted(unique_species):
        # Count zones for this species
        species_zones = [zid for zid, sp in zones['zone_to_species'].items() if sp == species]
        n_zones = len(species_zones)

        # Count points
        n_points = np.sum(species_array == species)

        # Count assigned points (excluding noise)
        assigned_mask = (species_array == species) & (zones['labels'] >= 0)
        n_assigned = np.sum(assigned_mask)
        n_noise = n_points - n_assigned

        avg_points_per_zone = n_assigned / n_zones if n_zones > 0 else 0

        # Store in dictionary
        summary[species] = {
            'total_sightings': n_points,
            'assigned_to_zones': n_assigned,
            'noise_outliers': n_noise,
            'number_of_zones': n_zones,
            'avg_sightings_per_zone': round(avg_points_per_zone, 1),
            'zone_ids': species_zones  # List of zone IDs for this species
        }

    return summary

def get_zone_info(zone_id, zones):
    if zone_id >= zones['n_zones'] or zone_id < 0:
        raise ValueError(f"Zone {zone_id} doesn't exist (valid: 0-{zones['n_zones']-1})")

    species = zones['zone_to_species'][zone_id]
    center = zones['centers'][zone_id]

    return {
        'zone_id': zone_id,
        'species': species,
        'center': center,
        'boundary': zones['boundaries'][zone_id]
    }


def save_zones(zones, filepath='zones_model.pkl'):
    with open(filepath, 'wb') as f:
        pickle.dump(zones, f)
    print(f"\nZones saved to {filepath}")


def load_zones(filepath='zones_model.pkl'):
    with open(filepath, 'rb') as f:
        zones = pickle.load(f)
    print(f"Zones loaded from {filepath}")
    return zones


def train_model(gps_data, species_list, eps_km=100, save_path=None):
    zones = create_geofence_zones_dbscan(gps_data, species_list, eps_km)

    if save_path:
        save_zones(zones, save_path)

    return zones


def predict_zone(lat, lon, zones_or_path, species):
    if isinstance(zones_or_path, str):
        zones = load_zones(zones_or_path)
    else:
        zones = zones_or_path

    zone_id = classify_new_point_dbscan(lat, lon, zones, species)

    #zone_info = get_zone_info(zone_id, zones)

    return zone_id


if __name__ == "__main__":
    # Load data from Supabase instead of CSV
    gps_data, species_list, timestamps = load_from_supabase()

    if not species_list:
        print("ERROR: No species data found in Supabase!")
        exit(1)

    print(f"\nDataset loaded:")
    print(f"  • GPS points: {len(gps_data)}")
    print(f"  • Unique species: {len(set(species_list))}")

    zones = train_model(
        gps_data=gps_data,
        species_list=species_list,
        eps_km=100,
        save_path='wildtrack_zones_dbscan.pkl'
    )

    # Test with first few points from the dataset
    if len(gps_data) >= 3:
        test_points = [
            (gps_data[0][0], gps_data[0][1], species_list[0]),
        ]
        if len(gps_data) > 100:
            test_points.append((gps_data[100][0], gps_data[100][1], species_list[100]))
        if len(gps_data) > 1000:
            test_points.append((gps_data[1000][0], gps_data[1000][1], species_list[1000]))

        loaded_zones = load_zones('wildtrack_zones_dbscan.pkl')
        for lat, lon, species in test_points:
            zone = predict_zone(lat, lon, loaded_zones, species)

        visualize_points(gps_data, loaded_zones, 'dbscan_with_centers.png')
        visualize_dbscan_no_centers(gps_data, loaded_zones, 'dbscan_no_centers.png')
        visualize_boundaries(loaded_zones, 'boundaries_filled.png')
        visualize_boundaries_only_clean(loaded_zones, 'boundaries_clean.png')
