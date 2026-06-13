#!/usr/bin/env bash
# Trims the transparent padding off the master OneTool lockup into a tight
# horizontal logo for the iPad sidebar brand row. The master assets/OneTool.png
# keeps ~20%/37% transparent margins (needed by the auth hero, launch card, and
# gen-icon.sh) so it can't be dropped into a compact header without rendering tiny.
# Output: assets/OneTool-wordmark.png — alpha bbox cropped (threshold 16).
# Requires python3 + Pillow (PIL). Re-run after the master logo changes.
set -euo pipefail
cd "$(dirname "$0")/.."

python3 - <<'PY'
from PIL import Image
im = Image.open("assets/OneTool.png").convert("RGBA")
alpha = im.split()[3]
mask = alpha.point(lambda p: 255 if p > 16 else 0)
bbox = mask.getbbox()
if not bbox:
    raise SystemExit("no visible content found in OneTool.png")
out = im.crop(bbox)
out.save("assets/OneTool-wordmark.png")
print(f"OneTool-wordmark.png {out.size[0]}x{out.size[1]} (cropped from {im.size[0]}x{im.size[1]})")
PY
