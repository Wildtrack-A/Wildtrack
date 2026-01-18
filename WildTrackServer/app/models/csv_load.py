import pandas as pd

def load_from_csv(filepath):    
    df = pd.read_csv(filepath)
    
    gps_data = df[['latitude', 'longitude']].values.tolist()
    species_list = df['species'].tolist() if 'species' in df.columns else None
    timestamps = df['timestamp'].tolist() if 'timestamp' in df.columns else None

    print(f"Loaded {len(gps_data)} data points from {filepath}")
    
    return gps_data, species_list, timestamps