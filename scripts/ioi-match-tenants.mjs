// Matches the official IOI City Mall tenant listing (docs/research/ioi/tenant-listing-raw.json,
// scraped from ioicitymall.com.my/?cat=36&tenantlist=full) to the traced units and writes the
// result into src/data/directory.json. Run after scripts/ioi-build-data.mjs.
// Usage: node scripts/ioi-match-tenants.mjs
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const raw = JSON.parse(await readFile(join(ROOT, "docs/research/ioi/tenant-listing-raw.json"), "utf8"));
const directory = JSON.parse(await readFile(join(ROOT, "src/data/directory.json"), "utf8"));

const CATEGORY_LABEL = {
  Anchor: "Anchor",
  Fashion: "Fashion",
  "Children & Maternity": "Children & maternity",
  "Footwear, Bags & Accessories": "Footwear, bags & accessories",
  "Food & Beverage": "Food & beverage",
  "Health & Beauty": "Health & beauty",
  "Timepiece & Jewellery": "Timepieces & jewellery",
  "Optical & Eyewear": "Optical & eyewear",
  "Music & Home Entertainment": "Music & home entertainment",
  "Digital Lifestyle": "Digital lifestyle",
  "Toys/Hobbies/Games/Pets": "Toys, hobbies & pets",
  Entertainment: "Entertainment",
  Edutainment: "Edutainment",
  "Books & Magazine": "Books & magazines",
  Services: "Services",
  "Home & Living": "Home & living",
  "Gifts & Souvenirs": "Gifts & souvenirs",
  Florist: "Florist",
};

/**
 * Parses a lot code like "LG-62", "L1- 205-207", "G30-5", "LG-K204", "GE-15", "L2229-3", "S-K2B"
 * into { level, tokens }. Tokens are the individual unit labels the lot spans (e.g. ["205","206","207"]).
 * Trailing "-N" after a bare number (e.g. "G30-5" = units 30..35 → Padini) is a range count.
 */
function parseLot(lot) {
  if (!lot) return null;
  let s = lot.toUpperCase().replace(/\s+/g, "").replace(/,$/, "");
  let level = null;
  const levelMatch = s.match(/^(LG|L[1-4]|G|B[13])(E)?/);
  if (levelMatch) {
    level = levelMatch[1] === "B1" ? "LG" : levelMatch[1] === "B3" ? "3" : levelMatch[1].replace(/^L(?=\d)/, "");
    s = s.slice(levelMatch[0].length).replace(/^-+/, "");
  } else if (/^(F|S)-?K/.test(s)) {
    // F-K = Level 1 food kiosks, S-K = Level 2 kiosks.
    level = s.startsWith("F") ? "1" : "2";
    s = s.replace(/^(F|S)-?/, "");
  } else if (/^AT-?3$/.test(s)) {
    return { level: null, tokens: ["AT-3"] }; // Parkson spans levels
  } else if (/^2AT/.test(s)) {
    return { level: null, tokens: [s.replace(/[^A-Z0-9]/g, "")] };
  } else {
    return null;
  }
  // Range like "205-207" or "213-215"
  const range = s.match(/^(\d+)-(\d+)$/);
  if (range && +range[2] > +range[1] && +range[2] - +range[1] <= 6) {
    const tokens = [];
    for (let n = +range[1]; n <= +range[2]; n++) tokens.push(String(n));
    return { level, tokens };
  }
  // Count suffix like "30-5" (5 units from 30) or "28-3"
  const count = s.match(/^([A-Z]?\d+[A-Z]?)-(\d)$/);
  if (count && +count[2] <= 6 && /^\d+$/.test(count[1])) {
    const tokens = [];
    for (let n = +count[1]; n < +count[1] + +count[2]; n++) tokens.push(String(n));
    return { level, tokens };
  }
  return { level, tokens: [s.replace(/[^A-Z0-9]/g, "")] };
}

/** Normalises a traced unit's short label into the set of tokens it covers ("205 & 206" → ["205","206"]). */
function unitTokens(space) {
  const label = space.unitNumber.replace(/^(LG|L\d|G)-/, "").toUpperCase();
  const parts = label.split(/[&,-]+/).map((p) => p.trim()).filter(Boolean);
  const tokens = new Set(parts.map((p) => p.replace(/[^A-Z0-9]/g, "")));
  // "AT-3" style anchor codes
  if (/^\d?AT/.test(label)) tokens.add(label.replace(/[^A-Z0-9]/g, ""));
  return tokens;
}

const byLevel = {};
for (const [level, list] of Object.entries(directory)) {
  byLevel[level] = list.map((space) => ({ space, tokens: unitTokens(space) }));
}

let matched = 0;
let unmatched = [];
const assigned = new Map(); // unitId -> tenant
for (const tenant of raw.tenants) {
  const parsed = parseLot(tenant.lot);
  if (!parsed) {
    unmatched.push(tenant);
    continue;
  }
  const levels = parsed.level ? [parsed.level] : Object.keys(byLevel);
  let hit = null;
  for (const level of levels) {
    const candidates = byLevel[level] ?? [];
    // Prefer the unit sharing the most tokens; require at least one.
    let best = null;
    let bestScore = 0;
    for (const c of candidates) {
      const score = parsed.tokens.filter((t) => c.tokens.has(t)).length;
      if (score > bestScore) {
        best = c;
        bestScore = score;
      }
    }
    if (best) {
      hit = best;
      break;
    }
  }
  if (!hit) {
    unmatched.push(tenant);
    continue;
  }
  matched++;
  const existing = assigned.get(hit.space.unitId);
  // Keep the first tenant per unit; anchors from the board win over listing names for anchor units.
  if (!existing) assigned.set(hit.space.unitId, tenant);
}

// Keep genuine acronyms/brands (H&M, JD, GSC, KOI, BHC, 2AM, F.O.S) but lower-case shouted words.
const KEEP = new Set(["H&M", "JD", "GSC", "KOI", "BHC", "2AM", "F.O.S", "MLB", "ALDO", "AAPE", "ADLV", "MST", "BYD", "OSIM", "LAC", "NARS", "YSL", "M.A.C", "CDLC", "MBG", "QCC", "IOI", "AEON", "A&W", "BMS", "KFC", "JP", "DC", "NC", "LG", "OH!SOME", "TYPO", "TUMI", "HOKA", "ANTA", "FILA", "PUMA", "BATA", "XTEP", "VOIR", "SODA", "ELLE", "IORA", "HYPE", "NOSE", "SASA", "ITSU", "AKEMI", "COWAY", "DYSON", "SERTA", "MUJI"]);
const titleCase = (name) =>
  name
    .split(/\s+/)
    .map((w) => {
      const bare = w.replace(/[^A-Z0-9&'.!-]/gi, "");
      if (KEEP.has(bare.toUpperCase())) return bare.toUpperCase() === bare ? w : w.toUpperCase();
      if (w !== w.toUpperCase()) return w; // already mixed case, trust it
      return w
        .toLowerCase()
        .replace(/(^|[\s'(-])([a-z])/g, (m, pre, ch) => pre + ch.toUpperCase());
    })
    .join(" ");

let renamed = 0;
for (const list of Object.values(directory)) {
  for (const space of list) {
    const tenant = assigned.get(space.unitId);
    if (!tenant) continue;
    const isPlaceholder = /^(Unit|Kiosk) /.test(space.name) || space.category === "Details under review" || space.category === "Kiosk";
    if (isPlaceholder || space.category === "Anchor") {
      space.name = titleCase(tenant.name);
      renamed++;
    }
    space.category = CATEGORY_LABEL[tenant.category] ?? space.category;
    space.description = null;
  }
}

await writeFile(join(ROOT, "src/data/directory.json"), JSON.stringify(directory, null, 1));
await writeFile(
  join(ROOT, "docs/research/ioi/tenant-unmatched.json"),
  JSON.stringify(unmatched.map((t) => ({ name: t.name, lot: t.lot, category: t.category })), null, 1),
);
const total = raw.tenants.length;
console.log(`tenants ${total}: matched ${matched}, unmatched ${unmatched.length}; units renamed ${renamed}`);
for (const [level, list] of Object.entries(directory)) {
  const named = list.filter((s) => !/^(Unit|Kiosk) /.test(s.name)).length;
  console.log(`  ${level.padEnd(3)} ${named}/${list.length} named`);
}
