#!/usr/bin/env bash
# Deterministic production icon generator (BRAND-03).
# Produces assets/icon.png = 1024x1024, square, OPAQUE (no alpha) from OneTool.png
# on the brand navy #031125. Logo is scaled-to-fit (NOT stretched) then padded.
# Re-runnable; overwrites assets/icon.png in place.
set -euo pipefail

cd "$(dirname "$0")/.."   # apps/mobile

SRC="assets/OneTool.png"
OUT="assets/icon.png"
NAVY="ffffff"             # sips padColor: 6-digit hex, no leading # — white field so the navy "OneTool" wordmark stays legible (navy-on-navy blends out)
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# 1. Scale logo to fit within 1024 on its longest edge (aspect preserved — no distortion).
sips -Z 1024 "$SRC" --out "$TMP/scaled.png" >/dev/null

# 2. Pad to a centered 1024x1024 square with navy fill (letterbox, not stretch).
sips "$TMP/scaled.png" --padToHeightWidth 1024 1024 --padColor "$NAVY" --out "$TMP/padded.png" >/dev/null

# 3. Flatten alpha. `--setProperty hasAlpha no` is UNRELIABLE on macOS sips (leaves
#    hasAlpha:yes), so round-trip through JPEG (no alpha channel — transparent areas
#    are matted to the surrounding navy) then back to PNG. Verified opaque.
sips -s format jpeg "$TMP/padded.png" --out "$TMP/flat.jpg" >/dev/null
sips -s format png  "$TMP/flat.jpg"   --out "$OUT" >/dev/null

# 4. Assert the contract.
DIMS="$(sips -g pixelWidth -g pixelHeight -g hasAlpha "$OUT")"
echo "$DIMS"
echo "$DIMS" | grep -q "pixelWidth: 1024"  || { echo "FAIL: width != 1024"; exit 1; }
echo "$DIMS" | grep -q "pixelHeight: 1024" || { echo "FAIL: height != 1024"; exit 1; }
echo "$DIMS" | grep -q "hasAlpha: no"      || { echo "FAIL: icon still has alpha"; exit 1; }
echo "gen-icon: assets/icon.png is 1024x1024 opaque OK"
