#!/usr/bin/env bash
# Scrapes Vietnamese zip code data from mabuudien.net
# Outputs: data/provinces.json (province → district → ward hierarchy with zip codes)
#
# Usage: ./scrape.sh
# Requires: rodney, jq
#
# Supports resuming — skips provinces already in data/provinces.json.
# Data source: mabuudien.net (Decision 2475/QD-BTTTT)

set -euo pipefail

DATA_DIR="$(dirname "$0")/data"
mkdir -p "$DATA_DIR"

DELAY=1.5  # seconds between requests to be polite

log() { echo "[$(date +%H:%M:%S)] $*" >&2; }

# --- Step 1: Start browser ---
log "Starting browser..."
rodney start --quiet 2>/dev/null || rodney start

# --- Step 2: Get unique province list ---
log "Fetching province list..."
rodney open "https://mabuudien.net/" >/dev/null
rodney waitstable >/dev/null
sleep 2

# Deduplicate: site has desktop + mobile nav = 126 links for 63 provinces
PROVINCES=$(rodney js "JSON.stringify(Array.from(new Set(Array.from(document.querySelectorAll('.content__city--south__list--regions__city a')).map(a => a.href.replace('https://mabuudien.net/ma-buu-dien-','')))).map(slug => ({slug: slug, name: document.querySelector('a[href=\"https://mabuudien.net/ma-buu-dien-' + slug + '\"]').innerText.trim()})))")

PROVINCE_COUNT=$(echo "$PROVINCES" | jq 'length')
log "Found $PROVINCE_COUNT unique provinces"

# --- Step 3: Load existing progress ---
if [ -f "$DATA_DIR/provinces.json" ]; then
  RESULT=$(cat "$DATA_DIR/provinces.json")
  DONE_SLUGS=$(echo "$RESULT" | jq -r '[.[].slug] | join(",")')
  DONE_COUNT=$(echo "$RESULT" | jq 'length')
  log "Resuming: $DONE_COUNT provinces already scraped"
else
  RESULT="[]"
  DONE_SLUGS=""
  DONE_COUNT=0
fi

# --- Step 4: Scrape each province → districts → wards ---
for i in $(seq 0 $((PROVINCE_COUNT - 1))); do
  PNAME=$(echo "$PROVINCES" | jq -r ".[$i].name")
  PSLUG=$(echo "$PROVINCES" | jq -r ".[$i].slug")

  # Skip if already scraped
  if echo ",$DONE_SLUGS," | grep -q ",$PSLUG,"; then
    log "[$((i+1))/$PROVINCE_COUNT] SKIP (already done): $PNAME ($PSLUG)"
    continue
  fi

  log "[$((i+1))/$PROVINCE_COUNT] Province: $PNAME ($PSLUG)"

  rodney open "https://mabuudien.net/ma-buu-dien-$PSLUG" >/dev/null
  rodney waitstable >/dev/null
  sleep "$DELAY"

  # Get province zip code
  PZIP=$(rodney js "document.querySelectorAll('table')[0]?.rows[1]?.cells[1]?.innerText?.trim() || ''" 2>/dev/null || echo "")

  # Get district list
  DISTRICTS=$(rodney js "JSON.stringify(Array.from(document.querySelectorAll('table')[1]?.rows || []).slice(1).map(r => ({name: r.cells[0]?.innerText?.trim(), zip: r.cells[1]?.innerText?.trim(), slug: r.cells[0]?.querySelector('a')?.href?.split('/').pop() || ''})))" 2>/dev/null || echo "[]")

  DISTRICT_COUNT=$(echo "$DISTRICTS" | jq 'length')
  log "  Found $DISTRICT_COUNT districts, province zip: $PZIP"

  # Scrape wards for each district
  DISTRICTS_WITH_WARDS="[]"
  for j in $(seq 0 $((DISTRICT_COUNT - 1))); do
    DNAME=$(echo "$DISTRICTS" | jq -r ".[$j].name")
    DZIP=$(echo "$DISTRICTS" | jq -r ".[$j].zip")
    DSLUG=$(echo "$DISTRICTS" | jq -r ".[$j].slug")

    if [ -z "$DSLUG" ] || [ "$DSLUG" = "" ]; then
      log "    Skipping district '$DNAME' (no link)"
      DISTRICTS_WITH_WARDS=$(echo "$DISTRICTS_WITH_WARDS" | jq --arg name "$DNAME" --arg zip "$DZIP" '. + [{name: $name, zip: $zip, wards: []}]')
      continue
    fi

    rodney open "https://mabuudien.net/ma-buu-dien-$PSLUG/$DSLUG" >/dev/null
    rodney waitstable >/dev/null
    sleep "$DELAY"

    WARDS=$(rodney js "JSON.stringify(Array.from(document.querySelectorAll('table')[1]?.rows || []).slice(1).map(r => ({name: r.cells[0]?.innerText?.trim(), zip: r.cells[1]?.innerText?.trim()})))" 2>/dev/null || echo "[]")

    WARD_COUNT=$(echo "$WARDS" | jq 'length')
    log "    District: $DNAME ($DZIP) → $WARD_COUNT wards"

    DISTRICTS_WITH_WARDS=$(echo "$DISTRICTS_WITH_WARDS" | jq \
      --arg name "$DNAME" \
      --arg zip "$DZIP" \
      --argjson wards "$WARDS" \
      '. + [{name: $name, zip: $zip, wards: $wards}]')
  done

  # Add province to result
  RESULT=$(echo "$RESULT" | jq \
    --arg name "$PNAME" \
    --arg slug "$PSLUG" \
    --arg zip "$PZIP" \
    --argjson districts "$DISTRICTS_WITH_WARDS" \
    '. + [{name: $name, slug: $slug, zip: $zip, districts: $districts}]')

  DONE_COUNT=$((DONE_COUNT + 1))
  DONE_SLUGS="$DONE_SLUGS,$PSLUG"

  # Save incremental progress
  echo "$RESULT" | jq '.' > "$DATA_DIR/provinces.json"
  log "  Saved progress ($DONE_COUNT/$PROVINCE_COUNT provinces done)"
done

# --- Step 5: Cleanup ---
rodney stop 2>/dev/null

log "Done! Data saved to $DATA_DIR/provinces.json"
log "Provinces: $(echo "$RESULT" | jq 'length')"
log "Total districts: $(echo "$RESULT" | jq '[.[].districts | length] | add')"
log "Total wards: $(echo "$RESULT" | jq '[.[].districts[].wards | length] | add')"
