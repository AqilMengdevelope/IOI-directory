"""Overlays a traced level JSON on its crop for visual QA.

Usage: python3 scripts/ioi-plot-traced.py LG [G L1 ...]
Writes docs/research/ioi/traced/<LEVEL>-overlay.jpg.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent / "docs/research/ioi"
COLORS = {"anchor": (200, 30, 30), "shop": (20, 80, 220), "kiosk": (20, 150, 60)}


def font(size: int):
    try:
        return ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", size)
    except OSError:
        return ImageFont.load_default()


for level in sys.argv[1:]:
    data = json.loads((ROOT / "traced" / f"{level}.json").read_text())
    img = Image.open(ROOT / "levels" / f"{level}.jpg").convert("RGB")
    draw = ImageDraw.Draw(img, "RGBA")
    small = font(11)

    fp = [tuple(p) for p in data["footprint"]]
    draw.polygon(fp, outline=(0, 0, 0, 255), fill=(255, 255, 0, 40))
    corridor = [tuple(p) for p in data.get("corridor", [])]
    if len(corridor) > 1:
        draw.line(corridor, fill=(255, 120, 0, 220), width=4)

    for unit in data["units"]:
        pts = [tuple(p) for p in unit["polygon"]]
        colour = COLORS.get(unit.get("kind"), (120, 120, 120))
        draw.polygon(pts, outline=colour + (255,), fill=colour + (50,))
        cx = sum(p[0] for p in pts) / len(pts)
        cy = sum(p[1] for p in pts) / len(pts)
        draw.text((cx, cy), unit.get("label", "?"), fill=(0, 0, 0, 255), font=small, anchor="mm")

    for amenity in data.get("amenities", []):
        x, y = amenity["at"]
        mark = {"escalator": "E", "lift": "L", "toilet": "T", "info": "i", "entrance": "IN"}.get(amenity["kind"], "?")
        draw.ellipse((x - 9, y - 9, x + 9, y + 9), fill=(255, 0, 255, 200))
        draw.text((x, y), mark, fill=(255, 255, 255, 255), font=small, anchor="mm")

    for name, point in data.get("landmarks", {}).items():
        if point:
            x, y = point
            draw.ellipse((x - 12, y - 12, x + 12, y + 12), outline=(0, 0, 0, 255), width=3)
            draw.text((x + 14, y), name, fill=(0, 0, 0, 255), font=font(14), anchor="lm")

    out = ROOT / "traced" / f"{level}-overlay.jpg"
    img.save(out, quality=88)
    kinds = {}
    for unit in data["units"]:
        kinds[unit.get("kind")] = kinds.get(unit.get("kind"), 0) + 1
    print(f"{level}: {len(data['units'])} units {kinds}, {len(data.get('amenities', []))} amenities -> {out.name}")
