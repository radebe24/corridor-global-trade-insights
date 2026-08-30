#!/usr/bin/env python3
"""Build the map layers: data/world.json and data/chokepoints.json.

Two public sources, both bundled so the map never makes a network call.

    World outline   Natural Earth 110m, via the world-atlas package.
                    Public domain. TopoJSON, decoded to plain rings here so
                    the browser needs no topojson library at runtime.

    Chokepoints     IMF PortWatch. 28 maritime chokepoints with coordinates,
                    vessel counts by type and the industries that move through
                    them. https://portwatch.imf.org

Coordinates are rounded to three decimal places, which is about 100 metres at
the equator and far finer than a world map drawn a thousand pixels wide needs.
It roughly halves the file.

Usage:
    python3 tools/build_geo.py
"""

import json
import os
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(os.path.dirname(HERE), "data")

WORLD_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json"
CHOKEPOINTS_URL = (
    "https://hub.arcgis.com/api/v3/datasets/"
    "fa9a5800b0ee4855af8b2944ab1e07af_0/downloads/data"
    "?format=geojson&spatialRefId=4326&where=1%3D1"
)

PRECISION = 3


def fetch(url, label):
    print(f"downloading  {label}")
    req = urllib.request.Request(url, headers={"User-Agent": "corridor-build/1.0"})
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read().decode("utf-8"))


# --------------------------------------------------------------------------
# TopoJSON
#
# Arcs are stored quantised and delta encoded: each point is an offset from the
# one before it, in grid units, and a linear transform maps the grid back to
# longitude and latitude. Decoding it here means the app ships plain rings.
# --------------------------------------------------------------------------

def decode_arc(arc, transform):
    sx, sy = transform["scale"]
    tx, ty = transform["translate"]
    out = []
    x = y = 0
    for dx, dy in arc:
        x += dx
        y += dy
        out.append([round(x * sx + tx, PRECISION), round(y * sy + ty, PRECISION)])
    return out


def ring_from_indices(indices, arcs):
    """An arc index may be negative, which means traverse that arc backwards.
    The encoding for the reversed form is ~i, so -1 refers to arc 0."""
    ring = []
    for i in indices:
        arc = arcs[~i][::-1] if i < 0 else arcs[i]
        # Consecutive arcs share an endpoint; drop the duplicate.
        ring.extend(arc[1:] if ring else arc)
    return ring


def topo_to_polygons(topo, object_name):
    transform = topo["transform"]
    arcs = [decode_arc(a, transform) for a in topo["arcs"]]

    shapes = []
    for geom in topo["objects"][object_name]["geometries"]:
        t = geom.get("type")
        if t == "Polygon":
            polys = [geom["arcs"]]
        elif t == "MultiPolygon":
            polys = geom["arcs"]
        else:
            continue

        rings = []
        for poly in polys:
            for part in poly:
                ring = ring_from_indices(part, arcs)
                # A ring needs at least a triangle to be worth drawing.
                if len(ring) > 3:
                    rings.append(ring)
        if rings:
            shapes.append({
                "id": geom.get("id"),
                "name": (geom.get("properties") or {}).get("name", ""),
                "rings": rings
            })
    return shapes


def main():
    os.makedirs(DATA_DIR, exist_ok=True)

    # ---- world -----------------------------------------------------------
    topo = fetch(WORLD_URL, "Natural Earth 110m world outline")
    if "objects" not in topo or "countries" not in topo["objects"]:
        sys.exit("World file is not the shape expected: no objects.countries")

    countries = topo_to_polygons(topo, "countries")
    world = {
        "source": "Natural Earth 110m, via world-atlas",
        "licence": "public domain",
        "precision": PRECISION,
        "countries": countries
    }
    world_path = os.path.join(DATA_DIR, "world.json")
    with open(world_path, "w", encoding="utf-8") as fh:
        json.dump(world, fh, separators=(",", ":"))

    rings = sum(len(c["rings"]) for c in countries)
    points = sum(len(r) for c in countries for r in c["rings"])
    print(f"  countries  {len(countries)}")
    print(f"  rings      {rings}")
    print(f"  points     {points}")
    print(f"  world.json {os.path.getsize(world_path) / 1024:.0f} KB")

    # ---- chokepoints -----------------------------------------------------
    gj = fetch(CHOKEPOINTS_URL, "IMF PortWatch chokepoints")
    points_out = []
    for f in gj.get("features", []):
        p = f.get("properties") or {}
        coords = (f.get("geometry") or {}).get("coordinates")
        if not coords:
            continue
        points_out.append({
            "id": p.get("portid"),
            "name": p.get("portname"),
            "lon": round(float(coords[0]), PRECISION),
            "lat": round(float(coords[1]), PRECISION),
            "vessels": p.get("vessel_count_total"),
            "container": p.get("vessel_count_container"),
            "tanker": p.get("vessel_count_tanker"),
            "dryBulk": p.get("vessel_count_dry_bulk"),
            "industries": [x for x in [p.get("industry_top1"), p.get("industry_top2"),
                                       p.get("industry_top3")] if x]
        })

    if not points_out:
        sys.exit("No chokepoints came back. The PortWatch endpoint may have moved.")

    cp = {
        "source": "IMF PortWatch",
        "sourceUrl": "https://portwatch.imf.org",
        "note": ("Geography and traffic composition only. PortWatch's daily "
                 "transit series is not published at a public download path, so "
                 "chokepoint status is established by search rather than by feed."),
        "chokepoints": sorted(points_out, key=lambda x: -(x["vessels"] or 0))
    }
    cp_path = os.path.join(DATA_DIR, "chokepoints.json")
    with open(cp_path, "w", encoding="utf-8") as fh:
        json.dump(cp, fh, separators=(",", ":"))

    print(f"  chokepoints      {len(points_out)}")
    print(f"  chokepoints.json {os.path.getsize(cp_path) / 1024:.0f} KB")
    print()
    print("busiest by vessel count:")
    for c in cp["chokepoints"][:6]:
        print(f"  {c['name']:<26} {c['vessels']:>7}  {c['lat']:>7.2f},{c['lon']:>8.2f}")


if __name__ == "__main__":
    main()
