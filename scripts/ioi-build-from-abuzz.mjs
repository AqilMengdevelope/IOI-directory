// Builds src/data/floorplans.json, src/data/directory.json and src/data/mall-info.json from IOI City
// Mall's official Abuzz wayfinding dataset (docs/research/ioi/abuzz/geometry.json + data.json).
// Usage: node scripts/ioi-build-from-abuzz.mjs
//
// Abuzz units are centimetres (unitsPerMeter = 100); we emit "plan pixels" in whole metres × 10 so
// the app's PLAN_SCALE of 0.055 gives ~0.55 world units per metre — roughly the scale the GMBB
// explorer was tuned for. Each level is re-zeroed on the East Court so floors stack.
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const geometry = JSON.parse(await readFile(join(ROOT, "docs/research/ioi/abuzz/geometry.json"), "utf8"));
const data = JSON.parse(await readFile(join(ROOT, "docs/research/ioi/abuzz/data.json"), "utf8"));

/** Abuzz zone shortName → app FloorId, for the retail levels we expose. */
const LEVELS = [
  ["LG", "LG", "Lower Ground"],
  ["G", "G", "Ground"],
  ["L1", "1", "Level 1"],
  ["L2", "2", "Level 2"],
  ["L3", "3", "Level 3"],
  ["L4", "4", "Level 4"],
];

// Abuzz cm → plan units. 1 plan unit = 10 cm, so the app's 0.055 scale gives 0.55 world units / m.
const CM_TO_PLAN = 0.1;
// East Court (the round court in the East wing) in Abuzz cm: the escalator pair at (764–771, 234–237) m
// on the Ground level sits on its rim.
const EAST_COURT_CM = [76800, 23500];
// Plan units are decimetres, so areas below are in dm². 12 m² ≈ 1200; 2500 m² ≈ 250000.
const KIOSK_MAX_AREA = 1200;
const ANCHOR_MIN_AREA = 250000;

const CATEGORY_LABEL = Object.fromEntries(
  data.categories.map((c) => [c.code, c.title?.find((t) => t.lang === "EN")?.value ?? c.code]),
);
const poiByGeo = new Map(data.pois.map((p) => [p.geoId, p]));

// Logos and storefront photos fetched by scripts/ioi-fetch-media.py (optional).
let media = {};
try {
  media = JSON.parse(await readFile(join(ROOT, "docs/research/ioi/media-manifest.json"), "utf8"));
} catch {
  console.log("no media manifest yet: run python3 scripts/ioi-fetch-media.py for logos and photos");
}

const ENTITIES = { "&amp;": "&", "&nbsp;": " ", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&rsquo;": "’", "&lsquo;": "‘", "&ndash;": "–", "&mdash;": "—" };

/** Splits a POI's HTML description into plain text plus the phone / website lines the mall embeds in it. */
function parseDescription(poi) {
  const html = poi?.description?.find((d) => d.lang === "EN")?.value ?? poi?.description?.[0]?.value ?? "";
  const text = html
    .replace(/<br\s*\/?>|<\/div>|<\/p>|<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&[a-z#0-9]+;/gi, (m) => ENTITIES[m.toLowerCase()] ?? " ");
  let phone = null;
  let website = null;
  const body = [];
  for (const raw of text.split("\n")) {
    const line = raw.replace(/\s+/g, " ").trim();
    if (!line) continue;
    const p = line.match(/^(?:phone|tel|contact)\s*(?:no\.?)?\s*:\s*(.+)$/i);
    const w = line.match(/^website\s*:\s*(.+)$/i);
    if (p) phone = phone ?? p[1].trim();
    else if (w) website = website ?? w[1].trim();
    else if (!/^(email|facebook|instagram|fb|ig)\s*:/i.test(line)) body.push(line);
  }
  if (website && !/^https?:\/\//i.test(website)) website = /^[\w-]+(\.[\w-]+)+/.test(website) ? `https://${website}` : null;
  if (phone && !/\d{5,}/.test(phone.replace(/\D/g, ""))) phone = null;
  return { description: body.join("\n\n") || null, phone, website };
}
const title = (p) => p?.title?.find((t) => t.lang === "EN")?.value ?? p?.title?.[0]?.value ?? null;

// The mall marks units being fitted out in the shop's title: "Lao Miao (Coming Soon)", or just "Opening Soon".
const COMING_SOON = /\s*\(?\b(?:coming|opening)\s+soon\b\)?\s*/i;
/** A POI's shop name without the "(Coming Soon)" tag, and whether it had one. */
function shopName(poi) {
  const raw = title(poi);
  if (!raw || !COMING_SOON.test(raw)) return { name: raw, comingSoon: false };
  return { name: raw.replace(COMING_SOON, " ").trim() || null, comingSoon: true };
}

// Categories that are buildings/areas around the mall rather than walkable shops.
const NOT_A_SHOP = new Set(["hotel", "hidden_poi"]);
const ANCHOR_CATS = new Set(["anchor", "dptstores", "grocery", "food_court", "entertainment", "hotel"]);

const slug = (v) => String(v).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
// Abuzz y points north (up the map); plan y points down the board, so it is negated — otherwise the
// whole mall renders as a mirror image.
const toPlan = ([cx, cy]) => [
  Math.round((cx - EAST_COURT_CM[0]) * CM_TO_PLAN * 10) / 10,
  Math.round(-(cy - EAST_COURT_CM[1]) * CM_TO_PLAN * 10) / 10,
];

function polygonOf(element) {
  const pts = [];
  for (let i = 0; i < element.pts.length; i += 3) pts.push(toPlan([element.pts[i], element.pts[i + 1]]));
  // Drop a duplicated closing vertex.
  if (pts.length > 1) {
    const [a, b] = [pts[0], pts[pts.length - 1]];
    if (Math.abs(a[0] - b[0]) < 0.01 && Math.abs(a[1] - b[1]) < 0.01) pts.pop();
  }
  return pts;
}

function signedArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

/** Convex hull (monotone chain) of a point set — used for each level's walkable footprint. */
function convexHull(points) {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (const p of pts.reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

/** Which side of a unit faces the walk graph: the edge whose midpoint is nearest any corridor node. */
function frontFacing(polygon, nodes) {
  let best = "down";
  let bestDist = Infinity;
  polygon.forEach((a, i) => {
    const b = polygon[(i + 1) % polygon.length];
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const centre = polygon.reduce(([x, y], [px, py]) => [x + px / polygon.length, y + py / polygon.length], [0, 0]);
    let d = Infinity;
    for (const n of nodes) d = Math.min(d, Math.hypot(n[0] - mid[0], n[1] - mid[1]));
    if (d < bestDist) {
      bestDist = d;
      const dx = mid[0] - centre[0];
      const dy = mid[1] - centre[1];
      best = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
    }
  });
  return best;
}

const floorplans = [];
const directory = {};

for (const [shortName, id, label] of LEVELS) {
  const zn = geometry.zones.findIndex((z) => z.shortName === shortName);
  if (zn < 0) continue;
  const elements = geometry.elements.filter((e) => e.zn === zn);
  const nodes = elements.filter((e) => e.type === "N").map((e) => toPlan(e.con));
  const gates = elements.filter((e) => e.type === "G");

  const units = [];
  const seen = new Set();
  for (const e of elements) {
    if (e.type !== "T" || !e.pts || e.h <= 10) continue;
    const poi = poiByGeo.get(e.geoId);
    const cats = poi?.categories ?? [];
    if (cats.some((c) => NOT_A_SHOP.has(c))) continue;
    const polygon = polygonOf(e);
    if (polygon.length < 3 || Math.abs(signedArea(polygon)) < 1) continue;
    const { name, comingSoon } = shopName(poi);
    const lot = poi?.cellId?.trim() || null;
    const area = Math.abs(signedArea(polygon));
    const isKiosk = cats.includes("kiosk") || area < KIOSK_MAX_AREA;
    const isAnchor = !isKiosk && (cats.some((c) => ANCHOR_CATS.has(c)) || area > ANCHOR_MIN_AREA);
    let uid = `ioi-${id.toLowerCase()}-${slug(lot ?? name ?? e.geoId)}`;
    while (seen.has(uid)) uid = `${uid}-${units.length}`;
    seen.add(uid);
    const centre = polygon.reduce(([x, y], [px, py]) => [x + px / polygon.length, y + py / polygon.length], [0, 0]);
    units.push({
      id: uid,
      meshName: `unit_${slug(lot ?? e.geoId)}`,
      unitNumber: lot ?? `${shortName}-${e.geoId.slice(1, 12)}`,
      shortNumber: lot ? lot.replace(/^(LG|L\d|G)-?/i, "") : "?",
      polygon,
      labelPoint: [Math.round(centre[0] * 10) / 10, Math.round(centre[1] * 10) / 10],
      // The WEST/EAST split on the mall's board sits around the Muji/JD block, ~2 000 dm west of the court.
      zone: centre[0] > -2000 ? "East wing" : "West wing",
      frontFacing: frontFacing(polygon, nodes),
      numberingNote: null,
      kind: isKiosk ? "kiosk" : isAnchor ? "anchor" : "shop",
      name,
      color: "#" + e.col.map((c) => Math.round(c * 255).toString(16).padStart(2, "0")).join(""),
      ...(media[e.geoId]?.logo ? { logo: media[e.geoId].logo } : {}),
      ...(comingSoon ? { comingSoon: true } : {}),
      _cats: cats,
      _poi: poi,
      _geoId: e.geoId,
    });
  }

  // Walkable floor: hull of the walk-graph nodes and unit corners. A convex hull over-covers the
  // crescent-shaped mall, so it is padded only slightly; unit walls do the real containment.
  const footprintPoints = [...nodes, ...units.flatMap((u) => u.polygon)];
  const footprint = convexHull(footprintPoints);

  // Corridor: walk-graph nodes ordered west → east (used for spawn and the drawn walkway).
  const corridor = [...nodes].sort((a, b) => a[0] - b[0]);

  const amenities = gates
    .map((g) => {
      const kind = /escalator/.test(g.cat ?? "") ? "escalator" : g.cat === "lift" ? "lift" : null;
      return kind ? { kind, at: toPlan(g.con), label: null } : null;
    })
    .filter(Boolean);

  floorplans.push({
    level: id,
    floorLabel: label,
    revision: `abuzz-v${data.version}`,
    footprint,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    units: units.map(({ _cats, _poi, _geoId, ...u }) => u),
    corridor,
    amenities,
  });

  directory[id] = units.map((u) => {
    const primary = (u._cats ?? []).find((c) => !["anchor", "clubioi", "level1", "1st_avenue", "2nd_avenue"].includes(c));
    return {
      unitId: u.id,
      poiId: u._poi?.id ?? null,
      unitNumber: u.unitNumber,
      name: u.name ?? (u.comingSoon ? "New shop" : u.kind === "kiosk" ? `Kiosk ${u.shortNumber}` : `Unit ${u.shortNumber}`),
      category: primary
        ? (CATEGORY_LABEL[primary] ?? primary)
        : u.comingSoon
          ? "Opening soon"
          : u.kind === "kiosk"
            ? "Kiosk"
            : "Details under review",
      ...(u.comingSoon ? { comingSoon: true } : {}),
      ...parseDescription(u._poi),
      tenantKey: null,
      // The directory list shows the logo: it is more recognisable at 52 px than a storefront photo.
      thumb: media[u._geoId]?.logo?.src ?? media[u._geoId]?.card?.src ?? null,
      logo: media[u._geoId]?.logo ?? null,
      photo: media[u._geoId]?.card ?? null,
      hours: u._poi?.contact?.hours?.trim() || null,
      floorLabel: label,
    };
  });

  const named = units.filter((u) => u.name).length;
  console.log(
    `${shortName.padEnd(3)} units ${units.length} (named ${named}, anchors ${units.filter((u) => u.kind === "anchor").length}, kiosks ${units.filter((u) => u.kind === "kiosk").length}) nodes ${nodes.length} amenities ${amenities.length}`,
  );
}

// Offers, announcements and opening hours for the "What's on" panel. Offers point at POIs; resolve
// them to the units the app can walk to. Dates are the mall's local time (UTC+8) without an offset.
const unitByPoi = new Map();
for (const [floor, spaces] of Object.entries(directory)) {
  for (const space of spaces) if (space.poiId && !unitByPoi.has(space.poiId)) unitByPoi.set(space.poiId, { floor, unitId: space.unitId });
}
const malaysiaTime = (value) => (value ? `${value.slice(0, 19)}+08:00` : null);
const imageOf = (key) => media[key]?.image ?? null;
const offers = (data.offers ?? [])
  .filter((offer) => offer.active !== false)
  .map((offer) => ({
    id: offer.id,
    title: title(offer),
    // Offer descriptions often repeat the title as their first line.
    description:
      parseDescription(offer)
        .description?.split("\n\n")
        .filter((line, i) => i > 0 || line.toLowerCase() !== title(offer)?.toLowerCase())
        .join("\n\n") || null,
    startsAt: malaysiaTime(offer.startDate),
    endsAt: malaysiaTime(offer.endDate),
    image: imageOf(`offer:${offer.id}`),
    shops: (offer.pOIs ?? []).map((id) => unitByPoi.get(id)).filter(Boolean),
  }))
  .filter((offer) => offer.title);
const announcements = (data.announcements ?? [])
  .filter((item) => item.active !== false)
  .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  .map((item) => {
    const { description, website } = parseDescription(item);
    const link = website ?? description?.match(/https?:\/\/[^\s<]+/)?.[0] ?? null;
    return { id: item.id, title: title(item), description, link, image: imageOf(`announcement:${item.id}`) };
  })
  .filter((item) => item.title);
const mallInfo = {
  version: data.version,
  releaseDate: malaysiaTime(data.releaseDate),
  hours: data.contact?.structuredHours ?? null,
  offers,
  announcements,
};

await writeFile(join(ROOT, "src/data/floorplans.json"), JSON.stringify(floorplans));
await writeFile(join(ROOT, "src/data/directory.json"), JSON.stringify(directory, null, 1));
await writeFile(join(ROOT, "src/data/mall-info.json"), JSON.stringify(mallInfo, null, 1));
console.log(`wrote floorplans, directory and mall-info (${offers.length} offers, ${announcements.length} announcements)`);
