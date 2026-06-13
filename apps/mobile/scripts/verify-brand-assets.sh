#!/usr/bin/env bash
# Cheap regression guard for Phase 27 brand assets (BRAND-01 / BRAND-03).
# Asserts icon.png and splash.png meet the native-build contract via sips metadata.
# This is a lint-grade dimension/alpha check — NOT a visual-parity check (that is the
# on-device human gate in 27-02 Task 3).
set -euo pipefail

cd "$(dirname "$0")/.."   # apps/mobile

fail() { echo "FAIL: $1"; exit 1; }

# --- Icon: square 1024x1024, opaque (Apple requirement) ---
ICON="$(sips -g pixelWidth -g pixelHeight -g hasAlpha assets/icon.png)"
echo "icon.png:"; echo "$ICON"
echo "$ICON" | grep -q "pixelWidth: 1024"  || fail "icon width != 1024"
echo "$ICON" | grep -q "pixelHeight: 1024" || fail "icon height != 1024"
echo "$ICON" | grep -q "hasAlpha: no"      || fail "icon has alpha (Apple rejects)"

# --- Splash: opaque, portrait, matches the pinned 1284x2778 canvas ---
SPLASH="$(sips -g pixelWidth -g pixelHeight -g hasAlpha assets/splash.png)"
echo "splash.png:"; echo "$SPLASH"
echo "$SPLASH" | grep -q "pixelWidth: 1284"  || fail "splash width != 1284 (pinned canvas)"
echo "$SPLASH" | grep -q "pixelHeight: 2778" || fail "splash height != 2778 (pinned canvas)"
echo "$SPLASH" | grep -q "hasAlpha: no"      || fail "splash has alpha (must be opaque)"

echo "verify-brand-assets: icon + splash OK"
