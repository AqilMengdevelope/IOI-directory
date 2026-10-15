import directoryJson from "@/data/directory.json";
import floorplansJson from "@/data/floorplans.json";
import tenantReferencesJson from "@/data/tenant-references.json";
import type {
  DirectorySpace,
  FloorId,
  FloorMeta,
  FloorPlan,
  FloorUnit,
  PlanPoint,
  TenantReference,
} from "@/types/mall";

export const MALL_NAME = "IOI City Mall";

export const FLOORS: Record<FloorId, FloorMeta> = {
  LG: { id: "LG", name: "Home, groceries & sports", blurb: "HomePro, Lotus's, Harvey Norman, Nitori and AEON.", available: true },
  G: { id: "G", name: "Fashion & lifestyle", blurb: "Parkson, H&M, Uniqlo, Muji, Decathlon and Padini.", available: true },
  "1": { id: "1", name: "Family fun & outlets", blurb: "Icescape, District 21, Toys\"R\"Us and Brands Outlet.", available: true },
  "2": { id: "2", name: "Cinema, food & hobbies", blurb: "GSC West, Food Junction, Wangsa Bowl, Daiso and Popular.", available: true },
  "3": { id: "3", name: "East wing · dining & leisure", blurb: "GSC East, IOI Grand, Rollerwa and Believe Fitness.", available: true },
  "4": { id: "4", name: "East wing · sports centre", blurb: "IOI Sports Centre.", available: true },
};

/** Order the level rail and picker list floors, top to bottom. */
export const FLOOR_RAIL_ORDER: FloorId[] = ["4", "3", "2", "1", "G", "LG"];

export const DEFAULT_FLOOR: FloorId = "G";

/** Human title for a level, e.g. "Lower Ground", "Ground", "Level 2". */
export function floorTitle(id: FloorId): string {
  if (id === "LG") return "Lower Ground";
  if (id === "G") return "Ground";
  return `Level ${id}`;
}

/** Accessible label used by the rail, picker and escalator pills, e.g. "Ground · Fashion & lifestyle". */
export function floorLabel(id: FloorId): string {
  return `${floorTitle(id)} · ${FLOORS[id].name}`;
}

/** The available level directly above / below, following the rail order. */
export function adjacentFloor(id: FloorId, direction: "up" | "down"): FloorId | null {
  const index = FLOOR_RAIL_ORDER.indexOf(id);
  const next = FLOOR_RAIL_ORDER[direction === "up" ? index - 1 : index + 1];
  return next ?? null;
}

const floorplans = floorplansJson as unknown as FloorPlan[];
const directory = directoryJson as unknown as Record<string, DirectorySpace[]>;

export const tenantReferences = tenantReferencesJson as unknown as Record<string, TenantReference>;

export function getFloorPlan(id: FloorId): FloorPlan {
  return (
    floorplans.find((plan) => plan.level === id) ?? {
      ...floorplans[0],
      level: id,
      units: [],
      corridor: [],
      amenities: [],
    }
  );
}

export function getDirectory(id: FloorId): DirectorySpace[] {
  return directory[id] ?? [];
}

// Plan units are decimetres (from the Abuzz dataset); 1 world unit = 2 m. Every level is pre-aligned so the
// East Court sits at the origin and floors stack.
export const PLAN_SCALE = 0.05;
export const PLAN_ORIGIN: PlanPoint = [0, 0];

/** Plan x runs west → east along world x; plan y runs down the board along world z. */
export function planToWorld([px, py]: PlanPoint): [number, number] {
  return [(px - PLAN_ORIGIN[0]) * PLAN_SCALE, (py - PLAN_ORIGIN[1]) * PLAN_SCALE];
}

/** True when `floor` has a lift within `tolerance` world units of `at` — i.e. the same lift shaft. */
export function hasLiftNear(floor: FloorId, at: [number, number], tolerance = 8): boolean {
  return getFloorPlan(floor).amenities.some((amenity) => {
    if (amenity.kind !== "lift") return false;
    const [x, z] = planToWorld(amenity.at);
    return Math.hypot(x - at[0], z - at[1]) <= tolerance;
  });
}

/**
 * Where the character appears on a level: the corridor point nearest the East Court (world origin),
 * so every level spawns in the same spot of the building. Skips points on an escalator. Falls back to
 * the origin.
 */
export function spawnPoint(id: FloorId): [number, number] {
  return nearestStandingPoint(id, [0, 0]) ?? [0, 0];
}

// ---------------------------------------------------------------------------
// Escalators
// ---------------------------------------------------------------------------

/** Horizontal run, height and step width of every escalator, in world units. */
export const ESCALATOR_RUN = 2.6;
export const ESCALATOR_RISE = 1.4;
export const ESCALATOR_WIDTH = 0.6;
/** Two escalators closer than this share a bank and one up/down prompt. */
const ESCALATOR_BANK_DISTANCE = 5.5;
/** Half the spacing between the two ramps of a side-by-side pair. */
const SIDE_BY_SIDE = 0.64;

export interface Escalator {
  /** Centre of the ramp's footprint. */
  x: number;
  z: number;
  /** Rotation about Y. Riders step on at the ramp's local +z end and travel towards local −z. */
  angle: number;
  /** "up" climbs to the level above; "down" descends through an opening in the floor. */
  direction: "up" | "down";
  /** Shared by escalators standing side by side or end to end. */
  bank: number;
  /** Floor-level point just before the steps, where the prompt appears and rides begin. */
  entry: [number, number];
  /** Where the ramp ends, beyond its last step. */
  exit: [number, number];
}

/** Direction of the corridor centreline at its point nearest `x, z`, as an angle about Y. */
function corridorAngleAt(corridor: [number, number][], x: number, z: number): number {
  if (corridor.length < 2) return 0;
  let best = 0;
  let bestDistance = Infinity;
  corridor.forEach(([cx, cz], i) => {
    const d = Math.hypot(cx - x, cz - z);
    if (d < bestDistance) {
      bestDistance = d;
      best = i;
    }
  });
  const a = corridor[Math.max(0, best - 1)];
  const b = corridor[Math.min(corridor.length - 1, best + 1)];
  return Math.atan2(b[0] - a[0], b[1] - a[1]);
}

/** World point at local (lx, lz) of an escalator's frame. */
export function escalatorPoint(e: Pick<Escalator, "x" | "z" | "angle">, lx: number, lz: number): [number, number] {
  const c = Math.cos(e.angle);
  const s = Math.sin(e.angle);
  return [e.x + lx * c + lz * s, e.z - lx * s + lz * c];
}

const escalatorCache = new Map<FloorId, Escalator[]>();

/**
 * Every escalator on a level, from the traced amenities. Neighbouring points are paired into banks with
 * one going up and one going down, both facing the landing between them. A point on its own becomes a
 * side-by-side pair that criss-crosses. The top floor only goes down and the lowest only goes up.
 */
export function getEscalators(id: FloorId): Escalator[] {
  const cached = escalatorCache.get(id);
  if (cached) return cached;
  const plan = getFloorPlan(id);
  const corridor = plan.corridor.map(planToWorld);
  const points = plan.amenities.filter((amenity) => amenity.kind === "escalator").map((amenity) => planToWorld(amenity.at));
  const canUp = adjacentFloor(id, "up") !== null;
  const canDown = adjacentFloor(id, "down") !== null;

  const used = new Set<number>();
  const banks: number[][] = [];
  points.forEach((point, i) => {
    if (used.has(i)) return;
    used.add(i);
    let partner = -1;
    let partnerDistance = ESCALATOR_BANK_DISTANCE;
    points.forEach((other, j) => {
      if (used.has(j)) return;
      const d = Math.hypot(other[0] - point[0], other[1] - point[1]);
      if (d < partnerDistance) {
        partnerDistance = d;
        partner = j;
      }
    });
    if (partner !== -1) used.add(partner);
    banks.push(partner === -1 ? [i] : [i, partner]);
  });

  const escalators: Escalator[] = [];
  const push = (x: number, z: number, angle: number, direction: "up" | "down", bank: number) => {
    const e = { x, z, angle };
    escalators.push({
      ...e,
      direction,
      bank,
      entry: escalatorPoint(e, 0, ESCALATOR_RUN / 2 + 0.6),
      exit: escalatorPoint(e, 0, -ESCALATOR_RUN / 2 - 0.45),
    });
  };
  banks.forEach((members, bank) => {
    if (members.length === 1 && canUp && canDown) {
      const [x, z] = points[members[0]];
      const angle = corridorAngleAt(corridor, x, z);
      const [ox, oz] = [Math.cos(angle) * SIDE_BY_SIDE, -Math.sin(angle) * SIDE_BY_SIDE];
      push(x - ox, z - oz, angle, "up", bank);
      push(x + ox, z + oz, angle + Math.PI, "down", bank);
      return;
    }
    const mid: [number, number] = [
      members.reduce((sum, i) => sum + points[i][0], 0) / members.length,
      members.reduce((sum, i) => sum + points[i][1], 0) / members.length,
    ];
    members.forEach((i, order) => {
      const [x, z] = points[i];
      const direction: "up" | "down" = !canDown ? "up" : !canUp ? "down" : order === 0 ? "up" : "down";
      let angle = corridorAngleAt(corridor, x, z);
      // Face the entry towards the bank's shared landing; side-by-side pairs criss-cross instead.
      const toward = (a: number) => {
        const [ex, ez] = escalatorPoint({ x, z, angle: a }, 0, ESCALATOR_RUN / 2);
        return Math.hypot(ex - mid[0], ez - mid[1]);
      };
      const flip = toward(angle + Math.PI);
      const keep = toward(angle);
      if (Math.abs(flip - keep) > 0.3 ? flip < keep : direction === "down") angle += Math.PI;
      push(x, z, angle, direction, bank);
    });
  });
  escalatorCache.set(id, escalators);
  return escalators;
}

/**
 * The floor area an escalator takes up: the ramp for an up escalator, or the opening in the floor for a
 * down one. The character can't walk into it, and a down escalator's slab is cut out along it.
 */
export function escalatorFootprint(e: Escalator): [number, number][] {
  const half = ESCALATOR_WIDTH / 2 + (e.direction === "down" ? 0.35 : 0.2);
  const back = e.direction === "down" ? -ESCALATOR_RUN / 2 - 0.6 : -ESCALATOR_RUN / 2;
  return [
    escalatorPoint(e, -half, ESCALATOR_RUN / 2),
    escalatorPoint(e, half, ESCALATOR_RUN / 2),
    escalatorPoint(e, half, back),
    escalatorPoint(e, -half, back),
  ];
}

function insidePolygon(x: number, z: number, polygon: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, zi] = polygon[i];
    const [xj, zj] = polygon[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** True when `x, z` is on (or within `margin` of) an escalator's footprint. */
export function isOnEscalator(id: FloorId, x: number, z: number, margin = 0.5): boolean {
  return getEscalators(id).some((e) => {
    const ring = escalatorFootprint(e);
    return insidePolygon(x, z, ring) || ring.some((p, i) => {
      const q = ring[(i + 1) % ring.length];
      const vx = q[0] - p[0];
      const vz = q[1] - p[1];
      const t = Math.max(0, Math.min(1, ((x - p[0]) * vx + (z - p[1]) * vz) / (vx * vx + vz * vz || 1)));
      return Math.hypot(x - (p[0] + vx * t), z - (p[1] + vz * t)) < margin;
    });
  });
}

/** The corridor point nearest `to` that isn't on an escalator, or null for a level with no corridor. */
export function nearestStandingPoint(id: FloorId, to: [number, number]): [number, number] | null {
  let best: [number, number] | null = null;
  let bestDistance = Infinity;
  for (const point of getFloorPlan(id).corridor.map(planToWorld)) {
    const d = Math.hypot(point[0] - to[0], point[1] - to[1]);
    if (d < bestDistance && !isOnEscalator(id, point[0], point[1])) {
      bestDistance = d;
      best = point;
    }
  }
  return best;
}

export function polygonCentre(points: PlanPoint[]): PlanPoint {
  const sum = points.reduce<PlanPoint>((acc, [x, y]) => [acc[0] + x, acc[1] + y], [0, 0]);
  return [sum[0] / points.length, sum[1] / points.length];
}

const FACING_VECTORS: Record<string, PlanPoint> = {
  right: [1, 0],
  left: [-1, 0],
  down: [0, 1],
  up: [0, -1],
};

/** Index of the plan-space edge whose outward normal best matches the unit's shopfront, or -1. */
export function frontEdgeIndex(unit: FloorUnit): number {
  const facing = FACING_VECTORS[unit.frontFacing];
  if (!facing) return -1;
  const poly = unit.polygon;
  const [cx, cy] = polygonCentre(poly);
  let best = -1;
  let bestScore = -Infinity;
  let bestLength = 0;
  poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) return;
    let nx = dy / len;
    let ny = -dx / len;
    if (((a[0] + b[0]) / 2 - cx) * nx + ((a[1] + b[1]) / 2 - cy) * ny < 0) {
      nx = -nx;
      ny = -ny;
    }
    const score = nx * facing[0] + ny * facing[1];
    if (score > bestScore + 0.05 || (Math.abs(score - bestScore) <= 0.05 && len > bestLength)) {
      best = i;
      bestScore = Math.max(score, bestScore);
      bestLength = len;
    }
  });
  return best;
}

/** How far behind the outermost point of a shopfront an edge can sit and still be part of it (plan units). */
const FRONT_BAND = 24;

/**
 * Every edge that makes up a unit's open shopfront: the main front edge plus any other edge facing the
 * same way along the front line. Big anchors trace curved or stepped facades as many short edges, so a
 * single edge would leave only a sliver of doorway. Kiosks are closed on every side.
 */
export function frontEdges(unit: FloorUnit): Set<number> {
  const edges = new Set<number>();
  if (unit.kind === "kiosk" || unit.comingSoon) return edges;
  const main = frontEdgeIndex(unit);
  const facing = FACING_VECTORS[unit.frontFacing];
  if (main === -1 || !facing) return edges;
  edges.add(main);
  const poly = unit.polygon;
  const [cx, cy] = polygonCentre(poly);
  const project = (p: PlanPoint) => p[0] * facing[0] + p[1] * facing[1];
  const outermost = Math.max(...poly.map(project));
  poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) return;
    let nx = dy / len;
    let ny = -dx / len;
    if (((a[0] + b[0]) / 2 - cx) * nx + ((a[1] + b[1]) / 2 - cy) * ny < 0) {
      nx = -nx;
      ny = -ny;
    }
    if (nx * facing[0] + ny * facing[1] >= 0.8 && Math.min(project(a), project(b)) >= outermost - FRONT_BAND) edges.add(i);
  });
  return edges;
}

/**
 * Where to walk to for a unit: just inside the middle of its shopfront, so the character arrives at
 * the door rather than inside a counter. Kiosks and closed units (behind hoarding) use their label
 * point (routes snap to the nearest reachable spot beside them).
 */
export function unitEntrance(unit: FloorUnit): [number, number] {
  const front = unit.kind === "kiosk" || unit.comingSoon ? -1 : frontEdgeIndex(unit);
  if (front === -1) return planToWorld(unit.labelPoint);
  const poly = unit.polygon.map(planToWorld);
  const a = poly[front];
  const b = poly[(front + 1) % poly.length];
  const [cx, cz] = planToWorld(polygonCentre(unit.polygon));
  const mx = (a[0] + b[0]) / 2;
  const mz = (a[1] + b[1]) / 2;
  const length = Math.hypot(cx - mx, cz - mz) || 1;
  const inset = Math.min(0.9, length * 0.5);
  return [mx + ((cx - mx) / length) * inset, mz + ((cz - mz) / length) * inset];
}

/** A solid wall in world space, from `a` to `b` on the ground. */
export interface WallSegment {
  a: [number, number];
  b: [number, number];
}

/**
 * Every wall the character cannot pass: all unit edges except each shop's (or anchor's) open front,
 * the floor outline and each escalator's footprint. Kiosks are low but still solid. Shared edges appear once.
 */
export function getWallSegments(id: FloorId): WallSegment[] {
  const plan = getFloorPlan(id);
  const walls = new Map<string, WallSegment>();
  const key = (p: [number, number]) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`;
  const add = (a: [number, number], b: [number, number], solid: boolean) => {
    const ka = key(a);
    const kb = key(b);
    const k = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
    // A closed wall wins over an open front on a shared edge.
    if (solid) walls.set(k, { a, b });
    else if (!walls.has(k)) walls.set(k, { a, b });
  };
  for (const unit of plan.units) {
    const poly = unit.polygon.map(planToWorld);
    const fronts = frontEdges(unit);
    poly.forEach((a, i) => {
      if (fronts.has(i)) return;
      add(a, poly[(i + 1) % poly.length], true);
    });
  }
  const outline = plan.footprint.map(planToWorld);
  outline.forEach((a, i) => add(a, outline[(i + 1) % outline.length], true));
  // Escalators are ridden through the prompt, never walked onto.
  for (const escalator of getEscalators(id)) {
    const ring = escalatorFootprint(escalator);
    ring.forEach((a, i) => add(a, ring[(i + 1) % ring.length], true));
  }
  return [...walls.values()];
}

export const ZOOM_MIN = 18;
export const ZOOM_MAX = 320;
export const ZOOM_DEFAULT = 110;
export const ZOOM_STEP = 16;

/** Camera offset direction taken from the original explorer's initial camera position [34, 38, 42]. */
export const CAMERA_DIRECTION: [number, number, number] = [34 / 67.2, 38 / 67.2, 42 / 67.2];

export const WORLD_BACKGROUND = "#f2f2f2";
