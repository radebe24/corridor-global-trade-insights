#!/usr/bin/env python3
"""Build data/mcs2026.json + data/mcs2026-index.json from the USGS
Mineral Commodity Summaries 2026 CSV.

The source CSV is Windows-1252, so em-dashes and accented country names
arrive as mojibake if read as UTF-8. We decode cp1252 explicitly.

Usage: python3 tools/build_mcs.py [path/to/MCS2026_Commodities_Data.csv]
"""

import csv
import json
import os
import re
import sys
from datetime import date

HERE = os.path.dirname(os.path.abspath(__file__))
APP_DIR = os.path.dirname(HERE)
DATA_DIR = os.path.join(APP_DIR, "data")

DEFAULT_SRC = os.path.expanduser("~/Downloads/MCS2026_Commodities_Data.csv")

WITHHELD = re.compile(r"^(W|NA|XX|--|—|-)$", re.I)
BOUND = re.compile(r"^([<>])\s*(.+)$")
ESTIMATE = re.compile(r"^(.+?)\s*[eE]$")


def parse_value(raw):
    """Return (value, flag). Keeps USGS qualifiers instead of discarding them."""
    s = (raw or "").strip()
    if not s:
        return None, None
    if WITHHELD.match(s):
        return None, s.upper()

    flag = None
    body = s

    m = BOUND.match(body)
    if m:
        flag, body = m.group(1), m.group(2)

    m = ESTIMATE.match(body)
    if m and re.search(r"[\d,.]", m.group(1)):
        flag = (flag or "") + "E"
        body = m.group(1)

    try:
        return float(body.replace(",", "")), flag
    except ValueError:
        return None, s


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_SRC
    if not os.path.exists(src):
        sys.exit(f"Source CSV not found: {src}")

    with open(src, encoding="cp1252", newline="") as fh:
        reader = csv.DictReader(fh)
        fields = [f.strip() for f in (reader.fieldnames or [])]
        required = [
            "MCS chapter", "Section", "Commodity", "Country", "Statistics",
            "Statistics_detail", "Unit", "Year", "Value", "Notes",
            "Is critical mineral 2025",
        ]
        missing = [c for c in required if c not in fields]
        if missing:
            sys.exit(f"Missing columns: {missing}\nHave: {fields}")

        records = []
        skipped = 0

        for row in reader:
            commodity = (row.get("Commodity") or "").strip()
            country = (row.get("Country") or "").strip()
            if not commodity and not country:
                skipped += 1
                continue

            value, flag = parse_value(row.get("Value"))

            year_raw = (row.get("Year") or "").strip()
            try:
                year = int(year_raw)
            except ValueError:
                year = None

            rec = {
                "ch": (row.get("MCS chapter") or "").strip(),
                "sec": (row.get("Section") or "").strip(),
                "c": commodity,
                "n": country,
                "s": (row.get("Statistics") or "").strip(),
                "d": (row.get("Statistics_detail") or "").strip(),
                "u": (row.get("Unit") or "").strip(),
                "y": year,
                "v": value,
                "f": flag,
            }
            note = (row.get("Notes") or "").strip()
            if note:
                rec["note"] = note
            if re.match(r"^yes$", (row.get("Is critical mineral 2025") or "").strip(), re.I):
                rec["crit"] = True

            records.append(rec)

    # ---- index: commodity -> {countries, years, crit} ----------------------
    index = {}
    countries = set()

    for rec in records:
        if not rec["c"]:
            continue
        entry = index.setdefault(rec["c"], {"countries": set(), "years": set(), "crit": False})
        if rec["n"]:
            entry["countries"].add(rec["n"])
            countries.add(rec["n"])
        if rec["y"]:
            entry["years"].add(rec["y"])
        if rec.get("crit"):
            entry["crit"] = True

    index_out = {
        "generated": date.today().isoformat(),
        "source": "USGS Mineral Commodity Summaries 2026",
        "rows": len(records),
        "countries": sorted(countries),
        "commodities": {
            k: {
                "countries": sorted(v["countries"]),
                "years": sorted(v["years"]),
                "crit": v["crit"],
            }
            for k, v in sorted(index.items())
        },
    }

    os.makedirs(DATA_DIR, exist_ok=True)
    with open(os.path.join(DATA_DIR, "mcs2026.json"), "w", encoding="utf-8") as fh:
        json.dump(records, fh, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(DATA_DIR, "mcs2026-index.json"), "w", encoding="utf-8") as fh:
        json.dump(index_out, fh, ensure_ascii=False, separators=(",", ":"))

    # ---- report -----------------------------------------------------------
    mojibake = sum(
        1 for r in records
        if "�" in r["c"] or "�" in r["n"] or "�" in r["sec"]
    )
    print(f"rows parsed       : {len(records)}")
    print(f"rows skipped      : {skipped}")
    print(f"commodities       : {len(index)}")
    print(f"countries         : {len(countries)}")
    print(f"replacement chars : {mojibake}")

    ivoire = next((c for c in countries if "Ivoire" in c), None)
    print(f"cote d'ivoire     : {ivoire or 'NOT FOUND'}")

    sample_section = records[0]["sec"] if records else ""
    print(f"sample section    : {sample_section}")

    cobalt = [r for r in records if "cobalt" in r["c"].lower() and "congo" in r["n"].lower()]
    print(f"cobalt/congo rows : {len(cobalt)}")
    for r in cobalt[:3]:
        print(f"  {r['n']} | {r['s']} | {r['d']} | {r['y']} | {r['v']} {r['u']}")


if __name__ == "__main__":
    main()
