#!/usr/bin/env python3
"""Ingest a USGS ScienceBase catalog item into a Corridor dataset registry record.

ScienceBase exposes every catalog item as JSON at
  https://www.sciencebase.gov/catalog/item/<itemId>?format=json

This prints a registry record ready to paste into datasets.js. It does not
edit datasets.js itself — adding a source is a decision, not a side effect.

Usage:
  python3 tools/ingest_sciencebase.py 607611a9d34e018b3201cbbf
  python3 tools/ingest_sciencebase.py <itemId> --json    # machine-readable
"""

import json
import re
import sys
import urllib.request
from datetime import date

API = "https://www.sciencebase.gov/catalog/item/{}?format=json"

# Publishers we treat as Tier 1 primary US government data.
TIER1_HINTS = (
    "u.s. geological survey", "usgs", "department of the interior",
    "u.s. census", "international trade commission", "department of commerce",
    # USGS science centers publish under their own names, not "USGS".
    "national minerals information center", "energy resources program",
    "geology, energy & minerals", "mineral resources program",
)


def slugify(text, maxlen=48):
    slug = re.sub(r"[^a-z0-9]+", "-", (text or "").lower()).strip("-")
    return slug[:maxlen].rstrip("-")


def fetch(item_id):
    url = API.format(item_id)
    req = urllib.request.Request(url, headers={"User-Agent": "Corridor/1.0 (dataset ingest)"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def pick_doi(item):
    for ident in item.get("identifiers") or []:
        if (ident.get("type") or "").lower() == "doi":
            key = ident.get("key") or ""
            return key if key.startswith("http") else f"https://doi.org/{key.lstrip('doi:')}"
    return None


def pick_publisher(item):
    """Prefer the publishing organisation over an individual author.

    ScienceBase lists people and organisations side by side in `contacts`, so
    naively taking the first publisher/originator yields a person's name and
    mis-tiers the record. Organisations win; people are the last resort.
    """
    contacts = item.get("contacts") or []

    def org_name(contact):
        return (
            (contact.get("organization") or {}).get("displayText")
            or (contact.get("name") if contact.get("contactType") == "organization" else None)
        )

    # 1. An organisation on a publisher/originator contact.
    for contact in contacts:
        if (contact.get("type") or "").lower() in ("publisher", "originator", "distributor"):
            name = org_name(contact)
            if name:
                return name

    # 2. Any organisation contact at all.
    for contact in contacts:
        name = org_name(contact)
        if name:
            return name

    # 3. Fall back to provenance, then to a person's name.
    source = (item.get("provenance") or {}).get("dataSource")
    if source:
        return source
    for contact in contacts:
        if (contact.get("type") or "").lower() in ("publisher", "originator"):
            return contact.get("name")
    return None


def pick_temporal(item):
    for date_entry in item.get("dates") or []:
        label = (date_entry.get("type") or "").lower()
        if label in ("range", "coverage", "temporal"):
            return {
                "start": date_entry.get("dateString") or date_entry.get("start"),
                "end": date_entry.get("end"),
            }
    for date_entry in item.get("dates") or []:
        if (date_entry.get("type") or "").lower() == "publication":
            year = (date_entry.get("dateString") or "")[:4]
            if year:
                return {"start": year, "end": year}
    return None


def build_record(item, item_id):
    title = item.get("title") or "(untitled)"
    publisher = pick_publisher(item) or "U.S. Geological Survey"
    tier = 1 if any(h in publisher.lower() for h in TIER1_HINTS) else 2

    files = item.get("files") or []
    facets = item.get("facets") or []
    for facet in facets:
        files = files + (facet.get("files") or [])

    bbox = (item.get("spatial") or {}).get("boundingBox")

    summary = item.get("summary") or item.get("body") or ""
    summary = re.sub(r"<[^>]+>", " ", summary)
    summary = re.sub(r"\s+", " ", summary).strip()

    record = {
        "id": slugify(title) or f"sciencebase-{item_id[:8]}",
        "tier": tier,
        "publisher": publisher,
        "title": title,
        # Nothing is downloaded here, so coverage is declared, not queried.
        "kind": "reference",
        "doi": pick_doi(item),
        "url": item.get("link", {}).get("url") or f"https://www.sciencebase.gov/catalog/item/{item_id}",
        "sciencebaseId": item_id,
        "summary": (summary[:400] + "…") if len(summary) > 400 else summary,
        "temporal": pick_temporal(item),
        "bbox": bbox,
        "files": [
            {
                "name": f.get("name"),
                "type": f.get("contentType"),
                "size": f.get("size"),
            }
            for f in files[:20]
        ],
        "caveats": (
            "Registered from the ScienceBase catalog record. Corridor has the "
            "metadata, not the underlying data — cite for coverage and "
            "provenance, never as the source of a figure."
        ),
        "ingested": date.today().isoformat(),
    }
    return record


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    as_json = "--json" in sys.argv

    if not args:
        sys.exit(__doc__)

    item_id = args[0]
    m = re.search(r"item/([0-9a-f]{24})", item_id)
    if m:
        item_id = m.group(1)

    try:
        item = fetch(item_id)
    except Exception as exc:
        sys.exit(f"Failed to fetch ScienceBase item {item_id}: {exc}")

    record = build_record(item, item_id)

    if as_json:
        print(json.dumps(record, indent=2, ensure_ascii=False))
        return

    print("Registry record — paste into datasets.js DATASETS array:\n")
    body = json.dumps(record, indent=2, ensure_ascii=False)
    # JS object literal style: unquote simple keys
    body = re.sub(r'^(\s*)"([A-Za-z_][A-Za-z0-9_]*)":', r"\1\2:", body, flags=re.M)
    print("  " + body.replace("\n", "\n  ") + ",")
    print(f"\nFiles listed in catalog: {len(record['files'])}")
    print(f"Tier assigned          : T{record['tier']} ({record['publisher']})")
    print(f"Kind                   : {record['kind']}")


if __name__ == "__main__":
    main()
