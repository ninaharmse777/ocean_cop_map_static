"""Build a public, consent-filtered JSON feed from the existing published CoP Map CSV."""
from __future__ import annotations

import csv
import io
import json
import math
import os
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

# Already-public, approved map data tab used by the current Streamlit app.
DEFAULT_CSV_URL = (
    "https://docs.google.com/spreadsheets/d/e/"
    "2PACX-1vRMqzSM1yhQ2XRIBKhBfdLEBy_RvsPwAJU37HygysIbWti5qGI-"
    "EiloEAr2CkFrmcv2n6CuR00EPxkb/pub?gid=1112095258&single=true&output=csv"
)
CSV_URL = os.environ.get("COP_CSV_URL", DEFAULT_CSV_URL)
OUTPUT_PATH = Path(os.environ.get("COP_OUTPUT_PATH", "docs/data.json"))
REQUIRED = {
    "organisation", "public_contact", "website", "city", "country",
    "map_latitude", "map_longitude", "organisation_type", "data_focus",
    "tools_used", "ai_interests", "public_profile", "consent_map",
    "consent_contact", "show_on_map",
}
PUBLIC_FIELDS = (
    "organisation", "website", "city", "country", "organisation_type",
    "data_focus", "tools_used", "ai_interests", "public_profile",
)


def build(csv_text: str) -> dict:
    reader = csv.DictReader(io.StringIO(csv_text.lstrip("\ufeff")))
    names = {name.strip().lower() for name in (reader.fieldnames or []) if name}
    if "map_latitude" not in names and "latitude" in names:
        names.add("map_latitude")
    if "map_longitude" not in names and "longitude" in names:
        names.add("map_longitude")
    missing = sorted(REQUIRED - names)
    if missing:
        raise ValueError("Missing required Google Sheet columns: " + ", ".join(missing))

    organisations = []
    for raw in reader:
        row = {str(k or "").strip().lower(): (v or "").strip() for k, v in raw.items()}
        if row.get("consent_map", "").lower() != "yes":
            continue
        if row.get("show_on_map", "").lower() != "yes":
            continue
        try:
            lat = float(row.get("map_latitude") or row.get("latitude") or "")
            lon = float(row.get("map_longitude") or row.get("longitude") or "")
        except ValueError:
            continue
        if not (math.isfinite(lat) and math.isfinite(lon) and -90 <= lat <= 90 and -180 <= lon <= 180):
            continue
        record = {field: row.get(field, "") for field in PUBLIC_FIELDS}
        record["map_latitude"] = lat
        record["map_longitude"] = lon
        # Crucial: NEVER send a contact into public JSON without explicit contact consent.
        record["public_contact"] = row.get("public_contact", "") if row.get("consent_contact", "").lower() == "yes" else ""
        organisations.append(record)

    # Don't silently publish an empty map on a sudden upstream CSV failure/change.
    # If the map genuinely has zero approved entries, assess before publishing.
    if not organisations:
        raise ValueError("No approved organisations found. Refusing to overwrite published map with an empty dataset.")

    return {
        "updated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "count": len(organisations),
        "organisations": organisations,
    }


def main() -> None:
    print("Fetching published Map_Data CSV from Google Sheets...")
    req = urllib.request.Request(CSV_URL, headers={"User-Agent": "Mozilla/5.0 (CoP Map GitHub Pages publisher)"})
    with urllib.request.urlopen(req, timeout=40) as response:
        content = response.read().decode("utf-8-sig")
    result = build(content)
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Prepared {result['count']} consent-approved organisations in {OUTPUT_PATH}")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(1)
