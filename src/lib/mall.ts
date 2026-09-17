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
 * so every level spawns in the same spot of the building. Falls back to the origin.
 */
export function spawnPoint(id: FloorId): [number, number] {
  const corridor = getFloorPlan(id).corridor.map(planToWorld);
  if (corridor.length === 0) return [0, 0];
  return corridor.reduce((best, point) => (Math.hypot(point[0], point[1]) < Math.hypot(best[0], best[1]) ? point : best));
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

/** A solid wall in world space, from `a` to `b` on the ground. */
export interface WallSegment {
  a: [number, number];
  b: [number, number];
}

/**
 * Every wall the character cannot pass: all unit edges except each shop's open front, plus the floor
 * outline. Anchors are closed on every side; kiosks are low but still solid. Shared edges appear once.
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
    const front = unit.kind === "shop" ? frontEdgeIndex(unit) : -1;
    poly.forEach((a, i) => {
      if (i === front) return;
      add(a, poly[(i + 1) % poly.length], true);
    });
  }
  const outline = plan.footprint.map(planToWorld);
  outline.forEach((a, i) => add(a, outline[(i + 1) % outline.length], true));
  return [...walls.values()];
}

export const ZOOM_MIN = 18;
export const ZOOM_MAX = 320;
export const ZOOM_DEFAULT = 110;
export const ZOOM_STEP = 16;

/** Camera offset direction taken from the original explorer's initial camera position [34, 38, 42]. */
export const CAMERA_DIRECTION: [number, number, number] = [34 / 67.2, 38 / 67.2, 42 / 67.2];

export const WORLD_BACKGROUND = "#f2f2f2";
