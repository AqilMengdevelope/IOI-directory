// Checks IOI City Mall's live Abuzz directory for a new release and, when there is one, refreshes the
// app's data: downloads data.json + geometry.json, re-runs the media / build / brand-colour steps and
// records what changed (new shops, closures, openings, moves) in src/data/mall-updates.json.
//
// Usage: node scripts/ioi-sync-abuzz.mjs [--force] [--summary <file.md>]
//   --force    rebuild even when the live version matches the one in the repo
//   --summary  also write a Markdown summary of the changes (used as the PR description)
//
// In GitHub Actions it writes `changed`, `version` and `review` to $GITHUB_OUTPUT. `review=true` means
// the release looks suspicious (lots of shops gone, levels missing) and should not be auto-merged.
import { execFileSync } from "node:child_process";
import { appendFile, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const BASE = "https://map.abuzzsolutions.asia";
const SITE = `${BASE}/api/medias/site/ICM/map`;
const HEADERS = { "User-Agent": "Mozilla/5.0", Referer: `${BASE}/amap/map.php?site=ICM` };
const DATA_PATH = join(ROOT, "docs/research/ioi/abuzz/data.json");
const GEOMETRY_PATH = join(ROOT, "docs/research/ioi/abuzz/geometry.json");
const UPDATES_PATH = join(ROOT, "src/data/mall-updates.json");
const PYTHON = process.env.PYTHON ?? "python3";
/** How many past releases the "What's new" history keeps. */
const KEEP_UPDATES = 20;

const args = process.argv.slice(2);
const force = args.includes("--force");
const summaryIndex = args.indexOf("--summary");
const summaryPath = summaryIndex === -1 ? null : args[summaryIndex + 1];

async function fetchText(url) {
  const response = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return response.text();
}

async function output(values) {
  if (!process.env.GITHUB_OUTPUT) return;
  await appendFile(process.env.GITHUB_OUTPUT, Object.entries(values).map(([k, v]) => `${k}=${v}\n`).join(""));
}

function run(command, ...commandArgs) {
  console.log(`\n$ ${command} ${commandArgs.join(" ")}`);
  execFileSync(command, commandArgs, { cwd: ROOT, stdio: "inherit" });
}

// ---------------------------------------------------------------------------
// 1. Is there a new release?
// ---------------------------------------------------------------------------

const liveDataText = await fetchText(`${SITE}/cache/data.json`);
const live = JSON.parse(liveDataText);
if (!Array.isArray(live.pois) || live.pois.length < 100 || typeof live.version !== "number") {
  throw new Error(`live data.json doesn't look like the mall directory (version ${live.version}, ${live.pois?.length} POIs)`);
}
const previous = JSON.parse(await readFile(DATA_PATH, "utf8"));
console.log(`repo version ${previous.version} (${previous.releaseDate}) · live version ${live.version} (${live.releaseDate})`);

if (live.version === previous.version && !force) {
  console.log("Directory is up to date.");
  await output({ changed: "false", version: live.version, review: "false" });
  process.exit(0);
}

// ---------------------------------------------------------------------------
// 2. Refresh the source files and rebuild the app data.
// ---------------------------------------------------------------------------

const liveGeometryText = await fetchText(`${SITE}/amap/geometry.json`);
const geometry = JSON.parse(liveGeometryText);
if (!Array.isArray(geometry.zones) || !Array.isArray(geometry.elements)) throw new Error("live geometry.json has no zones/elements");
const previousGeometry = JSON.parse(await readFile(GEOMETRY_PATH, "utf8"));

await writeFile(DATA_PATH, liveDataText);
await writeFile(GEOMETRY_PATH, liveGeometryText);
run(PYTHON, "scripts/ioi-fetch-media.py");
run("node", "scripts/ioi-build-from-abuzz.mjs");
run(PYTHON, "scripts/ioi-brand-colors.py");

// ---------------------------------------------------------------------------
// 3. What changed, shop by shop.
// ---------------------------------------------------------------------------

const COMING_SOON = /\s*\(?\b(?:coming|opening)\s+soon\b\)?\s*/i;
const title = (p) => p?.title?.find((t) => t.lang === "EN")?.value ?? p?.title?.[0]?.value ?? null;
function describe(poi) {
  const raw = title(poi);
  const comingSoon = !!raw && COMING_SOON.test(raw);
  return { name: (comingSoon ? raw.replace(COMING_SOON, " ").trim() : raw?.trim()) || null, comingSoon, lot: poi.cellId?.trim() || null };
}
const LEVEL_BY_PREFIX = [
  [/^LG/i, "LG"],
  [/^L1/i, "1"],
  [/^L2/i, "2"],
  [/^L3/i, "3"],
  [/^L4/i, "4"],
  [/^G/i, "G"],
];
const floorFromLot = (lot) => LEVEL_BY_PREFIX.find(([pattern]) => lot && pattern.test(lot))?.[1] ?? null;
// Areas and hotels around the mall aren't shops.
const isShop = (poi) => !(poi.categories ?? []).some((c) => c === "hotel" || c === "hidden_poi");

const directory = JSON.parse(await readFile(join(ROOT, "src/data/directory.json"), "utf8"));
const spaceByPoi = new Map();
for (const [floor, spaces] of Object.entries(directory)) {
  for (const space of spaces) if (space.poiId && !spaceByPoi.has(space.poiId)) spaceByPoi.set(space.poiId, { ...space, floor });
}

const before = new Map(previous.pois.filter(isShop).map((p) => [p.id, p]));
const after = new Map(live.pois.filter(isShop).map((p) => [p.id, p]));
const changes = [];
const entry = (type, poi, extra = {}) => {
  const { name, lot } = describe(poi);
  const space = spaceByPoi.get(poi.id);
  // Units without a lot code get a made-up number from their map position; don't show that.
  const unitNumber = lot ?? (space && !/_\d/.test(space.unitNumber) ? space.unitNumber : null);
  return { type, name, unitNumber, floor: space?.floor ?? floorFromLot(lot), unitId: space?.unitId ?? null, ...extra };
};

for (const [id, poi] of after) {
  const now = describe(poi);
  if (!now.name) continue;
  const old = before.get(id);
  if (!old) {
    changes.push(entry(now.comingSoon ? "coming-soon" : "new", poi));
    continue;
  }
  const was = describe(old);
  if (was.comingSoon && !now.comingSoon) changes.push(entry("opened", poi));
  else if (!was.comingSoon && now.comingSoon) changes.push(entry("coming-soon", poi));
  else if (was.name && was.name !== now.name) changes.push(entry("renamed", poi, { previousName: was.name }));
  if (was.lot && now.lot && was.lot.replace(/\s/g, "") !== now.lot.replace(/\s/g, "")) {
    changes.push(entry("moved", poi, { previousUnitNumber: was.lot }));
  }
}
for (const [id, poi] of before) {
  if (after.has(id) || !describe(poi).name) continue;
  // The same shop re-listed under a new POI (a common way the mall edits entries) isn't a closure.
  const { name, lot } = describe(poi);
  const relisted = [...after.values()].some((p) => {
    const other = describe(p);
    return other.name?.toLowerCase() === name.toLowerCase() && (!lot || !other.lot || floorFromLot(other.lot) === floorFromLot(lot));
  });
  if (!relisted) changes.push({ type: "closed", name, unitNumber: lot, floor: floorFromLot(lot), unitId: null });
}
// One line per shop per kind: the mall lists some shops twice (e.g. "G-224&225" and "G-224 & 225").
const seen = new Set();
const unique = changes.filter((change) => {
  const key = `${change.type}|${change.name.toLowerCase()}`;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});
const ORDER = ["new", "opened", "coming-soon", "renamed", "moved", "closed"];
unique.sort((a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type) || a.name.localeCompare(b.name));

// Releases that look broken get flagged for a human instead of shipping on their own.
const closed = unique.filter((change) => change.type === "closed").length;
const poiDrop = 1 - after.size / Math.max(1, before.size);
const reasons = [];
if (closed > 25) reasons.push(`${closed} shops disappeared`);
if (poiDrop > 0.1) reasons.push(`the directory shrank by ${Math.round(poiDrop * 100)}%`);
if (geometry.zones.length !== previousGeometry.zones.length) reasons.push(`level count changed (${previousGeometry.zones.length} → ${geometry.zones.length})`);
const floorsWithUnits = Object.values(directory).filter((spaces) => spaces.length > 0).length;
if (floorsWithUnits < 6) reasons.push(`only ${floorsWithUnits} of 6 levels have shops`);

const detectedAt = new Date().toISOString();
let history = { updates: [] };
try {
  history = JSON.parse(await readFile(UPDATES_PATH, "utf8"));
} catch {
  // First sync: start the history.
}
if (live.version !== previous.version) {
  history.updates = [
    { version: live.version, previousVersion: previous.version, releaseDate: `${live.releaseDate.slice(0, 19)}+08:00`, detectedAt, changes: unique },
    ...history.updates.filter((update) => update.version !== live.version),
  ].slice(0, KEEP_UPDATES);
  await writeFile(UPDATES_PATH, JSON.stringify(history, null, 1));
}

// ---------------------------------------------------------------------------
// 4. Report.
// ---------------------------------------------------------------------------

const LABEL = {
  new: "New shops",
  opened: "Now open (were coming soon)",
  "coming-soon": "Coming soon",
  renamed: "Renamed",
  moved: "Moved unit",
  closed: "Left the mall",
};
const floorName = (floor) => (floor === "LG" ? "Lower Ground" : floor === "G" ? "Ground" : floor ? `Level ${floor}` : "—");
const lines = [
  `## IOI City Mall directory: version ${previous.version} → ${live.version}`,
  "",
  `The mall published a new directory release on ${live.releaseDate.slice(0, 10)}. This PR refreshes the shop data, logos, offers and the "What's new" list.`,
  "",
];
if (reasons.length) {
  lines.push(`> [!WARNING]`, `> **Not auto-merged: please check this release.** ${reasons.join("; ")}.`, "");
}
if (!unique.length) lines.push("No shops opened, closed or moved. The release changed details only (descriptions, offers, logos or map shapes).", "");
for (const type of ORDER) {
  const rows = unique.filter((change) => change.type === type);
  if (!rows.length) continue;
  lines.push(`### ${LABEL[type]} (${rows.length})`, "", "| Shop | Unit | Level |", "| --- | --- | --- |");
  for (const row of rows) {
    const name = row.previousName ? `${row.previousName} → ${row.name}` : row.name;
    const unit = row.previousUnitNumber ? `${row.previousUnitNumber} → ${row.unitNumber}` : (row.unitNumber ?? "—");
    lines.push(`| ${name.replace(/\|/g, "/")} | ${unit} | ${floorName(row.floor)} |`);
  }
  lines.push("");
}
const offers = JSON.parse(await readFile(join(ROOT, "src/data/mall-info.json"), "utf8")).offers.length;
lines.push(`Shops listed: ${before.size} → ${after.size} · offers: ${offers}`, "", "_Opened by the scheduled `Sync IOI directory` workflow._");
const summary = lines.join("\n");
console.log(`\n${summary}`);
if (summaryPath) await writeFile(summaryPath, summary);
await output({ changed: "true", version: live.version, review: reasons.length ? "true" : "false" });
