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
} from "@/types/gmbb";

const creative = (id: FloorId): FloorMeta => ({
  id,
  name: "Creative spaces",
  blurb: "Explore the upper-floor illustration.",
  available: true,
});

const comingSoon = (id: FloorId): FloorMeta => ({
  id,
  name: "Coming soon",
  blurb: "",
  available: false,
});

export const FLOORS: Record<FloorId, FloorMeta> = {
  G: comingSoon("G"),
  "1": { id: "1", name: "Art, shops & cafés", blurb: "Open-top shops and creative spaces.", available: true },
  "2": { id: "2", name: "Studios & makers", blurb: "Workshops, independent shops and studios.", available: true },
  "3": creative("3"),
  "3A": creative("3A"),
  "5": comingSoon("5"),
  "6": comingSoon("6"),
  "7": comingSoon("7"),
  "8": creative("8"),
  "9": creative("9"),
};

/** Order the level rail and picker list floors, top to bottom. */
export const FLOOR_RAIL_ORDER: FloorId[] = ["9", "8", "7", "6", "5", "3A", "3", "2", "1", "G"];

export const DEFAULT_FLOOR: FloorId = "1";

/** Accessible label used by the rail, picker and escalator pills, e.g. "Level 1 · Art, shops & cafés". */
export function floorLabel(id: FloorId): string {
  return `Level ${id} · ${FLOORS[id].name}`;
}

const floorplans = floorplansJson as unknown as FloorPlan[];
const directory = directoryJson as unknown as Record<string, DirectorySpace[]>;

export const tenantReferences = tenantReferencesJson as unknown as Record<string, TenantReference>;

/** Levels 1 and 2 have surveyed plans; other available floors reuse the Level 1 shell. */
export function getFloorPlan(id: FloorId): FloorPlan {
  return floorplans.find((plan) => plan.level === id) ?? { ...floorplans[0], level: id, units: [] };
}

export function getDirectory(id: FloorId): DirectorySpace[] {
  return directory[id] ?? [];
}

// Floorplan pixels → world units. The Level 1 footprint centre is the shared origin so floors stack.
export const PLAN_SCALE = 0.05;
export const PLAN_ORIGIN: PlanPoint = [448.5, 834];

/** Plan x runs along world z, plan y along world x, so the long mall axis reads left to right. */
export function planToWorld([px, py]: PlanPoint): [number, number] {
  return [(py - PLAN_ORIGIN[1]) * PLAN_SCALE, (px - PLAN_ORIGIN[0]) * PLAN_SCALE];
}

export function polygonCentre(points: PlanPoint[]): PlanPoint {
  const sum = points.reduce<PlanPoint>((acc, [x, y]) => [acc[0] + x, acc[1] + y], [0, 0]);
  return [sum[0] / points.length, sum[1] / points.length];
}

export const ZOOM_MIN = 18;
export const ZOOM_MAX = 90;
export const ZOOM_DEFAULT = 62;
export const ZOOM_STEP = 8;

/** Camera offset direction taken from the site's initial camera position [34, 38, 42]. */
export const CAMERA_DIRECTION: [number, number, number] = [34 / 67.2, 38 / 67.2, 42 / 67.2];

export const WORLD_BACKGROUND = "#f2f2f2";
