"""Cuts each IOI City Mall level crop into labelled, upscaled tiles with a coordinate grid.

Usage: python3 scripts/ioi-tiles.py
Reads docs/research/ioi/levels/<LEVEL>.jpg and writes tiles to docs/research/ioi/levels/tiles/<LEVEL>/.
Grid labels are in the level crop's own pixel coordinates so tracers can read positions directly.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent / "docs/research/ioi/levels"
LEVELS = ["LG", "G", "L1", "L2", "L3", "L4"]
TILE = 450
OVERLAP = 60
SCALE = 2
GRID = 50


def font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for path in ("/System/Library/Fonts/Helvetica.ttc", "/Library/Fonts/Arial.ttf"):
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()


def draw_grid(img: Image.Image, ox: int, oy: int, scale: int) -> Image.Image:
    draw = ImageDraw.Draw(img, "RGBA")
    w, h = img.size
    small, big = font(11 * scale // 2 + 4), font(13 * scale // 2 + 6)
    for gx in range((ox // GRID) * GRID, ox + w // scale + GRID, GRID):
        x = (gx - ox) * scale
        if 0 <= x < w:
            major = gx % 100 == 0
            draw.line([(x, 0), (x, h)], fill=(255, 0, 0, 140 if major else 60), width=2 if major else 1)
            if major:
                draw.text((x + 3, 2), str(gx), fill=(200, 0, 0, 255), font=big)
    for gy in range((oy // GRID) * GRID, oy + h // scale + GRID, GRID):
        y = (gy - oy) * scale
        if 0 <= y < h:
            major = gy % 100 == 0
            draw.line([(0, y), (w, y)], fill=(0, 0, 255, 140 if major else 60), width=2 if major else 1)
            if major:
                draw.text((2, y + 3), str(gy), fill=(0, 0, 200, 255), font=big)
    draw.text((w - 120, h - 22), f"grid {GRID}px", fill=(0, 0, 0, 255), font=small)
    return img


for level in LEVELS:
    src = ROOT / f"{level}.jpg"
    if not src.exists():
        continue
    img = Image.open(src).convert("RGB")
    out = ROOT / "tiles" / level
    out.mkdir(parents=True, exist_ok=True)
    w, h = img.size
    overview = draw_grid(img.copy(), 0, 0, 1)
    overview.save(out / "overview-grid.jpg", quality=88)
    n = 0
    for ty in range(0, h, TILE - OVERLAP):
        for tx in range(0, w, TILE - OVERLAP):
            box = (tx, ty, min(tx + TILE, w), min(ty + TILE, h))
            if box[2] - box[0] < 100 or box[3] - box[1] < 100:
                continue
            tile = img.crop(box).resize(((box[2] - box[0]) * SCALE, (box[3] - box[1]) * SCALE), Image.LANCZOS)
            draw_grid(tile, tx, ty, SCALE).save(out / f"tile-x{tx:04d}-y{ty:04d}.jpg", quality=88)
            n += 1
    print(f"{level}: {w}x{h}, {n} tiles")
