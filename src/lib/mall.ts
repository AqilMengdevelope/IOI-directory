import directoryJson from "@/data/directory.json";
import floorplansJson from "@/data/floorplans.json";
import tenantReferencesJson from "@/data/tenant-references.json";
import type {
  DirectorySpace,
  FloorId,
  FloorMeta,
  FloorPlan,
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

// Floorplan pixels → world units. Plans are pre-aligned so the East Court sits at the origin on every level.
export const PLAN_SCALE = 0.055;
export const PLAN_ORIGIN: PlanPoint = [0, 0];

/** Plan x runs west → east along world x; plan y runs down the board along world z. */
export function planToWorld([px, py]: PlanPoint): [number, number] {
  return [(px - PLAN_ORIGIN[0]) * PLAN_SCALE, (py - PLAN_ORIGIN[1]) * PLAN_SCALE];
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

export const ZOOM_MIN = 18;
export const ZOOM_MAX = 140;
export const ZOOM_DEFAULT = 30;
export const ZOOM_STEP = 10;

/** Camera offset direction taken from the original explorer's initial camera position [34, 38, 42]. */
export const CAMERA_DIRECTION: [number, number, number] = [34 / 67.2, 38 / 67.2, 42 / 67.2];

export const WORLD_BACKGROUND = "#f2f2f2";
