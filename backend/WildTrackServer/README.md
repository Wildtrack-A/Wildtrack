# WildTrack Server

**Spatio-temporal data platform for proactive conservation**

WildTrack makes conservation proactive by using spatio-temporal data and K-Means clustering to create a dynamic, invisible infrastructure that balances human recreation with the survival of endangered species.

## Architecture

This FastAPI backend serves as the data warehouse and spatial intelligence layer for the WildTrack ecosystem:

- **Day 1**: Data Warehouse Setup (Ingestion API)
- **Day 2**: Spatial Intelligence Layer (Zones API, Danger Detection)
- **Day 3**: Deployment & Security (Admin Analytics, RLS)

## Setup Instructions

### Prerequisites

- Python 3.9+
- Supabase account and project
- pip or poetry for dependency management

### Step 1: Supabase Setup

1. **Create a Supabase project** at https://supabase.com

2. **Enable PostGIS extension**:
   - Go to Database -> Extensions
   - Search for "postgis" and enable it
   - OR run `sql/01_enable_postgis.sql` in the SQL Editor

3. **Create tables**:
   - Run `sql/02_create_observations_table.sql` (raw GPS pings)
   - Run `sql/03_create_zones_table.sql` (AI-calculated danger zones)

4. **Create RPC function**:
   - Run `sql/04_create_is_user_in_danger_rpc.sql` (spatial danger detection)

5. **Set up Row Level Security**:
   - Run `sql/05_setup_rls_policies.sql` (public zones, protected observations)

### Step 2: Environment Configuration

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Fill in your Supabase credentials:
   - Get `SUPABASE_URL` from Settings -> API
   - Get `SUPABASE_KEY` (anon/public key)
   - Get `SUPABASE_SERVICE_KEY` (service_role key) for admin operations

### Step 3: Install Dependencies

```bash
pip install -r requirements.txt
```

### Step 4: Run the Server

```bash
uvicorn app.main:app --reload
```

The API will be available at:
- API: http://localhost:8000
- Interactive Docs: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## API Endpoints

### Day 1: Ingestion

#### `POST /api/v1/ingest`
Ingest a list of animal sightings (raw GPS pings).

**Request Body:**
```json
[
  {
    "animal_id": "elephant_001",
    "latitude": -1.2921,
    "longitude": 36.8219,
    "timestamp": "2024-01-15T10:30:00Z",
    "species": "African Elephant",
    "metadata": {}
  }
]
```

**Response:** List of created observations with IDs

### Data Verification

After ingesting data, verify it appears in Supabase:
1. Go to Supabase Dashboard -> Table Editor
2. Open the `observations` table
3. You should see the ingested sightings

## Project Structure

```
WildTrackServer/
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPI application entry point
│   ├── config.py            # Configuration management
│   ├── database.py          # Supabase client setup
│   ├── models/              # Pydantic models
│   │   ├── observation.py
│   │   └── zone.py
│   └── api/
│       └── v1/
│           └── ingest.py    # Ingestion endpoint
├── sql/                     # Database migration scripts
│   ├── 01_enable_postgis.sql
│   ├── 02_create_observations_table.sql
│   ├── 03_create_zones_table.sql
│   ├── 04_create_is_user_in_danger_rpc.sql
│   └── 05_setup_rls_policies.sql
├── requirements.txt
├── .env.example
└── README.md
```

## Security & Sustainability

The Row Level Security (RLS) policies ensure:

- **Public Safety**: Hikers can query zones via the public API key to stay safe
- **Animal Protection**: Exact observation locations are protected (prevent poaching)
- **Admin Access**: Service role key required for ingestion and admin operations

This creates a "virtual fence" that protects wildlife while enabling safe recreation.

## Next Steps (Day 2 & 3)

- **Day 2**: Implement `/api/v1/zones` (GeoJSON), `/api/v1/zones/update`, and integrate `is_user_in_danger`
- **Day 3**: Build `/api/v1/admin/analytics`, finalize RLS, and deploy to Render/Railway

## License

MIT
