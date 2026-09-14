// Builds src/data/floorplans.json and src/data/directory.json from the traced IOI City Mall levels.
// Usage: node scripts/ioi-build-data.mjs
// Input: docs/research/ioi/traced/<LEVEL>.json (see docs/research/ioi/TRACING_SCHEMA.md).
// Every level is translated so its East Court landmark sits at plan (0, 0); the board draws all levels
// at the same scale, so no scaling is needed.
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const LEVELS = [
  { file: "LG", id: "LG", label: "Lower Ground" },
  { file: "G", id: "G", label: "Ground" },
  { file: "L1", id: "1", label: "Level 1" },
  { file: "L2", id: "2", label: "Level 2" },
  { file: "L3", id: "3", label: "Level 3" },
  { file: "L4", id: "4", label: "Level 4" },
];

// Category by anchor name, matched case-insensitively on a prefix.
const ANCHOR_CATEGORIES = [
  ["parkson", "Department store"],
  ["aeon", "Department store & supermarket"],
  ["lotus", "Hypermarket"],
  ["homepro", "Home improvement"],
  ["harvey norman", "Electronics & furniture"],
  ["nitori", "Home furnishing"],
  ["maju home", "Home furnishing"],
  ["sports direct", "Sports"],
  ["mst golf", "Golf"],
  ["h&m", "Fashion"],
  ["uniqlo", "Fashion"],
  ["max fashion", "Fashion"],
  ["muji", "Lifestyle"],
  ["jd", "Sports fashion"],
  ["decathlon", "Sports"],
  ["padini", "Fashion"],
  ["outpozt", "Outdoor & lifestyle"],
  ["proton", "Car showroom"],
  ["haidilao", "Hotpot restaurant"],
  ["toys", "Toys"],
  ["baby shop", "Baby & kids"],
  ["la gaya", "Fashion"],
  ["icescape", "Ice rink"],
  ["molly fantasy", "Kids' play"],
  ["objet", "Lifestyle"],
  ["brands outlet", "Fashion outlet"],
  ["al-ikhsan", "Sports"],
  ["district 21", "Adventure park"],
  ["jonetz", "Japanese discount store"],
  ["jom amigo", "Café & dining"],
  ["gsc", "Cinema"],
  ["all it", "Computers & electronics"],
  ["daiso", "Variety store"],
  ["popular", "Books & stationery"],
  ["food junction", "Food court"],
  ["wangsa bowl", "Bowling"],
  ["ioi city farm", "Indoor farm & petting zoo"],
  ["best", "Electronics"],
  ["kiddy topia", "Kids' play"],
  ["spotlight", "Craft & fabric"],
  ["brightstar", "Kids' education"],
  ["kaison", "Home & gifts"],
  ["more design", "Home & gifts"],
  ["maharaja", "Karaoke"],
  ["ioi grand", "Ballroom & events"],
  ["rollerwa", "Roller skating"],
  ["believe fitness", "Gym"],
  ["food empire", "Food court"],
  ["jj banquet", "Chinese restaurant"],
  ["ioi sports centre", "Sports centre"],
];

function categoryFor(name) {
  const key = name.toLowerCase();
  return ANCHOR_CATEGORIES.find(([prefix]) => key.startsWith(prefix))?.[1] ?? "Anchor";
}

function titleCase(name) {
  const keep = new Set(["IOI", "GSC", "JD", "MST", "H&M", "JJ", "AEON"]);
  return name
    .split(/\s+/)
    .map((word) => (keep.has(word) ? word : word.charAt(0) + word.slice(1).toLowerCase()))
    .join(" ")
    .replace(/'S\b/g, "'s")
    .replace(/’S\b/g, "’s")
    .replace(/&/g, "&");
}

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const floorplans = [];
const directory = {};

for (const level of LEVELS) {
  let traced;
  try {
    traced = JSON.parse(await readFile(join(ROOT, `docs/research/ioi/traced/${level.file}.json`), "utf8"));
  } catch {
    console.log(`skip ${level.file}: not traced yet`);
    continue;
  }
  const [ox, oy] = traced.landmarks.eastCourt;
  const shift = ([x, y]) => [Math.round((x - ox) * 10) / 10, Math.round((y - oy) * 10) / 10];
  const seen = new Set();
  const units = traced.units.map((unit, index) => {
    const label = String(unit.label ?? "?").trim();
    let id = `ioi-${level.id.toLowerCase()}-${slug(label) || "unit"}`;
    while (seen.has(id)) id = `${id}-${index}`;
    seen.add(id);
    const polygon = unit.polygon.map(shift);
    const centre = polygon.reduce(([ax, ay], [x, y]) => [ax + x / polygon.length, ay + y / polygon.length], [0, 0]);
    return {
      id,
      meshName: `unit_${slug(label)}`,
      unitNumber: unit.unitNumber ?? `${level.file}-${label}`,
      shortNumber: label,
      polygon,
      labelPoint: [Math.round(centre[0] * 10) / 10, Math.round(centre[1] * 10) / 10],
      zone: unit.zone === "east" ? "East wing" : "West wing",
      frontFacing: unit.frontFacing ?? "down",
      numberingNote: null,
      kind: unit.kind ?? "shop",
      name: unit.name ? titleCase(unit.name) : null,
    };
  });
  floorplans.push({
    level: level.id,
    floorLabel: level.label,
    revision: "board-photo-2025-12",
    footprint: traced.footprint.map(shift),
    units,
    corridor: (traced.corridor ?? []).map(shift),
    amenities: (traced.amenities ?? []).map((amenity) => ({ ...amenity, at: shift(amenity.at) })),
  });
  directory[level.id] = units.map((unit) => ({
    unitId: unit.id,
    unitNumber: unit.unitNumber,
    name: unit.name ?? (unit.kind === "kiosk" ? `Kiosk ${unit.shortNumber}` : `Unit ${unit.shortNumber}`),
    category: unit.name ? categoryFor(unit.name) : unit.kind === "kiosk" ? "Kiosk" : "Details under review",
    description: null,
    tenantKey: null,
    thumb: null,
  }));
  console.log(`${level.file}: ${units.length} units, ${floorplans.at(-1).amenities.length} amenities, corridor ${floorplans.at(-1).corridor.length} pts`);
}

await writeFile(join(ROOT, "src/data/floorplans.json"), JSON.stringify(floorplans));
await writeFile(join(ROOT, "src/data/directory.json"), JSON.stringify(directory, null, 1));
console.log("wrote src/data/floorplans.json and src/data/directory.json");
