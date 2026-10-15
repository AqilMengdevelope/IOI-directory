"""Picks a brand colour for every IOI City Mall tenant from its logo, for brand-matched shop interiors.

Usage: python3 scripts/ioi-brand-colors.py
Reads src/data/floorplans.json and the logos under public/, writes src/data/brand-colors.json:
{ "<unitId>": { "primary": "#rrggbb", "accent": "#rrggbb" | null } }.

The primary is the logo's most common non-white colour, with saturated colours counted double so a
red wordmark on a grey tile still reads as red. The accent is the next colour of a clearly different
hue, if the logo has one. Logos that are all white (or fail to load) are left out.
"""

from __future__ import annotations

import colorsys
import json
from collections import Counter
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
FLOORPLANS = ROOT / "src/data/floorplans.json"
OUT = ROOT / "src/data/brand-colors.json"
SAMPLE = 64
BUCKET = 24


def to_hex(rgb: tuple[float, float, float]) -> str:
    return "#" + "".join(f"{round(max(0, min(255, c))):02x}" for c in rgb)


def colours(path: Path) -> tuple[str, str | None] | None:
    try:
        image = Image.open(path).convert("RGBA")
    except OSError:
        return None
    image.thumbnail((SAMPLE, SAMPLE))
    counts: Counter[tuple[int, int, int]] = Counter()
    sums: dict[tuple[int, int, int], list[float]] = {}
    for r, g, b, a in image.getdata():
        if a < 128:
            continue
        h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
        if v > 0.9 and s < 0.12:
            continue  # white / paper
        key = (r // BUCKET, g // BUCKET, b // BUCKET)
        counts[key] += 2 if s > 0.35 and v > 0.2 else 1
        acc = sums.setdefault(key, [0.0, 0.0, 0.0, 0.0])
        acc[0] += r
        acc[1] += g
        acc[2] += b
        acc[3] += 1
    if not counts:
        return None
    ranked = [(key, sums[key]) for key, _ in counts.most_common()]
    mean = lambda acc: (acc[0] / acc[3], acc[1] / acc[3], acc[2] / acc[3])  # noqa: E731
    primary = mean(ranked[0][1])
    ph, ps, _ = colorsys.rgb_to_hsv(*(c / 255 for c in primary))
    accent = None
    for _, acc in ranked[1:12]:
        rgb = mean(acc)
        h, s, v = colorsys.rgb_to_hsv(*(c / 255 for c in rgb))
        hue_gap = min(abs(h - ph), 1 - abs(h - ph))
        if s > 0.3 and v > 0.2 and (ps < 0.25 or hue_gap > 0.07):
            accent = rgb
            break
    return to_hex(primary), to_hex(accent) if accent else None


def main() -> None:
    plans = json.loads(FLOORPLANS.read_text())
    out: dict[str, dict[str, str | None]] = {}
    for plan in plans:
        for unit in plan["units"]:
            logo = unit.get("logo")
            if not logo:
                continue
            picked = colours(ROOT / "public" / logo["src"].lstrip("/"))
            if picked:
                out[unit["id"]] = {"primary": picked[0], "accent": picked[1]}
    OUT.write_text(json.dumps(out, indent=1, sort_keys=True) + "\n")
    print(f"wrote {len(out)} brand colours to {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
