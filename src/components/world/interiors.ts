import brandColorsJson from "@/data/brand-colors.json";
import { frontEdgeIndex, frontEdges, planToWorld } from "@/lib/mall";
import type { DirectorySpace, FloorPlan, FloorUnit } from "@/types/mall";

/**
 * Procedural shop fit-outs. Every non-anchor unit gets furniture chosen by its directory category
 * (tables and chairs for cafés, racks for fashion, aisles for groceries…), laid out from the unit's
 * real polygon: walls are lined first, then a counter, then the floor is filled on a grid facing the
 * shopfront. Fixtures are kept sparse on purpose: a few pieces with floor space around them read as a
 * real shop, a packed grid reads as a warehouse. Each tenant's brand colour (from its logo, see
 * scripts/ioi-brand-colors.py) goes on the feature wall, the counter front and the seating.
 *
 * Output is a flat list of primitives per kind so the scene can draw them instanced.
 *
 * Scale: the character is 1.15 units tall, so a 0.46-unit table top sits at roughly waist height.
 */

type XZ = [number, number];
type Rng = () => number;

/** "disc" is a cylinder lying on its side (axis along local x), for wheels; "foliage" is a low-poly blob. */
export type PrimKind = "box" | "cylinder" | "disc" | "glass" | "foliage";

/** One primitive in world space: centre, size, rotation about Y, CSS colour. */
export interface Piece {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  rot: number;
  color: string;
}

export type InteriorPieces = Record<PrimKind, Piece[]>;

/** Top of the tinted shop tile drawn by WorldScene, where furniture stands. */
const FLOOR_Y = 0.056;
/** Half of WorldScene's WALL_THICKNESS. */
const WALL_HALF = 0.06;
/** Space kept clear inside every shopfront so the entrance reads as open. */
const FRONT_CLEAR = 0.9;
/** Depth behind a counter where its staff stand; part of the counter's footprint. */
const STAFF_ZONE = 0.5;
/** Clearance kept between a counter (its staff zone included) and other fixtures. */
const COUNTER_GAP = 0.15;

const C = {
  wood: "#c9a57b",
  woodDark: "#94704f",
  white: "#fbfaf7",
  paper: "#eeebe4",
  grey: "#d6d3cc",
  dark: "#3a3c41",
  metal: "#a7acb2",
  gold: "#d9b44a",
  silver: "#dfe2e6",
  leaf: "#6f9e5c",
  leafDark: "#557f47",
  pot: "#e7e1d5",
  screen: "#7fc8f8",
  mirror: "#dde9ee",
  glass: "#cfe7ef",
} as const;

const PRODUCT = ["#e76f51", "#f4a261", "#e9c46a", "#2a9d8f", "#264653", "#8ab17d", "#f28482", "#84a59d", "#b5838d", "#a2d2ff", "#cdb4db", "#ffffff"];
const FABRIC = ["#e2c9a6", "#b9c7c1", "#d7b3a6", "#9fb2c8", "#4f5d75", "#c9ada7"];
const GARMENT = ["#22223b", "#4a4e69", "#9a8c98", "#c9ada7", "#f2e9e4", "#6b705c", "#a5a58d", "#b7b7a4", "#e63946", "#457b9d", "#1d3557", "#f1faee"];
const TECH = ["#2f3136", "#4a4d55", "#d8dadf", "#1f2023"];
const ARCADE = ["#ef476f", "#ffd166", "#06d6a0", "#118ab2", "#8338ec"];
const BOOKS = ["#7b2d26", "#264653", "#2a9d8f", "#e9c46a", "#f4a261", "#8d99ae", "#3d405b", "#81b29a", "#f2cc8f", "#e07a5f"];
const STALL = ["#e63946", "#f4a261", "#2a9d8f", "#e9c46a", "#8338ec", "#ff6b6b", "#118ab2", "#06d6a0", "#ef476f"];
const CARS = ["#d62828", "#f8f9fa", "#1d3557", "#6c757d", "#212529", "#e9c46a", "#4a4e69"];
const SOFT = ["#ff6b6b", "#ffd166", "#06d6a0", "#118ab2", "#ef476f", "#8ecae6", "#ffb703"];

// ---------------------------------------------------------------------------
// Primitive emission
// ---------------------------------------------------------------------------

/**
 * Adds a primitive in an item's local frame: x along its length, z towards its front (the side
 * customers face), y up from the shop floor, measured from the primitive's base.
 */
type Add = (kind: PrimKind, lx: number, lz: number, y0: number, sx: number, sy: number, sz: number, color: string, turn?: number) => void;

function frameAdd(pieces: InteriorPieces, x: number, z: number, rot: number): Add {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return (kind, lx, lz, y0, sx, sy, sz, color, turn = 0) => {
    pieces[kind].push({ x: x + lx * c + lz * s, y: FLOOR_Y + y0 + sy / 2, z: z - lx * s + lz * c, sx, sy, sz, rot: rot + turn, color });
  };
}

/** A child frame inside an item, e.g. a chair turned to face its table. */
function nest(add: Add, ox: number, oz: number, turn: number): Add {
  const c = Math.cos(turn);
  const s = Math.sin(turn);
  return (kind, lx, lz, y0, sx, sy, sz, color, t = 0) => add(kind, ox + lx * c + lz * s, oz - lx * s + lz * c, y0, sx, sy, sz, color, turn + t);
}

function seeded(id: string): Rng {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T,>(rng: Rng, list: readonly T[]): T => list[Math.floor(rng() * list.length) % list.length];

// ---------------------------------------------------------------------------
// Furniture
// ---------------------------------------------------------------------------

interface ItemSpec {
  /** Extent along local x. */
  length: number;
  /** Extent along local z. */
  depth: number;
  draw: (add: Add) => void;
}

type StockStyle = "boxes" | "folded" | "shoes" | "bottles" | "cups" | "tech" | "books";

/**
 * Products along a shelf board spanning `span`, centred at local z = `z`. Stock is drawn as runs of
 * product (a cluster of bottles, a stack of boxes) rather than single items, which keeps a level in
 * the tens of thousands of instances instead of the hundreds of thousands.
 */
function stock(add: Add, span: number, z: number, depth: number, y0: number, maxH: number, style: StockStyle, rng: Rng, palette: readonly string[]) {
  let x = -span / 2;
  const end = span / 2;
  while (x < end - 0.08) {
    if (rng() < 0.28) {
      x += 0.16;
      continue;
    }
    const w =
      style === "shoes"
        ? 0.17
        : style === "folded"
          ? 0.2
          : style === "cups"
            ? 0.16 + rng() * 0.12
            : style === "bottles"
              ? 0.14 + rng() * 0.14
              : style === "books"
                ? 0.1 + rng() * 0.18
                : 0.14 + rng() * 0.2;
    if (x + w > end) break;
    const h =
      style === "shoes"
        ? 0.06
        : style === "folded"
          ? 0.05 + rng() * 0.08
          : style === "cups"
            ? 0.08
            : style === "tech"
              ? maxH * (0.4 + rng() * 0.3)
              : style === "books"
                ? maxH * (0.75 + rng() * 0.25)
                : maxH * (0.55 + rng() * 0.45);
    const d = style === "shoes" ? Math.min(depth, 0.2) : style === "bottles" || style === "cups" ? Math.min(depth, 0.08) : depth * (0.7 + rng() * 0.3);
    const color = style === "cups" ? pick(rng, [C.white, C.paper, C.woodDark]) : style === "books" ? pick(rng, BOOKS) : pick(rng, palette);
    add("box", x + w / 2, z, y0, w, h, d, color);
    x += w + (style === "shoes" ? 0.08 : 0.03 + rng() * 0.04);
  }
}

function chair(add: Add, color: string) {
  add("box", 0, 0.01, 0.25, 0.3, 0.04, 0.3, color);
  add("box", 0, -0.135, 0.29, 0.3, 0.26, 0.035, color);
  for (const x of [-0.13, 0.13]) add("box", x, 0, 0, 0.03, 0.25, 0.27, C.woodDark);
}

function table(add: Add, size: number, round: boolean, top: string, rng: Rng) {
  const kind = round ? "cylinder" : "box";
  add(kind, 0, 0, 0.44, size, 0.035, size, top);
  add("cylinder", 0, 0, 0.03, 0.05, 0.41, 0.05, C.dark);
  add(kind, 0, 0, 0, 0.3, 0.03, 0.3, C.dark);
  if (rng() < 0.55) add("box", size * 0.18, -size * 0.12, 0.475, 0.06, 0.07, 0.06, C.white);
}

/** Two- or four-seat café set; chairs sit on the table's sides, facing it. */
function diningSet(rng: Rng, chairColor: string, top: string, round: boolean): ItemSpec {
  const four = rng() < 0.5;
  const d = 0.43;
  return {
    length: four ? 1.2 : 0.62,
    depth: 1.2,
    draw: (add) => {
      table(add, four ? 0.58 : 0.5, round && !four, top, rng);
      chair(nest(add, 0, -d, 0), chairColor);
      chair(nest(add, 0, d, Math.PI), chairColor);
      if (four) {
        chair(nest(add, d, 0, -Math.PI / 2), chairColor);
        chair(nest(add, -d, 0, Math.PI / 2), chairColor);
      }
    },
  };
}

function wallShelf(length: number, style: StockStyle, rng: Rng, palette: readonly string[], panel: string = C.white, height = 0.8): ItemSpec {
  const depth = 0.3;
  const levels = style === "shoes" ? [0.08, 0.32, 0.56] : [0.08, 0.34, 0.6];
  const gap = levels[1] - levels[0];
  return {
    length,
    depth,
    draw: (add) => {
      add("box", 0, -depth / 2 + 0.02, 0, length, height, 0.04, panel);
      for (const y of levels) {
        if (y > height - 0.1) continue;
        add("box", 0, 0.02, y - 0.03, length - 0.02, 0.03, depth - 0.04, C.paper);
        stock(add, length - 0.08, 0.02, depth - 0.1, y, gap - 0.06, style, rng, palette);
      }
    },
  };
}

/** Clothes hanging along a wall. */
function wallRail(length: number, rng: Rng, palette: readonly string[], panel: string = C.white): ItemSpec {
  const depth = 0.34;
  return {
    length,
    depth,
    draw: (add) => {
      add("box", 0, -depth / 2 + 0.015, 0, length, 0.82, 0.03, panel);
      add("box", 0, -0.02, 0.7, length - 0.04, 0.02, 0.02, C.metal);
      for (let x = -length / 2 + 0.07; x < length / 2 - 0.05; x += 0.12) {
        if (rng() < 0.12) continue;
        add("box", x, -0.02, 0.26 + rng() * 0.05, 0.045, 0.4, 0.26, pick(rng, palette));
      }
    },
  };
}

/** Free-standing clothing rack; garments hang across it. */
function rack(rng: Rng, palette: readonly string[]): ItemSpec {
  const length = 1.0;
  return {
    length,
    depth: 0.42,
    draw: (add) => {
      for (const x of [-length / 2 + 0.03, length / 2 - 0.03]) {
        add("box", x, 0, 0, 0.03, 0.72, 0.03, C.metal);
        add("box", x, 0, 0, 0.035, 0.02, 0.4, C.metal);
      }
      add("box", 0, 0, 0.7, length, 0.02, 0.02, C.metal);
      for (let x = -length / 2 + 0.1; x < length / 2 - 0.08; x += 0.12) {
        if (rng() < 0.15) continue;
        add("box", x, 0, 0.27 + rng() * 0.05, 0.045, 0.4, 0.3, pick(rng, palette));
      }
    },
  };
}

function displayTable(length: number, depth: number, style: StockStyle, rng: Rng, palette: readonly string[], top: string = C.wood, height = 0.4): ItemSpec {
  return {
    length,
    depth,
    draw: (add) => {
      add("box", 0, 0, height, length, 0.04, depth, top);
      for (const x of [-length / 2 + 0.06, length / 2 - 0.06]) add("box", x, 0, 0, 0.04, height, depth - 0.06, C.white);
      const y = height + 0.04;
      if (style === "tech") {
        // Devices laid out in a row, each on a pale stand.
        for (let x = -length / 2 + 0.2; x < length / 2 - 0.12; x += 0.3) {
          add("box", x, 0.04, y, 0.16, 0.012, 0.22, C.grey);
          add("box", x, 0.04, y + 0.012, 0.12, 0.012, 0.18, pick(rng, TECH));
        }
        return;
      }
      for (const z of [-depth / 4, depth / 4]) stock(add, length - 0.12, z, depth / 2 - 0.06, y, 0.14, style, rng, palette);
    },
  };
}

/** Double-sided shelving unit. */
function gondola(length: number, style: StockStyle, rng: Rng, palette: readonly string[], header?: string): ItemSpec {
  const depth = 0.56;
  const height = 0.72;
  return {
    length,
    depth,
    draw: (add) => {
      add("box", 0, 0, 0, length, 0.1, depth, C.grey);
      add("box", 0, 0, 0.1, length, height - 0.1, 0.04, C.white);
      if (header) add("box", 0, 0, height, length, 0.07, 0.06, header);
      for (const side of [-1, 1]) {
        const z = side * (depth / 4 + 0.01);
        add("box", 0, z, 0.38, length - 0.02, 0.025, depth / 2 - 0.04, C.paper);
        stock(add, length - 0.08, z, depth / 2 - 0.1, 0.1, 0.22, style, rng, palette);
        stock(add, length - 0.08, z, depth / 2 - 0.1, 0.405, 0.22, style, rng, palette);
      }
    },
  };
}

function glassCounter(length: number, rng: Rng, metal: string, band: string = C.white, uniform: string | null = null): ItemSpec {
  const depth = 0.42;
  return {
    length,
    depth,
    draw: (add) => {
      // Wall-side counters are inset from the wall; an assistant can stand in that gap.
      if (uniform) staff(nest(add, 0, -depth / 2 - 0.19, 0), uniform, rng);
      add("box", 0, 0, 0, length, 0.32, depth, C.white);
      add("box", 0, 0.005, 0.02, length + 0.005, 0.06, depth + 0.01, band);
      add("box", 0, 0, 0.32, length - 0.08, 0.01, depth - 0.08, C.dark);
      for (let x = -length / 2 + 0.15; x < length / 2 - 0.1; x += 0.2 + rng() * 0.1) add("cylinder", x, (rng() - 0.5) * 0.15, 0.33, 0.07, 0.025, 0.07, metal);
      add("glass", 0, 0, 0.32, length - 0.02, 0.2, depth - 0.02, C.glass);
    },
  };
}

function fridge(length: number, rng: Rng, header: string): ItemSpec {
  const depth = 0.42;
  return {
    length,
    depth,
    draw: (add) => {
      add("box", 0, -0.04, 0, length, 0.86, depth - 0.08, C.white);
      add("box", 0, 0, 0.78, length, 0.08, depth, header);
      for (const y of [0.06, 0.3, 0.54]) stock(add, length - 0.1, 0.06, 0.16, y, 0.18, "boxes", rng, PRODUCT);
      add("glass", 0, depth / 2 - 0.02, 0.04, length - 0.04, 0.72, 0.02, C.glass);
    },
  };
}

const SKIN = ["#f1c9a5", "#e0ac84", "#c68a62", "#9c6644", "#7a4a2e"];
const HAIR = ["#1f1a17", "#3b2a20", "#5a3d2b", "#141414"];
const TUDUNG = ["#e8d8c8", "#c9b8d6", "#a8c3c9", "#3d3a4b", "#d8a7a7", "#f2efe8"];

/**
 * A shop assistant facing local +z (towards customers), about the character's height. Uniform in the
 * shop's brand colour; café staff get an apron; some wear a tudung.
 */
function staff(add: Add, uniform: string, rng: Rng, apron = false) {
  add("box", 0, 0, 0, 0.24, 0.42, 0.14, "#2b2d33");
  add("box", 0, 0, 0.42, 0.3, 0.36, 0.17, uniform);
  for (const x of [-0.185, 0.185]) add("box", x, 0.02, 0.45, 0.07, 0.32, 0.09, uniform);
  if (apron) add("box", 0, 0.09, 0.3, 0.26, 0.42, 0.015, C.white);
  const skin = pick(rng, SKIN);
  if (rng() < 0.35) {
    // The tudung sits just behind the face so the face still shows.
    add("foliage", 0, -0.035, 0.77, 0.26, 0.3, 0.25, pick(rng, TUDUNG));
    add("foliage", 0, 0.01, 0.81, 0.19, 0.21, 0.19, skin);
  } else {
    add("foliage", 0, 0, 0.8, 0.22, 0.24, 0.22, skin);
    add("foliage", 0, -0.015, 0.95, 0.23, 0.12, 0.23, pick(rng, HAIR));
  }
}

/** A till counter with its staff standing behind it; the footprint includes their standing room. */
function counter(length: number, rng: Rng, dining: boolean, front: string = C.wood, uniform: string = C.dark): ItemSpec {
  const body = 0.45;
  const depth = body + STAFF_ZONE;
  const cz = STAFF_ZONE / 2;
  return {
    length,
    depth,
    draw: (add) => {
      add("box", 0, cz, 0, length, 0.44, body, C.white);
      add("box", 0, cz + 0.005, 0.06, length - 0.1, 0.3, body + 0.01, front);
      add("box", 0, cz, 0.44, length + 0.04, 0.035, body + 0.04, C.woodDark);
      const top = 0.475;
      add("box", length / 2 - 0.22, cz - 0.06, top, 0.2, 0.14, 0.16, C.dark);
      if (dining) {
        // Cake display at one end and a coffee machine.
        const w = Math.min(0.7, length / 3);
        const cx = -length / 2 + w / 2 + 0.06;
        for (let x = cx - w / 2 + 0.1; x < cx + w / 2 - 0.05; x += 0.14) add("cylinder", x, cz, top, 0.1, 0.07, 0.1, pick(rng, ["#f4a261", "#b5838d", "#e9c46a", "#ffffff"]));
        add("glass", cx, cz, top, w, 0.2, body - 0.06, C.glass);
        add("box", 0.1, cz - 0.1, top, 0.22, 0.22, 0.2, C.metal);
      }
      const staffZ = cz - body / 2 - 0.2;
      staff(nest(add, length / 2 - 0.3, staffZ, 0), uniform, rng, dining);
      if (length > 1.8 && rng() < 0.6) staff(nest(add, -length / 4, staffZ, 0), uniform, rng, dining);
    },
  };
}

function bench(color: string): ItemSpec {
  const length = 1.0;
  const depth = 0.36;
  return {
    length,
    depth,
    draw: (add) => {
      add("box", 0, 0, 0.2, length, 0.07, depth, color);
      for (const x of [-length / 2 + 0.06, length / 2 - 0.06]) add("box", x, 0, 0, 0.04, 0.2, depth - 0.04, C.woodDark);
    },
  };
}

/** Waiting seats facing into the shop (towards its reception). */
function chairRow(color: string): ItemSpec {
  return {
    length: 1.1,
    depth: 0.36,
    draw: (add) => {
      for (const x of [-0.36, 0, 0.36]) chair(nest(add, x, 0, Math.PI), color);
    },
  };
}

function salonStation(length: number): ItemSpec {
  const depth = 0.85;
  return {
    length,
    depth,
    draw: (add) => {
      add("box", 0, -depth / 2 + 0.15, 0, length - 0.12, 0.36, 0.3, C.white);
      add("box", 0, -depth / 2 + 0.02, 0.4, length - 0.22, 0.42, 0.02, C.mirror);
      add("cylinder", 0, 0.15, 0, 0.26, 0.05, 0.26, C.dark);
      add("cylinder", 0, 0.15, 0.05, 0.06, 0.2, 0.06, C.metal);
      chair(nest(add, 0, 0.15, Math.PI), C.dark);
    },
  };
}

function treadmill(): ItemSpec {
  return {
    length: 0.42,
    depth: 0.95,
    draw: (add) => {
      add("box", 0, 0.04, 0, 0.4, 0.1, 0.86, C.dark);
      add("box", 0, 0.06, 0.1, 0.3, 0.015, 0.76, "#5c5f66");
      for (const x of [-0.17, 0.17]) add("box", x, -0.38, 0.1, 0.03, 0.5, 0.03, C.metal);
      add("box", 0, -0.4, 0.58, 0.4, 0.1, 0.1, C.dark);
      add("box", 0, -0.35, 0.62, 0.16, 0.05, 0.01, C.screen);
    },
  };
}

function arcade(rng: Rng, brand?: string): ItemSpec {
  const accent = brand && rng() < 0.5 ? brand : pick(rng, ARCADE);
  return {
    length: 0.46,
    depth: 0.48,
    draw: (add) => {
      add("box", 0, -0.02, 0, 0.44, 0.82, 0.42, C.dark);
      add("box", 0, 0.19, 0.44, 0.34, 0.26, 0.02, C.screen);
      add("box", 0, 0.23, 0.34, 0.44, 0.06, 0.1, accent);
      add("box", 0, 0.19, 0.74, 0.44, 0.08, 0.05, accent);
    },
  };
}

function plant(): ItemSpec {
  return {
    length: 0.44,
    depth: 0.44,
    draw: (add) => {
      add("cylinder", 0, 0, 0, 0.24, 0.26, 0.24, C.pot);
      add("foliage", 0, 0, 0.22, 0.44, 0.4, 0.44, C.leaf);
      add("foliage", 0.07, 0.05, 0.46, 0.28, 0.26, 0.28, C.leafDark);
    },
  };
}

/** A food-court stall: backdrop and signboard in the stall's colour over a staffed counter. */
function foodStall(length: number, rng: Rng): ItemSpec {
  const color = pick(rng, STALL);
  const till = counter(length - 0.1, rng, true, color, mix(color, "#000000", 0.25));
  return {
    length,
    depth: till.depth + 0.06,
    draw: (add) => {
      const back = -(till.depth + 0.06) / 2;
      add("box", 0, back + 0.02, 0, length, 1.2, 0.04, mix(color, "#ffffff", 0.55));
      add("box", 0, back + 0.05, 1.02, length - 0.2, 0.26, 0.04, color);
      add("box", 0, back + 0.075, 1.08, length - 0.6, 0.12, 0.01, C.white);
      till.draw(nest(add, 0, 0.03, 0));
    },
  };
}

function sofa(length: number, color: string): ItemSpec {
  return {
    length,
    depth: 0.46,
    draw: (add) => {
      add("box", 0, 0.02, 0.04, length - 0.16, 0.18, 0.4, color);
      add("box", 0, -0.17, 0.2, length - 0.16, 0.26, 0.12, mix(color, "#000000", 0.12));
      for (const x of [-length / 2 + 0.08, length / 2 - 0.08]) add("box", x, 0, 0.04, 0.16, 0.3, 0.46, mix(color, "#000000", 0.12));
    },
  };
}

function bed(rng: Rng): ItemSpec {
  const cover = pick(rng, FABRIC);
  return {
    length: 1.05,
    depth: 0.82,
    draw: (add) => {
      add("box", 0, 0, 0, 1.05, 0.16, 0.82, C.woodDark);
      add("box", 0.02, 0, 0.16, 0.98, 0.12, 0.76, C.white);
      add("box", 0.2, 0, 0.28, 0.62, 0.02, 0.78, cover);
      for (const z of [-0.2, 0.2]) add("box", -0.36, z, 0.28, 0.16, 0.06, 0.3, C.paper);
      add("box", -0.51, 0, 0.16, 0.04, 0.34, 0.82, C.woodDark);
    },
  };
}

/** A showroom car, nose towards local +x. */
function car(color: string): ItemSpec {
  return {
    length: 2.2,
    depth: 0.95,
    draw: (add) => {
      add("box", 0, 0, 0.12, 2.2, 0.28, 0.9, color);
      add("box", -0.12, 0, 0.4, 1.2, 0.26, 0.8, "#2f3b45");
      add("box", 1.08, 0, 0.18, 0.04, 0.08, 0.7, "#f8f9fa");
      for (const x of [-0.7, 0.7]) for (const z of [-0.43, 0.43]) add("disc", x, z, 0, 0.14, 0.32, 0.32, C.dark, Math.PI / 2);
    },
  };
}

/** Soft-play corner: a padded platform, a tower, a tube and a few balls. */
function playCluster(rng: Rng): ItemSpec {
  return {
    length: 1.2,
    depth: 1.2,
    draw: (add) => {
      add("box", 0, 0, 0, 1.2, 0.22, 1.2, pick(rng, SOFT));
      add("box", -0.35, -0.35, 0.22, 0.45, 0.6, 0.45, pick(rng, SOFT));
      add("cylinder", 0.35, 0.35, 0.22, 0.3, 0.45, 0.3, pick(rng, SOFT));
      for (let i = 0; i < 8; i++) add("foliage", 0.1 + rng() * 0.4, -0.4 + rng() * 0.4, 0.22, 0.12, 0.12, 0.12, pick(rng, SOFT));
    },
  };
}

/** Karaoke / lounge seating: two sofas facing across a low table. */
function loungeSet(color: string): ItemSpec {
  return {
    length: 1.4,
    depth: 1.5,
    draw: (add) => {
      sofa(1.3, color).draw(nest(add, 0, -0.52, 0));
      sofa(1.3, color).draw(nest(add, 0, 0.52, Math.PI));
      add("box", 0, 0, 0, 0.8, 0.22, 0.4, C.woodDark);
    },
  };
}

/** A wall-mounted screen on a low cabinet. */
function tvWall(length: number): ItemSpec {
  return {
    length,
    depth: 0.3,
    draw: (add) => {
      add("box", 0, 0, 0, length - 0.1, 0.3, 0.3, C.woodDark);
      add("box", 0, -0.1, 0.36, Math.min(1.1, length - 0.2), 0.5, 0.05, C.dark);
      add("box", 0, -0.07, 0.4, Math.min(1.0, length - 0.3), 0.42, 0.01, C.screen);
    },
  };
}

/** A bowling lane along local x: approach, lane, gutters, pins and the pinsetter hood at +x. */
function bowlingLane(length: number, rng: Rng): ItemSpec {
  const neon = pick(rng, ARCADE);
  return {
    length,
    depth: 1.05,
    draw: (add) => {
      add("box", 0, 0, 0, length, 0.02, 0.8, "#d9a86c");
      add("box", -length / 2 + 0.6, 0, 0.001, 1.2, 0.021, 0.8, "#ecd1a4");
      for (const z of [-0.45, 0.45]) add("box", 0, z, 0, length, 0.015, 0.1, C.dark);
      for (const z of [-0.51, 0.51]) add("box", 0, z, 0, length, 0.06, 0.03, C.white);
      const pinX = length / 2 - 0.55;
      for (let row = 0; row < 4; row++) {
        for (let k = 0; k <= row; k++) add("cylinder", pinX + row * 0.1, (k - row / 2) * 0.12, 0.02, 0.05, 0.19, 0.05, C.white);
      }
      add("box", length / 2 - 0.15, 0, 0.35, 0.3, 0.35, 1.0, C.dark);
      add("box", length / 2 - 0.31, 0, 0.52, 0.02, 0.06, 1.0, neon);
    },
  };
}

/** A row of cinema seats facing local +z, split by a centre aisle when it's long. */
function cinemaRow(length: number): ItemSpec {
  return {
    length,
    depth: 0.34,
    draw: (add) => {
      const aisle = length > 4 ? 0.6 : 0;
      for (let x = -length / 2 + 0.18; x < length / 2 - 0.1; x += 0.36) {
        if (aisle && Math.abs(x) < aisle / 2) continue;
        add("box", x, 0.02, 0.02, 0.3, 0.24, 0.28, "#b3202a");
        add("box", x, -0.13, 0.12, 0.3, 0.34, 0.07, "#8f1820");
      }
    },
  };
}

function cinemaScreen(length: number): ItemSpec {
  return {
    length,
    depth: 0.16,
    draw: (add) => {
      add("box", 0, -0.04, 0.15, length + 0.12, 1.02, 0.05, C.dark);
      add("box", 0, 0, 0.2, length, 0.9, 0.03, "#f5f7fa");
    },
  };
}

/** An ice rink: ice, white boards with a blue rail, and a few skaters. */
function iceRink(length: number, depth: number, rng: Rng): ItemSpec {
  return {
    length,
    depth,
    draw: (add) => {
      add("box", 0, 0, 0, length, 0.03, depth, "#e3f4fb");
      for (const z of [-depth / 2, depth / 2]) {
        add("box", 0, z, 0, length, 0.3, 0.06, C.white);
        add("box", 0, z, 0.3, length, 0.03, 0.08, "#2a6fb0");
      }
      for (const x of [-length / 2, length / 2]) {
        add("box", x, 0, 0, 0.06, 0.3, depth, C.white);
        add("box", x, 0, 0.3, 0.08, 0.03, depth, "#2a6fb0");
      }
      const skaters = Math.min(9, Math.floor((length * depth) / 12) + 2);
      for (let i = 0; i < skaters; i++) {
        const x = (rng() - 0.5) * (length - 1.2);
        const z = (rng() - 0.5) * (depth - 1.2);
        staff(nest(add, x, z, rng() * Math.PI * 2), pick(rng, SOFT), rng);
      }
    },
  };
}

/** A badminton court along local x (6.7 m × 3 m courts at half scale), net across the middle. */
function court(): ItemSpec {
  const length = 6.7;
  const width = 3.05;
  return {
    length,
    depth: width,
    draw: (add) => {
      add("box", 0, 0, 0, length, 0.012, width, "#3f7f5f");
      for (const z of [-width / 2 + 0.02, width / 2 - 0.02]) add("box", 0, z, 0.012, length, 0.004, 0.04, C.white);
      for (const x of [-length / 2 + 0.02, length / 2 - 0.02, -1, 1]) add("box", x, 0, 0.012, 0.04, 0.004, width, C.white);
      add("box", 0, 0, 0.012, 2 * (length / 2 - 1), 0.004, 0.04, C.white);
      for (const z of [-width / 2 - 0.05, width / 2 + 0.05]) add("cylinder", 0, z, 0, 0.05, 0.78, 0.05, C.dark);
      add("glass", 0, 0, 0.42, 0.01, 0.34, width, C.white);
      add("box", 0, 0, 0.76, 0.02, 0.03, width, C.white);
    },
  };
}

// ---------------------------------------------------------------------------
// Recipes: which furniture each kind of tenant gets
// ---------------------------------------------------------------------------

type Archetype =
  | "dining"
  | "apparel"
  | "footwear"
  | "beauty"
  | "salon"
  | "tech"
  | "jewellery"
  | "grocery"
  | "home"
  | "service"
  | "fitness"
  | "leisure"
  | "generic"
  // Anchor-sized fit-outs.
  | "foodcourt"
  | "bookstore"
  | "bowling"
  | "cinema"
  | "icerink"
  | "courts"
  | "showroom"
  | "furniture"
  | "play"
  | "lounge"
  | "lobby"
  | "vacant";

/** Checked against the tenant's name first: big tenants whose category alone doesn't say what they are. */
const NAME_RULES: [RegExp, Archetype][] = [
  [/^unit \?|^unit$/i, "vacant"],
  [/food junction|food empire|food court|food hall/i, "foodcourt"],
  [/resting area|lounge/i, "lounge"],
  [/bowl/i, "bowling"],
  [/cinema|\bgsc\b|golden screen|\btgv\b|mbo\b/i, "cinema"],
  [/ice rink|icescape|skating/i, "icerink"],
  [/sports centre|badminton|futsal/i, "courts"],
  [/karaoke/i, "lounge"],
  [/book/i, "bookstore"],
  [/proton|perodua|honda|toyota|motor|automobile/i, "showroom"],
  [/hot ?pot|steamboat|banquet|restaurant|haidilao|la gaya/i, "dining"],
  [/kidzoona|kiddytopia|play|molly|farm|district 21/i, "play"],
  [/tower|convention|exhibition|valet/i, "lobby"],
  [/decathlon|al-ikhsan|golf/i, "apparel"],
];

const ARCHETYPE_RULES: [RegExp, Archetype][] = [
  [/caf|restaurant|food|dessert|bakery|snack/i, "dining"],
  [/footwear/i, "footwear"],
  [/salon|haircare/i, "salon"],
  [/beauty|skincare|perfum|personal care|pharmacy/i, "beauty"],
  [/digital|technolog|mobile/i, "tech"],
  [/jewel|timepiece|optical|money/i, "jewellery"],
  [/grocery|supemarket|supermarket|convenience/i, "grocery"],
  [/fitness/i, "fitness"],
  [/entertainment|edutainment/i, "leisure"],
  [/clinic|medical|dental|health centre|bank|financial|services|automotive|wellness/i, "service"],
  [/home|living|gift|souvenir|book|toy|hobbies|game|pet/i, "home"],
  [/fashion|wear|undergarment|kids|maternity|bag|leather|accessor|department/i, "apparel"],
];

function archetypeFor(space: DirectorySpace | undefined, unit: FloorUnit): Archetype {
  const name = space?.name ?? unit.name ?? "";
  const byName = NAME_RULES.find(([pattern]) => pattern.test(name))?.[1];
  if (byName) return byName;
  const category = space?.category;
  if (!category) return "generic";
  if (/food court/i.test(category)) return "foodcourt";
  const byCategory = ARCHETYPE_RULES.find(([pattern]) => pattern.test(category))?.[1] ?? "generic";
  // Big home stores are furniture showrooms, not shelves of homeware.
  if (unit.kind === "anchor" && byCategory === "home") return "furniture";
  if (unit.kind === "anchor" && byCategory === "leisure") return "play";
  return byCategory;
}

type WallFactory = (length: number) => ItemSpec;

interface Recipe {
  /** Fixtures along the back wall (fully) and the side walls (sparsely), in segments of about `segment`. */
  wall?: { back?: WallFactory; side?: WallFactory; segment: number; inset?: number };
  counter?: { place: "back" | "front"; make: (length: number) => ItemSpec };
  /**
   * Floor fill: `axis` "across" runs items parallel to the shopfront, "into" runs them like aisles.
   * `perItem` is the floor area each item gets, which caps how many a shop receives.
   */
  centre?: { axis: "across" | "into"; gap: number; cell: [number, number]; perItem: number; make: () => ItemSpec };
  plants?: boolean;
  frontClear?: number;
}

interface Brand {
  primary: string;
  accent: string | null;
}

const brandColors = brandColorsJson as Record<string, Brand>;

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(hex: string, toward: string, t: number): string {
  const a = hexToRgb(hex);
  const b = hexToRgb(toward);
  return `#${a.map((c, i) => Math.round(c + (b[i] - c) * t).toString(16).padStart(2, "0")).join("")}`;
}

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function recipeFor(archetype: Archetype, rng: Rng, brand: Brand | undefined): Recipe {
  // Near-white logo colours would vanish against white fixtures, so they fall back to a warm grey.
  const primary = brand?.primary ?? pick(rng, FABRIC);
  const feature = luminance(primary) > 0.85 ? C.grey : primary;
  const accent = brand?.accent ?? feature;
  const soft = mix(feature, "#ffffff", 0.2);
  const shopPalette = [feature, accent, pick(rng, GARMENT), C.white, "#2b2d42"];
  const products = [feature, accent, pick(rng, PRODUCT), pick(rng, PRODUCT), C.white];
  // Staff uniforms follow the brand; very dark or very pale brands still read as a uniform.
  const uniform = feature;
  const counterFor = () => (l: number) => counter(l, rng, false, feature, uniform);
  switch (archetype) {
    case "dining": {
      const top = pick(rng, [C.wood, C.white, C.woodDark]);
      const round = rng() < 0.4;
      return {
        wall: { back: (l) => wallShelf(l, "cups", rng, PRODUCT, feature, 0.72), segment: 1.4 },
        counter: { place: "back", make: (l) => counter(l, rng, true, feature, uniform) },
        centre: { axis: "across", gap: 0.8, cell: [1.2, 1.2], perItem: 7, make: () => diningSet(rng, soft, top, round) },
        plants: true,
        frontClear: 0.7,
      };
    }
    case "apparel":
      return {
        wall: { back: (l) => wallRail(l, rng, shopPalette, feature), side: (l) => wallRail(l, rng, shopPalette), segment: 1.2 },
        counter: { place: "back", make: counterFor() },
        centre: {
          axis: "into",
          gap: 1.2,
          cell: [1.0, 0.6],
          perItem: 12,
          make: () => (rng() < 0.6 ? rack(rng, shopPalette) : displayTable(1.0, 0.6, "folded", rng, shopPalette)),
        },
      };
    case "footwear":
      return {
        wall: { back: (l) => wallShelf(l, "shoes", rng, shopPalette, feature), side: (l) => wallShelf(l, "shoes", rng, shopPalette), segment: 1.2 },
        counter: { place: "back", make: counterFor() },
        centre: {
          axis: "across",
          gap: 1.1,
          cell: [1.0, 0.5],
          perItem: 14,
          make: () => (rng() < 0.5 ? bench(soft) : displayTable(0.9, 0.5, "shoes", rng, shopPalette, C.white, 0.3)),
        },
      };
    case "beauty":
      return {
        wall: { back: (l) => wallShelf(l, "bottles", rng, products, feature), side: (l) => wallShelf(l, "bottles", rng, products), segment: 1.2 },
        counter: { place: "back", make: counterFor() },
        centre: {
          axis: "across",
          gap: 1.2,
          cell: [1.2, 0.56],
          perItem: 14,
          make: () => (rng() < 0.5 ? gondola(1.2, "bottles", rng, products, feature) : displayTable(0.9, 0.55, "bottles", rng, products, C.white)),
        },
      };
    case "salon":
      return {
        wall: { back: (l) => salonStation(l), side: (l) => salonStation(l), segment: 1.0 },
        counter: { place: "front", make: counterFor() },
        centre: { axis: "across", gap: 1.0, cell: [1.0, 0.36], perItem: 18, make: () => bench(soft) },
        plants: true,
      };
    case "tech":
      return {
        wall: { back: (l) => wallShelf(l, "tech", rng, TECH, feature), side: (l) => wallShelf(l, "tech", rng, TECH), segment: 1.4 },
        counter: { place: "back", make: counterFor() },
        centre: { axis: "across", gap: 1.3, cell: [1.4, 0.7], perItem: 16, make: () => displayTable(1.4, 0.7, "tech", rng, TECH, C.white) },
      };
    case "jewellery": {
      const metal = rng() < 0.6 ? C.gold : C.silver;
      return {
        wall: {
          back: (l) => glassCounter(l, rng, metal, feature, rng() < 0.5 ? uniform : null),
          side: (l) => glassCounter(l, rng, metal, feature),
          segment: 1.2,
          inset: 0.35,
        },
        centre: { axis: "across", gap: 1.2, cell: [1.2, 0.42], perItem: 16, make: () => glassCounter(1.2, rng, metal, feature) },
        plants: true,
      };
    }
    case "grocery":
      return {
        wall: { back: (l) => fridge(l, rng, feature), side: (l) => fridge(l, rng, feature), segment: 0.8 },
        counter: { place: "front", make: counterFor() },
        centre: { axis: "into", gap: 0.9, cell: [1.6, 0.56], perItem: 8, make: () => gondola(1.6, "boxes", rng, PRODUCT, feature) },
      };
    case "home":
      return {
        wall: { back: (l) => wallShelf(l, "boxes", rng, products, feature), side: (l) => wallShelf(l, "boxes", rng, PRODUCT), segment: 1.4 },
        counter: { place: "back", make: counterFor() },
        centre: {
          axis: "into",
          gap: 1.2,
          cell: [1.4, 0.7],
          perItem: 12,
          make: () => (rng() < 0.6 ? gondola(1.4, "boxes", rng, products, feature) : displayTable(1.1, 0.7, "boxes", rng, products)),
        },
      };
    case "service":
      return {
        counter: { place: "back", make: counterFor() },
        centre: { axis: "across", gap: 0.9, cell: [1.1, 0.36], perItem: 14, make: () => chairRow(soft) },
        plants: true,
      };
    case "fitness":
      return {
        counter: { place: "front", make: counterFor() },
        centre: { axis: "across", gap: 0.6, cell: [0.42, 0.95], perItem: 6, make: () => treadmill() },
      };
    case "leisure":
      return {
        wall: { back: () => arcade(rng, feature), side: () => arcade(rng, feature), segment: 0.5 },
        counter: { place: "front", make: counterFor() },
        centre: { axis: "across", gap: 1.0, cell: [0.46, 0.48], perItem: 10, make: () => arcade(rng, feature) },
      };
    case "foodcourt":
      return {
        wall: { back: (l) => foodStall(l, rng), side: (l) => foodStall(l, rng), segment: 2.2 },
        centre: { axis: "across", gap: 0.8, cell: [1.2, 1.2], perItem: 5, make: () => diningSet(rng, pick(rng, FABRIC), pick(rng, [C.white, C.wood]), rng() < 0.4) },
        plants: true,
        frontClear: 0.8,
      };
    case "bookstore":
      return {
        wall: { back: (l) => wallShelf(l, "books", rng, BOOKS, feature, 0.86), side: (l) => wallShelf(l, "books", rng, BOOKS, C.woodDark, 0.86), segment: 1.4 },
        counter: { place: "front", make: counterFor() },
        centre: {
          axis: "into",
          gap: 1.0,
          cell: [1.6, 0.7],
          perItem: 9,
          make: () => (rng() < 0.75 ? gondola(1.6, "books", rng, BOOKS, feature) : displayTable(1.2, 0.7, "books", rng, BOOKS, C.wood)),
        },
        plants: true,
      };
    case "showroom":
      return {
        counter: { place: "back", make: counterFor() },
        centre: { axis: "across", gap: 1.6, cell: [2.2, 0.95], perItem: 100, make: () => car(rng() < 0.4 ? feature : pick(rng, CARS)) },
        plants: true,
      };
    case "furniture":
      return {
        wall: { back: (l) => wallShelf(l, "boxes", rng, products, feature), segment: 1.4 },
        counter: { place: "back", make: counterFor() },
        centre: {
          axis: "across",
          gap: 0.9,
          cell: [1.6, 1.2],
          perItem: 11,
          make: () => {
            const roll = rng();
            if (roll < 0.35) return sofa(1.3 + rng() * 0.3, pick(rng, FABRIC));
            if (roll < 0.6) return bed(rng);
            if (roll < 0.8) return diningSet(rng, pick(rng, FABRIC), pick(rng, [C.wood, C.woodDark, C.white]), rng() < 0.5);
            return gondola(1.4, "boxes", rng, products, feature);
          },
        },
        plants: true,
      };
    case "play":
      return {
        counter: { place: "front", make: counterFor() },
        centre: { axis: "across", gap: 0.9, cell: [1.2, 1.2], perItem: 9, make: () => playCluster(rng) },
      };
    case "lounge":
      return {
        wall: { back: (l) => tvWall(l), side: (l) => sofa(l, soft), segment: 1.4 },
        counter: { place: "front", make: counterFor() },
        centre: { axis: "across", gap: 1.1, cell: [1.4, 1.5], perItem: 12, make: () => loungeSet(soft) },
      };
    case "lobby":
      return {
        counter: { place: "back", make: counterFor() },
        centre: { axis: "across", gap: 1.6, cell: [1.4, 1.5], perItem: 40, make: () => loungeSet(soft) },
        plants: true,
      };
    case "courts":
      return {
        counter: { place: "front", make: counterFor() },
        centre: { axis: "into", gap: 0.9, cell: [6.7, 3.05], perItem: 1, make: () => court() },
      };
    // Laid out by hand in layoutShop.
    case "bowling":
    case "cinema":
    case "icerink":
    case "vacant":
      return {};
    case "generic":
      return {
        wall: { back: (l) => wallShelf(l, "boxes", rng, products, feature), side: (l) => wallShelf(l, "boxes", rng, PRODUCT), segment: 1.4 },
        counter: { place: "back", make: counterFor() },
        centre: { axis: "into", gap: 1.2, cell: [1.4, 0.56], perItem: 12, make: () => gondola(1.4, "boxes", rng, products, feature) },
      };
  }
}

// ---------------------------------------------------------------------------
// Placement geometry
// ---------------------------------------------------------------------------

interface Rect {
  x: number;
  z: number;
  /** Half extent along local x / local z. */
  hl: number;
  hd: number;
  rot: number;
}

function pointInPolygon([x, z]: XZ, poly: XZ[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function rectAxes(r: Rect): [XZ, XZ] {
  const c = Math.cos(r.rot);
  const s = Math.sin(r.rot);
  return [
    [c, -s],
    [s, c],
  ];
}

function rectPoints(r: Rect, pad: number): XZ[] {
  const [ax, az] = rectAxes(r);
  const hl = r.hl + pad;
  const hd = r.hd + pad;
  const at = (l: number, d: number): XZ => [r.x + ax[0] * l + az[0] * d, r.z + ax[1] * l + az[1] * d];
  // Corners plus edge midpoints, so a notch in a concave unit can't slip between two corners.
  return [at(-hl, -hd), at(0, -hd), at(hl, -hd), at(hl, 0), at(hl, hd), at(0, hd), at(-hl, hd), at(-hl, 0)];
}

function rectContains(r: Rect, [px, pz]: XZ): boolean {
  const [ax, az] = rectAxes(r);
  const dx = px - r.x;
  const dz = pz - r.z;
  return Math.abs(dx * ax[0] + dz * ax[1]) < r.hl && Math.abs(dx * az[0] + dz * az[1]) < r.hd;
}

/** Separating-axis test between two oriented rectangles, with `pad` of clearance required. */
function rectsOverlap(a: Rect, b: Rect, pad: number): boolean {
  const reach = Math.hypot(a.hl, a.hd) + Math.hypot(b.hl, b.hd) + pad * 1.5;
  if (Math.abs(a.x - b.x) > reach || Math.abs(a.z - b.z) > reach) return false;
  const pa = rectPoints(a, pad);
  const pb = rectPoints(b, 0);
  for (const axis of [...rectAxes(a), ...rectAxes(b)]) {
    let minA = Infinity;
    let maxA = -Infinity;
    let minB = Infinity;
    let maxB = -Infinity;
    for (const [x, z] of pa) {
      const p = x * axis[0] + z * axis[1];
      minA = Math.min(minA, p);
      maxA = Math.max(maxA, p);
    }
    for (const [x, z] of pb) {
      const p = x * axis[0] + z * axis[1];
      minB = Math.min(minB, p);
      maxB = Math.max(maxB, p);
    }
    if (maxA <= minB || maxB <= minA) return false;
  }
  return true;
}

/** Rotation that lays an item's length along `along` with its front facing `facing`. */
function angleFor(along: XZ, facing: XZ): number {
  const rot = Math.atan2(-along[1], along[0]);
  return Math.sin(rot) * facing[0] + Math.cos(rot) * facing[1] < 0 ? rot + Math.PI : rot;
}

interface Edge {
  a: XZ;
  b: XZ;
  dir: XZ;
  /** Unit normal pointing into the shop. */
  inward: XZ;
  length: number;
  /** How far the edge's midpoint is from the shopfront. */
  depth: number;
}

class UnitLayout {
  readonly occupied: Rect[] = [];

  constructor(
    private readonly pieces: InteriorPieces,
    readonly poly: XZ[],
  ) {}

  /** Whether an item of this size would fit here, without placing it. */
  fits(length: number, depth: number, x: number, z: number, rot: number, wallPad: number, itemPad: number): boolean {
    const rect: Rect = { x, z, hl: length / 2, hd: depth / 2, rot };
    if (!rectPoints(rect, wallPad).every((p) => pointInPolygon(p, this.poly))) return false;
    if (this.poly.some((vertex) => rectContains({ ...rect, hl: rect.hl + wallPad, hd: rect.hd + wallPad }, vertex))) return false;
    return !this.occupied.some((other) => rectsOverlap(rect, other, itemPad));
  }

  place(spec: ItemSpec, x: number, z: number, rot: number, wallPad: number, itemPad: number): boolean {
    if (!this.fits(spec.length, spec.depth, x, z, rot, wallPad, itemPad)) return false;
    this.occupied.push({ x, z, hl: spec.length / 2, hd: spec.depth / 2, rot });
    spec.draw(frameAdd(this.pieces, x, z, rot));
    return true;
  }
}

function inwardNormal(a: XZ, b: XZ, poly: XZ[]): XZ {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  let n: XZ = [-(b[1] - a[1]) / len, (b[0] - a[0]) / len];
  const mid: XZ = [(a[0] + b[0]) / 2 + n[0] * 0.05, (a[1] + b[1]) / 2 + n[1] * 0.05];
  if (!pointInPolygon(mid, poly)) n = [-n[0], -n[1]];
  return n;
}

/**
 * Wall fixtures in even segments; a segment that won't fit (a corner, a notch) retries as two halves.
 * `sparse` walls get every other segment, away from the corners, so side walls keep some bare space.
 */
function lineEdge(layout: UnitLayout, edge: Edge, make: WallFactory, segment: number, inset: number, sparse: boolean) {
  const usable = edge.length - 0.1;
  if (usable < 0.45) return;
  const count = Math.max(1, Math.round(usable / segment));
  const length = usable / count;
  const rot = angleFor(edge.dir, edge.inward);
  const placeAt = (s: number, l: number) => {
    const spec = make(l);
    const off = WALL_HALF + 0.015 + inset + spec.depth / 2;
    const x = edge.a[0] + edge.dir[0] * s + edge.inward[0] * off;
    const z = edge.a[1] + edge.dir[1] * s + edge.inward[1] * off;
    return layout.place(spec, x, z, rot, 0, 0.02);
  };
  for (let i = 0; i < count; i++) {
    if (sparse && count > 1 && i % 2 === 0) continue;
    const s = 0.05 + (i + 0.5) * length;
    if (placeAt(s, length) || length < 0.8) continue;
    placeAt(s - length / 4, length / 2);
    placeAt(s + length / 4, length / 2);
  }
}

/**
 * Anchors (department stores, supermarkets, cinemas…) are left as open, brand-coloured floors rather
 * than furnished. Flip to true to give them their fit-outs (food court stalls, bowling lanes, cinema
 * seating, ice rink…) again.
 */
const FURNISH_ANCHORS = false;

/** Cap on free-standing pieces per unit, so the biggest anchors stay light enough to draw. */
const MAX_CENTRE_ITEMS = 80;
const FACING: Record<string, XZ> = { right: [1, 0], left: [-1, 0], down: [0, 1], up: [0, -1] };

function layoutShop(unit: FloorUnit, space: DirectorySpace | undefined, pieces: InteriorPieces) {
  const poly = unit.polygon.map(planToWorld);
  const rng = seeded(unit.id);
  const layout = new UnitLayout(pieces, poly);
  const edgesAll = poly.map((a, i) => {
    const b = poly[(i + 1) % poly.length];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    return { a, b, length, dir: [(b[0] - a[0]) / (length || 1), (b[1] - a[1]) / (length || 1)] as XZ, inward: inwardNormal(a, b, poly) };
  });

  if (unit.kind === "kiosk") {
    const longest = edgesAll.reduce((best, edge) => (edge.length > best.length ? edge : best));
    const cx = poly.reduce((sum, p) => sum + p[0], 0) / poly.length;
    const cz = poly.reduce((sum, p) => sum + p[1], 0) / poly.length;
    const rot = angleFor(longest.dir, longest.inward);
    const uniform = brandColors[unit.id]?.primary ?? C.dark;
    for (const size of [1.0, 0.7, 0.45]) {
      const table = displayTable(size, size * 0.55, "boxes", rng, PRODUCT, C.white, 0.34);
      // With an attendant behind the display when the kiosk is big enough, else the display alone.
      const staffed: ItemSpec = {
        length: table.length,
        depth: table.depth + 0.4,
        draw: (add) => {
          table.draw(nest(add, 0, 0.2, 0));
          staff(nest(add, 0, -table.depth / 2, 0), uniform, rng);
        },
      };
      if (layout.place(staffed, cx, cz, rot, 0.12, 0) || layout.place(table, cx, cz, rot, 0.12, 0)) break;
    }
    return;
  }

  const archetype = archetypeFor(space, unit);
  if (archetype === "vacant") return;
  const frontIndex = frontEdgeIndex(unit);
  const openFronts = frontEdges(unit);
  const front = edgesAll[frontIndex] ?? edgesAll[0];
  // Anchors trace curved facades as many short edges, so their frame follows the facing instead.
  const facing = FACING[unit.frontFacing];
  let u: XZ = front.dir;
  let n: XZ = front.inward;
  let origin: XZ = front.a;
  if (unit.kind === "anchor" && facing) {
    n = [-facing[0], -facing[1]];
    u = [-n[1], n[0]];
    origin = poly.reduce((best, p) => (p[0] * facing[0] + p[1] * facing[1] > best[0] * facing[0] + best[1] * facing[1] ? p : best));
  }
  const toFrame = ([x, z]: XZ): XZ => [(x - origin[0]) * u[0] + (z - origin[1]) * u[1], (x - origin[0]) * n[0] + (z - origin[1]) * n[1]];
  const toWorld = (s: number, t: number): XZ => [origin[0] + u[0] * s + n[0] * t, origin[1] + u[1] * s + n[1] * t];
  const frame = poly.map(toFrame);
  const sMin = Math.min(...frame.map((p) => p[0]));
  const sMax = Math.max(...frame.map((p) => p[0]));
  const tMax = Math.max(...frame.map((p) => p[1]));

  const brand = brandColors[unit.id];
  const recipe = recipeFor(archetype, rng, brand);
  const frontClear = recipe.frontClear ?? FRONT_CLEAR;
  if (sMax - sMin < 1.2 || tMax < frontClear + 0.8) return;

  const edges: Edge[] = edgesAll
    .filter((_, i) => !openFronts.has(i))
    .map((edge) => ({ ...edge, depth: toFrame([(edge.a[0] + edge.b[0]) / 2, (edge.a[1] + edge.b[1]) / 2])[1] }))
    .sort((a, b) => b.depth - a.depth);
  const back = edges[0];
  const across = angleFor(u, [-n[0], -n[1]]);
  const facingIn = angleFor(u, n);
  const into = angleFor(n, u);
  const width = sMax - sMin;
  const midS = (sMin + sMax) / 2;

  // Hand-built fit-outs for venues that aren't a grid of fixtures.
  if (archetype === "bowling") {
    // Irregular venues: find the lane length and depth band that fit the most lanes side by side.
    const laneWidth = 1.08;
    let best = { count: 0, length: 0, t: 0, slots: [] as number[] };
    for (const length of [9.5, 8, 6.5, 5]) {
      for (let t = tMax - 0.45 - length / 2; t - length / 2 > frontClear + 2.4; t -= 1) {
        const slots: number[] = [];
        for (let s = sMin + laneWidth / 2 + 0.3; s < sMax - laneWidth / 2 - 0.3; s += laneWidth) {
          const [x, z] = toWorld(s, t);
          if (layout.fits(length, laneWidth, x, z, into, 0.05, 0)) slots.push(s);
        }
        if (slots.length > best.count) best = { count: slots.length, length, t, slots };
      }
      if (best.count >= 6) break;
    }
    if (best.count >= 2) {
      const slots = best.slots.slice(0, 24);
      for (const s of slots) {
        const [x, z] = toWorld(s, best.t);
        layout.place(bowlingLane(best.length, rng), x, z, into, 0.05, 0);
      }
      // Bowlers' seating behind the approaches, and the shoe counter by the entrance.
      const seatT = best.t - best.length / 2 - 0.9;
      for (let i = 0; i < slots.length; i += 2) {
        const [x, z] = toWorld(slots[i] + laneWidth / 2, seatT);
        layout.place(sofa(1.4, pick(rng, SOFT)), x, z, facingIn, 0.02, 0.05);
      }
      const shoes = counter(2.0, rng, false, brand?.primary ?? C.dark, brand?.primary ?? C.dark);
      for (const s of [midS, sMin + 2, sMax - 2]) {
        const [cx, cz] = toWorld(s, seatT - 1.4);
        if (layout.place(shoes, cx, cz, across, 0.05, 0.1)) break;
      }
      // An arcade corner along whatever wall the lanes leave free.
      for (const edge of edges) lineEdge(layout, edge, () => arcade(rng, brand?.primary), 0.5, 0, true);
      return;
    }
  }
  if (archetype === "cinema") {
    const hallStart = frontClear + 3;
    const screenT = tMax - 0.45;
    if (screenT - hallStart > 4) {
      const screenLength = Math.min(width * 0.7, 14);
      const [sx, sz] = toWorld(midS, screenT);
      layout.place(cinemaScreen(screenLength), sx, sz, across, 0.02, 0.1);
      const rowLength = Math.min(width - 1.6, 12);
      for (let t = screenT - 2.6, rows = 0; t > hallStart && rows < 20; t -= 0.78, rows++) {
        const [x, z] = toWorld(midS, t);
        layout.place(cinemaRow(rowLength), x, z, facingIn, 0.05, 0.05);
      }
      // Lobby: the concession stand and a few seats while you wait.
      const stand = counter(Math.min(3, width * 0.3), rng, true, "#b3202a", "#b3202a");
      const [cx, cz] = toWorld(sMin + width * 0.3, frontClear + stand.depth / 2 + 0.4);
      layout.place(stand, cx, cz, across, 0.05, 0.1);
      const [px, pz] = toWorld(sMin + width * 0.7, frontClear + 1.2);
      layout.place(loungeSet("#4f5d75"), px, pz, across, 0.05, 0.1);
      return;
    }
  }
  if (archetype === "icerink") {
    // The largest rink that fits, searched over the floor from the middle outwards.
    const candidates: XZ[] = [];
    for (let s = sMin + 2; s <= sMax - 2; s += 1.5) for (let t = frontClear + 2; t <= tMax - 2; t += 1.5) candidates.push([s, t]);
    const midT = (frontClear + tMax) / 2;
    candidates.sort((a, b) => Math.hypot(a[0] - midS, a[1] - midT) - Math.hypot(b[0] - midS, b[1] - midT));
    const maxLength = Math.min(width - 2, 22);
    const maxDepth = Math.min(tMax - frontClear - 2, 11);
    for (const shrink of [1, 0.85, 0.7, 0.55, 0.4]) {
      const length = maxLength * shrink;
      const depth = maxDepth * shrink;
      if (length < 4 || depth < 3) break;
      const spot = candidates.find(([cs, ct]) => {
        const [x, z] = toWorld(cs, ct);
        return layout.fits(length, depth, x, z, across, 0.3, 0.1);
      });
      if (!spot) continue;
      const [x, z] = toWorld(spot[0], spot[1]);
      layout.place(iceRink(length, depth, rng), x, z, across, 0.3, 0.1);
      // Benches along the rink's front side.
      for (const ds of [-length / 3, 0, length / 3]) {
        const [bx, bz] = toWorld(spot[0] + ds, spot[1] - depth / 2 - 0.7);
        layout.place(bench(pick(rng, SOFT)), bx, bz, facingIn, 0.05, 0.1);
      }
      return;
    }
  }

  // 1. Walls.
  if (recipe.wall) {
    const { segment, inset = 0 } = recipe.wall;
    edges.forEach((edge, i) => {
      // Edges that face the shopfront head-on are the back wall; everything else is a side.
      const facesFront = edge.inward[0] * -n[0] + edge.inward[1] * -n[1] > 0.7;
      const isBack = i === 0 || facesFront;
      const make = isBack ? recipe.wall?.back : recipe.wall?.side;
      if (make) lineEdge(layout, edge, make, segment, inset, !isBack);
    });
  }

  // 2. Counter (with its staff): parallel to the back wall, or just inside the shopfront. If the
  //    recipe's spot is too tight, the other spot is tried before giving up.
  if (recipe.counter && back) {
    const { make, place } = recipe.counter;
    const backFixture = recipe.wall?.back ? recipe.wall.back(1).depth + (recipe.wall.inset ?? 0) : 0;
    const tryAt = (where: "back" | "front", length: number) => {
      const spec = make(length);
      if (where === "back") {
        const off = WALL_HALF + backFixture + COUNTER_GAP + 0.02 + spec.depth / 2;
        const mid: XZ = [(back.a[0] + back.b[0]) / 2, (back.a[1] + back.b[1]) / 2];
        return layout.place(spec, mid[0] + back.inward[0] * off, mid[1] + back.inward[1] * off, angleFor(back.dir, back.inward), 0.05, COUNTER_GAP);
      }
      const [x, z] = toWorld(sMax - length / 2 - 0.5, frontClear + spec.depth / 2 + 0.3);
      return layout.place(spec, x, z, angleFor(u, [-n[0], -n[1]]), 0.05, COUNTER_GAP);
    };
    const lengths = [Math.min(2.4, back.length * 0.5), 1.6, 1.1, 0.8];
    const order: ("back" | "front")[] = place === "back" ? ["back", "front"] : ["front", "back"];
    order.some((where) => lengths.some((length) => tryAt(where, length)));
  }

  // 3. Plants either side of the entrance.
  if (recipe.plants && sMax - sMin > 3.2) {
    for (const s of [sMin + 0.4, sMax - 0.4]) {
      const [x, z] = toWorld(s, 0.4);
      layout.place(plant(), x, z, 0, 0.04, 0.1);
    }
  }

  // 4. Floor fill on a grid in the shopfront's frame, middle cells first, capped by floor area.
  if (recipe.centre) {
    const { axis, gap, cell, perItem } = recipe.centre;
    let area = 0;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) area += poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
    const cap = Math.min(MAX_CENTRE_ITEMS, Math.max(1, Math.round(Math.abs(area) / 2 / perItem)));
    const [cellS, cellT] = axis === "across" ? [cell[0] + gap, cell[1] + gap] : [cell[1] + gap, cell[0] + gap];
    const rot = axis === "across" ? across : into;
    const spanS = width;
    const spanT = tMax - frontClear;
    const countS = Math.floor(spanS / cellS);
    const countT = Math.floor(spanT / cellT);
    const startS = sMin + (spanS - countS * cellS) / 2 + cellS / 2;
    const startT = frontClear + (spanT - countT * cellT) / 2 + cellT / 2;
    const cells: XZ[] = [];
    for (let i = 0; i < countS; i++) for (let j = 0; j < countT; j++) cells.push([startS + i * cellS, startT + j * cellT]);
    const midT = (frontClear + tMax) / 2;
    cells.sort((a, b) => Math.hypot(a[0] - midS, a[1] - midT) - Math.hypot(b[0] - midS, b[1] - midT));
    let placed = 0;
    for (const [cs, ct] of cells) {
      if (placed >= cap) break;
      const [x, z] = toWorld(cs, ct);
      if (layout.place(recipe.centre.make(), x, z, rot, gap / 2, gap / 2)) placed++;
    }
  }
}

/** Every piece of shop furniture on a level. Deterministic: the same unit always gets the same fit-out. */
export function buildInteriors(plan: FloorPlan, directory: DirectorySpace[]): InteriorPieces {
  const pieces: InteriorPieces = { box: [], cylinder: [], disc: [], glass: [], foliage: [] };
  const spaces = new Map(directory.map((space) => [space.unitId, space]));
  for (const unit of plan.units) {
    if (unit.kind === "anchor" && !FURNISH_ANCHORS) continue;
    // Shops still being fitted out stand empty behind their hoarding.
    if (unit.comingSoon) continue;
    layoutShop(unit, spaces.get(unit.id), pieces);
  }
  return pieces;
}
