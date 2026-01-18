import numpy as np
import matplotlib.pyplot as plt

def visualize_points(gps_points, zones, output_file='geofencing_points_dbscan.png'):
    """Visualize GPS points colored by zone (optimized for DBSCAN with many zones)"""
    gps_array = np.array(gps_points)
    labels = zones['labels']
    centers = zones['centers']
    
    plt.figure(figsize=(20, 12))
    
    # Use a colormap for many zones
    cmap = plt.cm.tab20c
    
    # Filter out noise points (labeled as -1)
    valid_mask = labels >= 0
    
    # Plot GPS points
    if np.any(valid_mask):
        scatter = plt.scatter(
            gps_array[valid_mask, 1],  # Longitude
            gps_array[valid_mask, 0],  # Latitude
            c=labels[valid_mask],
            s=10,
            alpha=0.6,
            cmap=cmap,
            edgecolors='none'
        )
    
    # Plot noise points in gray
    if np.any(~valid_mask):
        plt.scatter(
            gps_array[~valid_mask, 1],
            gps_array[~valid_mask, 0],
            c='gray',
            s=5,
            alpha=0.3,
            label='Noise/Outliers'
        )
    
    # Plot zone centers
    plt.scatter(
        centers[:, 1],
        centers[:, 0],
        c='red',
        marker='X',
        s=50,
        edgecolors='black',
        linewidth=1,
        label='Zone Centers',
        zorder=5
    )
    
    plt.xlabel('Longitude', fontsize=14, fontweight='bold')
    plt.ylabel('Latitude', fontsize=14, fontweight='bold')
    plt.title(f'Wildlife Geofencing Zones (DBSCAN) - {zones["n_zones"]} Zones', 
              fontsize=16, fontweight='bold', pad=20)
    plt.legend(fontsize=11, loc='best')
    plt.grid(True, alpha=0.3, linestyle='--', linewidth=0.5)
    
    plt.savefig(output_file, dpi=300, bbox_inches='tight')
    print(f"Points map saved to {output_file}")
    plt.close()


def visualize_boundaries(zones, output_file='boundaries_only_dbscan.png', 
                         show_species=False, alpha=0.15):
    """
    Visualize only zone boundaries (optimized for many zones)
    
    Args:
        zones: The zones model
        output_file: Output filename
        show_species: If True, color by species (slower for many zones)
        alpha: Transparency of filled boundaries
    """
    boundaries = zones['boundaries']
    zone_to_species = zones.get('zone_to_species', {})
    
    plt.figure(figsize=(20, 12))
    
    if show_species:
        # Color by species (slower but more informative)
        unique_species = zones['unique_species']
        species_colors = {sp: plt.cm.tab20(i % 20) 
                         for i, sp in enumerate(unique_species)}
        
        for zone_id in sorted(boundaries.keys()):
            boundary = boundaries[zone_id]
            species = zone_to_species[zone_id]
            color = species_colors[species]
            
            if len(boundary) >= 3:
                boundary_closed = np.vstack([boundary, boundary[0]])
                plt.fill(
                    boundary_closed[:, 1],
                    boundary_closed[:, 0],
                    color=color,
                    alpha=alpha,
                    edgecolor=color,
                    linewidth=0.5
                )
    else:
        # Single color (faster)
        for zone_id in sorted(boundaries.keys()):
            boundary = boundaries[zone_id]
            
            if len(boundary) >= 3:
                boundary_closed = np.vstack([boundary, boundary[0]])
                plt.fill(
                    boundary_closed[:, 1],
                    boundary_closed[:, 0],
                    color='steelblue',
                    alpha=alpha,
                    edgecolor='navy',
                    linewidth=0.5
                )
    
    plt.xlabel('Longitude', fontsize=14, fontweight='bold')
    plt.ylabel('Latitude', fontsize=14, fontweight='bold')
    plt.title(f'Wildlife Territory Boundaries - {zones["n_zones"]} Zones', 
              fontsize=16, fontweight='bold', pad=20)
    plt.grid(True, alpha=0.3, linestyle='--', linewidth=0.5)
    
    plt.savefig(output_file, dpi=300, bbox_inches='tight')
    print(f"Boundary map saved to {output_file}")
    plt.close()


def visualize_dbscan_no_centers(gps_points, zones, output_file='dbscan_points_boundaries.png'):
    """
    Visualize DBSCAN zones with boundaries and points, but WITHOUT centers
    Clean visualization for many zones
    
    Args:
        gps_points: All GPS coordinates
        zones: The zones model
        output_file: Output filename
    """
    gps_array = np.array(gps_points)
    labels = zones['labels']
    boundaries = zones['boundaries']
    
    plt.figure(figsize=(20, 12))
    
    # Use colormap for many zones
    cmap = plt.cm.tab20c
    
    # Filter out noise points
    valid_mask = labels >= 0
    
    # Plot boundaries first (background)
    for zone_id in sorted(boundaries.keys()):
        boundary = boundaries[zone_id]
        zone_color = cmap(zone_id % 256)  # Use modulo for colormap
        
        if len(boundary) >= 3:
            boundary_closed = np.vstack([boundary, boundary[0]])
            plt.fill(
                boundary_closed[:, 1],  # Longitude
                boundary_closed[:, 0],  # Latitude
                color=zone_color,
                alpha=0.15,
                edgecolor=zone_color,
                linewidth=1
            )
    
    # Plot GPS points on top
    if np.any(valid_mask):
        plt.scatter(
            gps_array[valid_mask, 1],  # Longitude
            gps_array[valid_mask, 0],  # Latitude
            c=labels[valid_mask],
            s=8,
            alpha=0.7,
            cmap=cmap,
            edgecolors='none',
            zorder=3
        )
    
    # Plot noise points
    if np.any(~valid_mask):
        plt.scatter(
            gps_array[~valid_mask, 1],
            gps_array[~valid_mask, 0],
            c='gray',
            s=5,
            alpha=0.3,
            marker='x',
            label='Noise/Outliers',
            zorder=2
        )
    
    plt.xlabel('Longitude', fontsize=14, fontweight='bold')
    plt.ylabel('Latitude', fontsize=14, fontweight='bold')
    plt.title(f'DBSCAN Wildlife Zones - {zones["n_zones"]} Territories', 
              fontsize=16, fontweight='bold', pad=20)
    
    if np.any(~valid_mask):
        plt.legend(fontsize=11, loc='best')
    
    plt.grid(True, alpha=0.3, linestyle='--', linewidth=0.5)
    
    plt.savefig(output_file, dpi=300, bbox_inches='tight')
    print(f"DBSCAN map (no centers) saved to {output_file}")
    plt.close()


def visualize_species_zones(zones, species_name, gps_points, species_list, 
                           output_file=None):
    """
    Visualize zones for a single species
    
    Args:
        zones: The zones model
        species_name: Name of species to visualize
        gps_points: All GPS points
        species_list: All species labels
        output_file: Output filename (auto-generated if None)
    """
    if species_name not in zones['unique_species']:
        print(f"Species '{species_name}' not found!")
        return
    
    # Get zones for this species
    species_zones = [zid for zid, sp in zones['zone_to_species'].items() 
                     if sp == species_name]
    
    if not species_zones:
        print(f"No zones found for {species_name}")
        return
    
    # Filter GPS points
    gps_array = np.array(gps_points)
    species_array = np.array(species_list)
    labels = zones['labels']
    
    species_mask = species_array == species_name
    species_gps = gps_array[species_mask]
    species_labels = labels[species_mask]
    
    plt.figure(figsize=(14, 10))
    
    # Plot each zone
    colors = plt.cm.Set3(np.linspace(0, 1, max(len(species_zones), 12)))
    
    for i, zone_id in enumerate(sorted(species_zones)):
        zone_mask = species_labels == zone_id
        zone_points = species_gps[zone_mask]
        
        if len(zone_points) == 0:
            continue
        
        boundary = zones['boundaries'][zone_id]
        
        # Plot boundary
        if len(boundary) >= 3:
            boundary_closed = np.vstack([boundary, boundary[0]])
            plt.fill(
                boundary_closed[:, 1],
                boundary_closed[:, 0],
                color=colors[i % len(colors)],
                alpha=0.3,
                edgecolor=colors[i % len(colors)],
                linewidth=2,
                label=f'Zone {zone_id}' if len(species_zones) <= 20 else None
            )
        
        # Plot points
        plt.scatter(
            zone_points[:, 1],
            zone_points[:, 0],
            c=[colors[i % len(colors)]],
            s=30,
            edgecolors='black',
            linewidth=0.5,
            alpha=0.7
        )
        
        # Plot center
        center = zones['centers'][zone_id]
        plt.scatter(
            center[1], center[0],
            c='red', marker='X', s=200,
            edgecolors='black', linewidth=2, zorder=10
        )
    
    # Plot noise points if DBSCAN
    if zones.get('method') == 'dbscan':
        noise_mask = species_labels == -1
        if np.any(noise_mask):
            noise_points = species_gps[noise_mask]
            plt.scatter(
                noise_points[:, 1],
                noise_points[:, 0],
                c='gray', s=20, alpha=0.5,
                marker='x', label='Noise/Outliers'
            )
    
    plt.xlabel('Longitude', fontsize=12, fontweight='bold')
    plt.ylabel('Latitude', fontsize=12, fontweight='bold')
    plt.title(f'{species_name} - Territory Zones ({len(species_zones)} zones)', 
              fontsize=14, fontweight='bold', pad=15)
    
    if len(species_zones) <= 20:
        plt.legend(fontsize=9, loc='best', ncol=2)
    
    plt.grid(True, alpha=0.3)
    
    if output_file is None:
        output_file = f'{species_name.replace(" ", "_")}_zones.png'
    
    plt.savefig(output_file, dpi=300, bbox_inches='tight')
    print(f"Species map saved to {output_file}")
    plt.close()


def visualize_boundaries_only_clean(zones, output_file='boundaries_clean.png'):
    """
    Visualize ONLY boundaries - no points, no centers, just clean territory outlines
    
    Args:
        zones: The zones model
        output_file: Output filename
    """
    boundaries = zones['boundaries']
    
    plt.figure(figsize=(20, 12))
    
    # Single color for clean look
    for zone_id in sorted(boundaries.keys()):
        boundary = boundaries[zone_id]
        
        if len(boundary) >= 3:
            boundary_closed = np.vstack([boundary, boundary[0]])
            plt.plot(
                boundary_closed[:, 1],  # Longitude
                boundary_closed[:, 0],  # Latitude
                color='darkblue',
                linewidth=1,
                alpha=0.6
            )
    
    plt.xlabel('Longitude', fontsize=14, fontweight='bold')
    plt.ylabel('Latitude', fontsize=14, fontweight='bold')
    plt.title(f'Wildlife Territory Boundaries - {zones["n_zones"]} Zones', 
              fontsize=16, fontweight='bold', pad=20)
    plt.grid(True, alpha=0.3, linestyle='--', linewidth=0.5)
    
    plt.savefig(output_file, dpi=300, bbox_inches='tight')
    print(f"Clean boundaries map saved to {output_file}")
    plt.close()