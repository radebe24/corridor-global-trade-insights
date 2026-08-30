#!/usr/bin/env python3
"""Build data/tariffs-<year>.json + data/tariffs-index.json from the USITC
annual tariff database.

The USITC publishes one zip per year at a stable, predictable URL, so a
refresh is just this script with a new year. Nothing here is scraped: the
archive is a documented download from dataweb.usitc.gov/tariff/annual.

    https://www.usitc.gov/tariff_affairs/documents/tariff_data/tariff_data_2026.zip

The CSV inside is Windows-1252 rather than UTF-8. Several descriptions carry
a cent sign, which is 0xa2 and blows up a UTF-8 read.

SCOPE
    These are the STATUTORY rates: column 1 general (MFN), column 1 special
    for preference programs and FTAs, and column 2. Section 301, Section 232
    and IEEPA actions are absent, since those live in HTS chapter 99 and move
    by proclamation. Corridor models the statutory layer exactly and names the
    rest as unmodelled. See TRADE_ACTIONS in datasets.js.

Usage:
    python3 tools/build_tariffs.py                 # download current year
    python3 tools/build_tariffs.py 2025            # download a given year
    python3 tools/build_tariffs.py ~/Downloads/tariff_data_2026.zip
"""

import csv
import gzip
import io
import json
import os
import re
import sys
import urllib.request
import zipfile
from datetime import date

HERE = os.path.dirname(os.path.abspath(__file__))
APP_DIR = os.path.dirname(HERE)
DATA_DIR = os.path.join(APP_DIR, "data")

SOURCE_URL = "https://www.usitc.gov/tariff_affairs/documents/tariff_data/tariff_data_{year}.zip"
LANDING_URL = "https://dataweb.usitc.gov/tariff/annual"

# Preference programs and FTAs we resolve origins against. Each entry is the
# column prefix in the source CSV. A program appears on a line when its
# <prefix>_indicator column is non-empty; the rate comes from
# <prefix>_ad_val_rate where that column exists, and is Free where it does not
# (AGOA, GSP, Israel and the CBI programs carry no rate column — eligibility
# on those is binary).
PROGRAMS = [
    "gsp", "agoa", "cbi", "cbtpa", "israel_fta", "usmca", "korea", "japan",
    "australia", "bahrain", "chile", "colombia", "dr_cafta", "jordan",
    "morocco", "oman", "panama", "peru", "singapore", "nepal",
]


# USITC writes 9999.999999 in a rate column to mean "this rate cannot be
# expressed as a single number". It is a sentinel, not a rate, and reading it
# literally produces a 999,999% duty. 745 lines carry it: sugar priced on a
# sliding scale by degree of polarisation, apparel ensembles charged at each
# garment's own rate, tool and cutlery sets charged at the highest rate in the
# set, and most of chapter 99.
NOT_COMPUTABLE = 9999.999999


def num(raw):
    """Rates arrive as strings and are frequently blank. Blank means zero.
    Returns None for the not-computable sentinel so callers must handle it."""
    s = (raw or "").strip()
    if not s:
        return 0.0
    try:
        v = float(s)
    except ValueError:
        return 0.0
    if abs(v - NOT_COMPUTABLE) < 0.001:
        return None
    return v


def why_not_computable(text):
    """A short reason drawn from the rate text, so the app can say what is
    missing rather than just refusing."""
    t = (text or "").lower()
    if "highest rate of duty" in t:
        return "The rate is whichever article in the set carries the highest rate, so it depends on what the set contains."
    if "each garment" in t or "ensemble" in t:
        return "Each garment in the ensemble is dutied at its own rate, so the line needs a breakdown by garment."
    if "for each degree" in t:
        return "The rate slides with the degree of polarisation, which the schedule alone does not give."
    if "drawback" in t:
        return "The rate depends on the drawback claimed on the earlier export."
    return "The schedule does not express this line's rate as a single number."


# The unit a specific duty is charged on lives in the rate TEXT. The
# quantity_1_code column says "NO" (number) even on lines charged per kg.
# Forms seen in the data: "1 cents/kg", "68 cents/head", "0.9 cents each",
# "$1.104/kg + 14.9%", "46.3 cents/kg + 14.9%".
UNIT_SLASH = re.compile(r"(?:cents|\$[\d.]+)\s*/\s*([a-z0-9]+)", re.I)
UNIT_EACH = re.compile(r"(?:cents|\$[\d.]+)\s+(each|per\s+([a-z0-9]+))", re.I)


def specific_unit(text):
    """Return the unit a specific duty is charged on, or '' if not parseable."""
    s = text or ""
    m = UNIT_SLASH.search(s)
    if m:
        return m.group(1).lower()
    m = UNIT_EACH.search(s)
    if m:
        return (m.group(2) or "each").lower()
    return ""


def fetch(year):
    """Return the CSV text for a year, downloading the archive if needed."""
    url = SOURCE_URL.format(year=year)
    print(f"downloading        : {url}")
    req = urllib.request.Request(url, headers={"User-Agent": "corridor-build/1.0"})
    with urllib.request.urlopen(req, timeout=180) as resp:
        blob = resp.read()
    print(f"downloaded         : {len(blob) / 1e6:.1f} MB")
    return read_zip(io.BytesIO(blob))


def read_zip(fh):
    with zipfile.ZipFile(fh) as z:
        names = [n for n in z.namelist() if n.lower().endswith(".txt")]
        if not names:
            sys.exit(f"No .txt member in archive. Found: {z.namelist()}")
        with z.open(names[0]) as member:
            return member.read().decode("cp1252")


def main():
    arg = sys.argv[1] if len(sys.argv) > 1 else None

    if arg and arg.lower().endswith(".zip"):
        src = os.path.expanduser(arg)
        if not os.path.exists(src):
            sys.exit(f"Archive not found: {src}")
        m = re.search(r"(\d{4})", os.path.basename(src))
        year = int(m.group(1)) if m else date.today().year
        print(f"reading            : {src}")
        with open(src, "rb") as fh:
            text = read_zip(fh)
    else:
        year = int(arg) if arg else date.today().year
        text = fetch(year)

    reader = csv.DictReader(io.StringIO(text))
    have = set(reader.fieldnames or [])
    required = {"hts8", "brief_description", "mfn_text_rate", "col1_special_text"}
    missing = required - have
    if missing:
        sys.exit(f"Source is missing expected columns: {sorted(missing)}")

    rows = []
    chapters = {}
    specific_lines = 0
    compound_lines = 0
    nc_lines = 0
    unparsed_units = []
    program_counts = {p: 0 for p in PROGRAMS}

    for r in reader:
        hts = (r.get("hts8") or "").strip()
        if not hts:
            continue

        ad_val = num(r.get("mfn_ad_val_rate"))
        specific = num(r.get("mfn_specific_rate"))
        other = num(r.get("mfn_other_rate"))

        # Any sentinel in the MFN rates makes the whole line unpriceable.
        not_computable = ad_val is None or specific is None or other is None
        if not_computable:
            ad_val = specific = other = 0.0

        rec = {
            "h": hts,
            "d": (r.get("brief_description") or "").strip(),
            "m": (r.get("mfn_text_rate") or "").strip(),
            "a": ad_val,
            "c2": (r.get("col2_text_rate") or "").strip(),
            "sp": (r.get("col1_special_text") or "").strip(),
        }
        if not_computable:
            rec["nc"] = 1
            rec["ncWhy"] = why_not_computable(rec["m"])
            nc_lines += 1

        # Only carry the awkward fields when they are set, so the 12,900-row
        # file does not pay for zeros on every line.
        if specific:
            rec["s"] = specific
            rec["u"] = specific_unit(rec["m"])
            specific_lines += 1
            if not rec["u"]:
                unparsed_units.append((hts, rec["m"]))
            if ad_val:
                # Compound: value x ad valorem PLUS quantity x specific. Both
                # legs apply, so these need a quantity.
                rec["cmp"] = 1
                compound_lines += 1
        if other:
            rec["o"] = other

        # program -> ad valorem rate under that program (0.0 == free)
        progs = {}
        for p in PROGRAMS:
            if not (r.get(f"{p}_indicator") or "").strip():
                continue
            rate = num(r.get(f"{p}_ad_val_rate"))
            progs[p] = 0.0 if rate is None else rate
            program_counts[p] += 1
        if progs:
            rec["p"] = progs

        addl = (r.get("additional_duty") or "").strip()
        if addl:
            rec["ad"] = addl

        rows.append(rec)

        ch = hts[:2]
        entry = chapters.setdefault(ch, {"n": 0, "eg": rec["d"]})
        entry["n"] += 1

    index = {
        "generated": date.today().isoformat(),
        "year": year,
        "source": f"USITC Tariff Database {year}",
        "sourceUrl": SOURCE_URL.format(year=year),
        "landingUrl": LANDING_URL,
        "rows": len(rows),
        "dataPath": f"data/tariffs-{year}.json",
        "specificRateLines": specific_lines,
        "compoundRateLines": compound_lines,
        "notComputableLines": nc_lines,
        "programs": program_counts,
        # AGOA's apparel benefit is absent from the ordinary chapter 61/62
        # lines. It runs through these chapter 98 provisions, and qualifying
        # under one is a rules-of-origin determination (yarn-forward, or the
        # lesser-developed-country exception) that a tariff line cannot
        # settle. The calculator surfaces these as a conditional preference
        # instead of applying them silently.
        "agoaApparelProvisions": [
            {"h": r["h"], "d": r["d"]} for r in rows if r["h"].startswith("9819")
        ],
        # Statutory scope, stated in the data itself so the UI cannot forget it.
        "scope": (
            "Statutory HTS rates only: column 1 general (MFN), column 1 special "
            "(preference programs and free trade agreements), and column 2. "
            "Section 301, Section 232 and IEEPA actions live in HTS chapter 99 "
            "and are NOT included."
        ),
        "chapters": {k: chapters[k] for k in sorted(chapters)},
    }

    os.makedirs(DATA_DIR, exist_ok=True)
    data_path = os.path.join(DATA_DIR, f"tariffs-{year}.json")
    index_path = os.path.join(DATA_DIR, "tariffs-index.json")

    blob = json.dumps(rows, ensure_ascii=False, separators=(",", ":"))
    with open(data_path, "w", encoding="utf-8") as fh:
        fh.write(blob)
    # serve.py does not compress; ship a gzipped copy for real hosting.
    with gzip.open(data_path + ".gz", "wt", encoding="utf-8") as fh:
        fh.write(blob)
    with open(index_path, "w", encoding="utf-8") as fh:
        json.dump(index, fh, ensure_ascii=False, separators=(",", ":"))

    raw_mb = len(blob.encode()) / 1e6
    gz_mb = os.path.getsize(data_path + ".gz") / 1e6

    print(f"rows               : {len(rows)}")
    print(f"chapters           : {len(chapters)}")
    print(f"specific-rate lines: {specific_lines}  (compound: {compound_lines})")
    print(f"not computable     : {nc_lines}  (sentinel 9999.999999)")
    print(f"unparsed units     : {len(unparsed_units)}")
    for hts, txt in unparsed_units[:5]:
        print(f"    {hts}  {txt!r}")
    print(f"json               : {raw_mb:.2f} MB")
    print(f"json.gz            : {gz_mb:.2f} MB")
    print(f"index              : {os.path.getsize(index_path) / 1024:.0f} KB")
    print()
    print("program coverage:")
    for p in PROGRAMS:
        print(f"  {p:<12} {program_counts[p]:>6}")
    print()

    # Spot checks against known lines, so a bad build is loud.
    def show(code, note):
        hit = next((r for r in rows if r["h"] == code), None)
        if not hit:
            print(f"  {code}  NOT FOUND  ({note})")
            return
        progs = ",".join(sorted(hit.get("p", {}))) or "none"
        print(f"  {code}  mfn={hit['m']!r} adval={hit['a']} "
              f"spec={hit.get('s', 0)}{'/' + hit['u'] if hit.get('u') else ''} "
              f"| {note}")
        print(f"            programs: {progs}")

    print("spot checks:")
    show("61099010", "t-shirts MMF — 32% ad val; AGOA NOT on this line")
    show("98191103", "AGOA apparel provision — Free (D), rules-of-origin gated")
    show("04022950", "compound — $1.104/kg + 14.9%")
    show("01042000", "specific only — 68 cents/head")


if __name__ == "__main__":
    main()
