#!/bin/sh
# Rebuild data/ from the public source files. See README "Rebuilding the data".
# RAW defaults to ../raw (outside the repo); the downloads are not committed.
set -eu
RAW=${RAW:-../raw}
python3 -I scripts/build_data.py \
  --eia "$RAW/eia930/EIA930_BALANCE_2025_Jul_Dec.csv" "$RAW/eia930/EIA930_BALANCE_2026_Jan_Jun.csv" "$RAW/eia930/EIA930_BALANCE_2026_Jul_Dec.csv" \
  --egrid "$RAW/egrid2023_data_rev2.xlsx" \
  --start 2025-10-01 --end 2026-09-30 --out data \
  --lastmod '{"EIA930_BALANCE_2025_Jul_Dec.csv":"Sat, 24 Oct 2026 14:39:48 GMT","EIA930_BALANCE_2026_Jan_Jun.csv":"Sat, 24 Oct 2026 14:39:54 GMT","EIA930_BALANCE_2026_Jul_Dec.csv":"Sat, 24 Oct 2026 14:40:00 GMT"}'
