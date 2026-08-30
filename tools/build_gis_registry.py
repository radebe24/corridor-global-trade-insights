#!/usr/bin/env python3
"""Build data/africa-gis-layers.json from the FGDC metadata for the USGS
"Compilation of Geospatial Data (GIS) for the Mineral Industries and Related
Infrastructure of Africa" (DOI 10.5066/P97EQWXP).

IMPORTANT: this XML is METADATA ONLY. It documents what each layer contains;
it carries no coordinates, no facility records, no capacities. The output is a
coverage register — what Corridor knows *exists* — never a source of figures.

Usage: python3 tools/build_gis_registry.py [path/to/Africa_GIS_Metadata.xml]
"""

import json
import os
import re
import sys
import xml.etree.ElementTree as ET
from datetime import date

HERE = os.path.dirname(os.path.abspath(__file__))
APP_DIR = os.path.dirname(HERE)
DATA_DIR = os.path.join(APP_DIR, "data")

DEFAULT_SRC = os.path.expanduser("~/Downloads/Africa_GIS_Metadata.xml")


def text(node, path, default=""):
    found = node.find(path) if node is not None else None
    if found is None or found.text is None:
        return default
    return re.sub(r"\s+", " ", found.text).strip()


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_SRC
    if not os.path.exists(src):
        sys.exit(f"Source XML not found: {src}")

    tree = ET.parse(src)
    root = tree.getroot()

    idinfo = root.find("idinfo")
    citation = idinfo.find("citation/citeinfo") if idinfo is not None else None

    dataset = {
        "title": text(citation, "title"),
        "publisher": text(citation, "pubinfo/publish"),
        "pubdate": text(citation, "pubdate"),
        "doi": "",
        "abstract": text(idinfo, "descript/abstract"),
        "purpose": text(idinfo, "descript/purpose"),
        "constraints": text(idinfo, "accconst"),
    }

    # DOI lives in one of the onlink elements
    for onlink in (citation.findall("onlink") if citation is not None else []):
        if onlink.text and "doi.org" in onlink.text:
            dataset["doi"] = onlink.text.strip()
            break

    # Temporal + spatial extent
    rng = idinfo.find("timeperd/timeinfo/rngdates") if idinfo is not None else None
    if rng is not None:
        dataset["temporal"] = {
            "start": text(rng, "begdate"),
            "end": text(rng, "enddate"),
        }

    bounding = idinfo.find("spdom/bounding") if idinfo is not None else None
    if bounding is not None:
        dataset["bbox"] = {
            "west": text(bounding, "westbc"),
            "east": text(bounding, "eastbc"),
            "north": text(bounding, "northbc"),
            "south": text(bounding, "southbc"),
        }

    # ---- layers: each <eainfo><detailed> is one feature class --------------
    layers = []
    for detailed in root.findall("eainfo/detailed"):
        enttyp = detailed.find("enttyp")
        name = text(enttyp, "enttypl")
        if not name:
            continue

        attrs = []
        for attr in detailed.findall("attr"):
            label = text(attr, "attrlabl")
            if not label:
                continue
            attrs.append({
                "name": label,
                "def": text(attr, "attrdef"),
            })

        layers.append({
            "name": name,
            "description": text(enttyp, "enttypd"),
            "source": text(enttyp, "enttypds"),
            "attributes": attrs,
            "attribute_count": len(attrs),
        })

    out = {
        "generated": date.today().isoformat(),
        "kind": "reference",
        "note": (
            "Metadata only. This register documents which geospatial layers "
            "exist in the USGS Africa minerals and infrastructure geodatabase "
            "and what fields they carry. It contains no coordinates, facility "
            "records, counts or capacities, and must never be cited as the "
            "source of a figure."
        ),
        "dataset": dataset,
        "layer_count": len(layers),
        "layers": layers,
    }

    os.makedirs(DATA_DIR, exist_ok=True)
    path = os.path.join(DATA_DIR, "africa-gis-layers.json")
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))

    print(f"title       : {dataset['title']}")
    print(f"publisher   : {dataset['publisher']}")
    print(f"doi         : {dataset['doi'] or '(none found)'}")
    print(f"temporal    : {dataset.get('temporal')}")
    print(f"layers      : {len(layers)}")
    for layer in layers:
        print(f"  {layer['name']:<40} {layer['attribute_count']:>3} attrs")
    print(f"written     : {path} ({os.path.getsize(path)} bytes)")


if __name__ == "__main__":
    main()
