from fastapi import APIRouter, HTTPException, status, Body
from typing import Optional
from datetime import datetime
from app.services.inaturalist_service import (
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
    force_since: Optional[str] = Body(None, embed=False)
):
    """
    Trigger an import from iNaturalist.

    - per_page: page size for iNaturalist API (default 100)
    - force_since: optional ISO timestamp to force incremental sync starting point,
      otherwise last sync is used, otherwise full fetch.
    """
    try:
        # Determine incremental window
        last_sync = force_since or get_last_sync()
        params = {}
        if last_sync:
            # iNaturalist supports `updated_since` parameter in many variants; the safe param is `updated_since`
            params["updated_since"] = last_sync

        total_imported = 0
        last_seen_ts = last_sync

        for batch, total in fetch_all_inat(params=params, per_page=per_page):
            transformed = []
            for o in batch:
                rec = _transform_inat_obs(o)
                # ensure minimal required fields (inat_id)
                if not rec["inat_id"]:
                    continue
                transformed.append(rec)

                # track most recent updated_at
                try:
                    ua = o.get("updated_at") or o.get("created_at")
                    if ua:
                        if not last_seen_ts or ua > last_seen_ts:
                            last_seen_ts = ua
                except Exception:
                    pass

            if not transformed:
                continue

            result = upsert_inat_observations(transformed)
            if result.get("error"):
                # return error info (do not leak sensitive details in prod)
                raise HTTPException(status_code=500, detail=f"Upsert failed: {result.get('error')}")
            # count inserted/updated rows if API returns data
            total_imported += len(result.get("data") or transformed)

        if last_seen_ts:
            # store ISO timestamp string
            set_last_sync(last_seen_ts)

        return {"ok": True, "imported": total_imported, "last_sync": last_seen_ts}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))