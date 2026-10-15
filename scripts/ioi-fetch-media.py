"""Downloads shop logos, storefront photos and offer/announcement images from IOI City Mall's Abuzz
dataset, shrinks them and writes a manifest the data build consumes.

Usage: python3 scripts/ioi-fetch-media.py
Reads  docs/research/ioi/abuzz/data.json
Writes public/ioi/{logos,cards,whats-on}/*, docs/research/ioi/media-manifest.json

Images already on disk are reused, and images no POI or offer points at any more are deleted, so
the folders track the mall's current directory.
"""

from __future__ import annotations

import io
import json
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
BASE = "https://map.abuzzsolutions.asia"
HEADERS = {"User-Agent": "Mozilla/5.0", "Referer": f"{BASE}/amap/map.php?site=ICM"}
LOGO_MAX = 256
CARD_MAX = 720
WHATS_ON_MAX = 720

data = json.loads((ROOT / "docs/research/ioi/abuzz/data.json").read_text())
logo_dir = ROOT / "public/ioi/logos"
card_dir = ROOT / "public/ioi/cards"
whats_on_dir = ROOT / "public/ioi/whats-on"
DIRS = {"logo": (logo_dir, LOGO_MAX), "card": (card_dir, CARD_MAX), "image": (whats_on_dir, WHATS_ON_MAX)}
for directory, _ in DIRS.values():
    directory.mkdir(parents=True, exist_ok=True)


def pick(entries: list[dict] | None) -> str | None:
    if not entries:
        return None
    english = [e for e in entries if e.get("lang") == "EN" and e.get("type") == "IMAGE"]
    return (english or entries)[0].get("link")


def fetch(link: str) -> bytes:
    request = urllib.request.Request(BASE + link, headers=HEADERS)
    with urllib.request.urlopen(request, timeout=40) as response:
        return response.read()


def process(job: tuple[str, str, str]) -> tuple[str, str, dict | None]:
    geo_id, kind, link = job
    stem = Path(link).stem
    out_dir, limit = DIRS[kind]
    try:
        existing = next(out_dir.glob(stem + ".*"), None)
        if existing:
            with Image.open(existing) as img:
                return geo_id, kind, {"src": f"/ioi/{out_dir.name}/{existing.name}", "w": img.width, "h": img.height}
        img = Image.open(io.BytesIO(fetch(link)))
        img.load()
        has_alpha = img.mode in ("RGBA", "LA", "P") and "transparency" in img.info or img.mode in ("RGBA", "LA")
        img = img.convert("RGBA" if has_alpha else "RGB")
        img.thumbnail((limit, limit), Image.LANCZOS)
        if has_alpha:
            path = out_dir / f"{stem}.png"
            img.save(path, optimize=True)
        else:
            path = out_dir / f"{stem}.jpg"
            img.save(path, quality=84, optimize=True)
        return geo_id, kind, {"src": f"/ioi/{out_dir.name}/{path.name}", "w": img.width, "h": img.height}
    except Exception as error:  # noqa: BLE001 - one bad image must not stop the run
        print(f"FAILED {kind} {link}: {error}")
        return geo_id, kind, None


jobs: list[tuple[str, str, str]] = []
for poi in data["pois"]:
    geo_id = poi.get("geoId")
    if not geo_id:
        continue
    logo = pick(poi.get("logo"))
    card = pick(poi.get("card"))
    if logo:
        jobs.append((geo_id, "logo", logo))
    if card:
        jobs.append((geo_id, "card", card))
# Offers and announcements carry one image each, keyed "offer:<id>" / "announcement:<id>".
for kind in ("offers", "announcements"):
    for item in data.get(kind) or []:
        image = pick(item.get("medias"))
        if image and item.get("active") is not False:
            jobs.append((f"{kind[:-1]}:{item['id']}", "image", image))

manifest: dict[str, dict] = {}
failed = 0
with ThreadPoolExecutor(max_workers=6) as pool:
    for geo_id, kind, result in pool.map(process, jobs):
        if result:
            manifest.setdefault(geo_id, {})[kind] = result
        else:
            failed += 1

(ROOT / "docs/research/ioi/media-manifest.json").write_text(json.dumps(manifest, indent=1))
logos = sum(1 for m in manifest.values() if "logo" in m)
cards = sum(1 for m in manifest.values() if "card" in m)
images = sum(1 for m in manifest.values() if "image" in m)

# Drop images of shops and offers that left the directory. Skipped when a download failed, so a
# flaky run never deletes a file the manifest would have kept.
removed = 0
if not failed:
    kept = {entry["src"] for m in manifest.values() for entry in m.values()}
    for directory, _ in DIRS.values():
        for path in directory.iterdir():
            if path.is_file() and f"/ioi/{directory.name}/{path.name}" not in kept:
                path.unlink()
                removed += 1
print(f"jobs {len(jobs)}: logos {logos}, cards {cards}, what's on {images}, failed {failed}, pruned {removed}")
