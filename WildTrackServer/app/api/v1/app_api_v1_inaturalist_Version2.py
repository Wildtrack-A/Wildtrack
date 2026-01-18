from fastapi import APIRouter, HTTPException, status, Body
from typing import Optional
from datetime import datetime
from app.services.app_services_inaturalist_service_Version2 import (
    fetch_all_inat,
    _transform_inat_obs,
    upsert_inat_observations,
    get_last_sync,
    set_last_sync,
)

router = APIRouter()

@router.post("/inaturalist/import", status_code=status.HTTP_200_OK)
async def import_inaturalist(
    per_page: int = Body(100, embed=False),
    max_pages: int = Body(5, embed=False), 
    batch_size: int = Body(50, embed=False),
    force_since: Optional[str] = Body(None, embed=False)
):
    """
    Trigger an import from iNaturalist.

    - per_page: page size for iNaturalist API (default 100)
    - max_pages: maximum pages to fetch (default 5, prevents timeout)
    - batch_size: records per upsert batch (default 50, prevents timeout)
    - force_since: optional ISO timestamp to force incremental sync starting point
    """
    try:
        print(f"\n{'='*60}")
        print(f"Starting iNaturalist import")
        print(f"Per page: {per_page}, Max pages: {max_pages}, Batch size: {batch_size}")
        print(f"{'='*60}\n")
        
        last_sync = force_since or get_last_sync()
        params = {}
        if last_sync:
            params["updated_since"] = last_sync
            print(f"Incremental sync from: {last_sync}")
        else:
            print("Full sync (no previous sync found)")

        total_imported = 0
        last_seen_ts = last_sync
        pages_fetched = 0

        for batch, total in fetch_all_inat(params=params, per_page=per_page):
            print(f"\nProcessing page {pages_fetched + 1} ({len(batch)} observations)...")
            
            transformed = []
            for o in batch:
                rec = _transform_inat_obs(o)
                if not rec["inat_id"]:
                    continue
                transformed.append(rec)

                # Track most recent timestamp
                try:
                    ua = o.get("updated_at") or o.get("created_at")
                    if ua:
                        if not last_seen_ts or ua > last_seen_ts:
                            last_seen_ts = ua
                except Exception:
                    pass

            if not transformed:
                continue

            # Split into smaller batches to avoid timeout
            for i in range(0, len(transformed), batch_size):
                mini_batch = transformed[i:i + batch_size]
                print(f"  Upserting batch {i//batch_size + 1} ({len(mini_batch)} records)...")
                
                result = upsert_inat_observations(mini_batch)
                
                if result.get("error"):
                    print(f" Warning: {result.get('error')}")
                    # Continue on error instead of stopping
                    continue
                
                batch_imported = len(result.get("data") or mini_batch)
                total_imported += batch_imported
                print(f" Success ({batch_imported} records)")

            pages_fetched += 1
            
            # Stop if max pages reached
            if pages_fetched >= max_pages:
                print(f"\n  Reached max pages limit ({max_pages})")
                break

        if last_seen_ts:
            set_last_sync(last_seen_ts)
            print(f"\n Sync state updated: {last_seen_ts}")

        print(f"\n{'='*60}")
        print(f"Import complete!")
        print(f"Total imported: {total_imported}")
        print(f"Pages fetched: {pages_fetched}")
        print(f"{'='*60}\n")

        return {
            "ok": True, 
            "imported": total_imported, 
            "last_sync": last_seen_ts,
            "pages_fetched": pages_fetched
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))