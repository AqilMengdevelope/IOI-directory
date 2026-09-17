"""Downloads shop logos and storefront photos from IOI City Mall's Abuzz dataset, shrinks them and
writes a manifest the data build consumes.

Usage: python3 scripts/ioi-fetch-media.py
Reads  docs/research/ioi/abuzz/data.json
Writes public/ioi/logos/*, public/ioi/cards/*, docs/research/ioi/media-manifest.json
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

data = json.loads((ROOT / "docs/research/ioi/abuzz/data.json").read_text())
logo_dir = ROOT / "public/ioi/logos"
card_dir = ROOT / "public/ioi/cards"
logo_dir.mkdir(parents=True, exist_ok=True)
card_dir.mkdir(parents=True, exist_ok=True)


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
    out_dir, limit = (logo_dir, LOGO_MAX) if kind == "logo" else (card_dir, CARD_MAX)
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

manifest: dict[str, dict] = {}
with ThreadPoolExecutor(max_workers=6) as pool:
    for geo_id, kind, result in pool.map(process, jobs):
        if result:
            manifest.setdefault(geo_id, {})[kind] = result

(ROOT / "docs/research/ioi/media-manifest.json").write_text(json.dumps(manifest, indent=1))
logos = sum(1 for m in manifest.values() if "logo" in m)
cards = sum(1 for m in manifest.values() if "card" in m)
print(f"jobs {len(jobs)}: logos {logos}, cards {cards}")
