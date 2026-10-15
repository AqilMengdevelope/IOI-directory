import { getFloorPlan, getWallSegments, planToWorld, spawnPoint } from "@/lib/mall";
import type { FloorId } from "@/types/mall";

/**
 * Route-finding over each level's real walls. A level is rasterised once into a walkability grid:
 * cells outside the floor outline, within a body's clearance of a wall (shop walls, anchors, escalator
 * footprints) or unreachable from the walkway are blocked. Routes are A* over that grid, then pulled
 * tight with line-of-sight checks so the character walks straight lines between corners.
 */

type XZ = [number, number];

/** Grid resolution in world units (1 unit = 2 m). */
const CELL = 0.3;
/** Distance kept from walls: the character's body radius plus a little margin. */
const CLEARANCE = 0.3;
/** Give up on searches that expand more cells than this rather than stall a frame. */
const MAX_EXPANSIONS = 600_000;
const SQRT2 = Math.SQRT2;

interface NavGrid {
  minX: number;
  minZ: number;
  cols: number;
  rows: number;
  /** 1 = blocked, 0 = walkable. */
  blocked: Uint8Array;
}

const grids = new Map<FloorId, NavGrid>();

function distanceToSegment(px: number, pz: number, a: XZ, b: XZ): number {
  const vx = b[0] - a[0];
  const vz = b[1] - a[1];
  const lengthSq = vx * vx + vz * vz || 1e-9;
  const t = Math.max(0, Math.min(1, ((px - a[0]) * vx + (pz - a[1]) * vz) / lengthSq));
  return Math.hypot(px - (a[0] + vx * t), pz - (a[1] + vz * t));
}

function buildGrid(floor: FloorId): NavGrid {
  const footprint = getFloorPlan(floor).footprint.map(planToWorld);
  const xs = footprint.map((p) => p[0]);
  const zs = footprint.map((p) => p[1]);
  const minX = Math.min(...xs) - CELL;
  const minZ = Math.min(...zs) - CELL;
  const cols = Math.ceil((Math.max(...xs) - minX) / CELL) + 2;
  const rows = Math.ceil((Math.max(...zs) - minZ) / CELL) + 2;
  const blocked = new Uint8Array(cols * rows).fill(1);

  // Open the floor outline, row by row (scanline fill at cell centres).
  for (let r = 0; r < rows; r++) {
    const z = minZ + (r + 0.5) * CELL;
    const crossings: number[] = [];
    for (let i = 0, j = footprint.length - 1; i < footprint.length; j = i++) {
      const [ax, az] = footprint[j];
      const [bx, bz] = footprint[i];
      if (az > z !== bz > z) crossings.push(ax + ((z - az) * (bx - ax)) / (bz - az));
    }
    crossings.sort((a, b) => a - b);
    for (let k = 0; k + 1 < crossings.length; k += 2) {
      const c0 = Math.max(0, Math.ceil((crossings[k] - minX) / CELL - 0.5));
      const c1 = Math.min(cols - 1, Math.floor((crossings[k + 1] - minX) / CELL - 0.5));
      blocked.fill(0, r * cols + c0, r * cols + c1 + 1);
    }
  }

  // Close a clearance band around every wall.
  for (const { a, b } of getWallSegments(floor)) {
    const c0 = Math.max(0, Math.floor((Math.min(a[0], b[0]) - CLEARANCE - minX) / CELL));
    const c1 = Math.min(cols - 1, Math.ceil((Math.max(a[0], b[0]) + CLEARANCE - minX) / CELL));
    const r0 = Math.max(0, Math.floor((Math.min(a[1], b[1]) - CLEARANCE - minZ) / CELL));
    const r1 = Math.min(rows - 1, Math.ceil((Math.max(a[1], b[1]) + CLEARANCE - minZ) / CELL));
    for (let r = r0; r <= r1; r++) {
      const z = minZ + (r + 0.5) * CELL;
      for (let c = c0; c <= c1; c++) {
        if (distanceToSegment(minX + (c + 0.5) * CELL, z, a, b) < CLEARANCE) blocked[r * cols + c] = 1;
      }
    }
  }

  // Anything the walkway can't reach (inside anchors, sealed corners) is blocked too, so a target
  // there snaps to the nearest reachable spot instead of producing no route.
  const grid: NavGrid = { minX, minZ, cols, rows, blocked };
  const seed = nearestFree(grid, cellOf(grid, spawnPoint(floor)), 40);
  if (seed !== -1) {
    const reached = new Uint8Array(cols * rows);
    const queue = new Int32Array(cols * rows);
    let head = 0;
    let tail = 0;
    queue[tail++] = seed;
    reached[seed] = 1;
    const visit = (index: number) => {
      if (blocked[index] || reached[index]) return;
      reached[index] = 1;
      queue[tail++] = index;
    };
    while (head < tail) {
      const index = queue[head++];
      const c = index % cols;
      const r = (index - c) / cols;
      if (c > 0) visit(index - 1);
      if (c < cols - 1) visit(index + 1);
      if (r > 0) visit(index - cols);
      if (r < rows - 1) visit(index + cols);
    }
    for (let i = 0; i < blocked.length; i++) if (!reached[i]) blocked[i] = 1;
  }
  return grid;
}

function getGrid(floor: FloorId): NavGrid {
  let grid = grids.get(floor);
  if (!grid) {
    grid = buildGrid(floor);
    grids.set(floor, grid);
  }
  return grid;
}

function cellOf(grid: NavGrid, [x, z]: XZ): number {
  const c = Math.max(0, Math.min(grid.cols - 1, Math.floor((x - grid.minX) / CELL)));
  const r = Math.max(0, Math.min(grid.rows - 1, Math.floor((z - grid.minZ) / CELL)));
  return r * grid.cols + c;
}

function centreOf(grid: NavGrid, index: number): XZ {
  const c = index % grid.cols;
  const r = (index - c) / grid.cols;
  return [grid.minX + (c + 0.5) * CELL, grid.minZ + (r + 0.5) * CELL];
}

/** The walkable cell nearest `index`, searching square rings out to `radius` cells; -1 if none. */
function nearestFree(grid: NavGrid, index: number, radius: number): number {
  if (!grid.blocked[index]) return index;
  const c0 = index % grid.cols;
  const r0 = (index - c0) / grid.cols;
  for (let ring = 1; ring <= radius; ring++) {
    let best = -1;
    let bestDistance = Infinity;
    for (let dr = -ring; dr <= ring; dr++) {
      for (let dc = -ring; dc <= ring; dc++) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;
        const r = r0 + dr;
        const c = c0 + dc;
        if (r < 0 || c < 0 || r >= grid.rows || c >= grid.cols) continue;
        const candidate = r * grid.cols + c;
        const distance = dr * dr + dc * dc;
        if (!grid.blocked[candidate] && distance < bestDistance) {
          bestDistance = distance;
          best = candidate;
        }
      }
    }
    if (best !== -1) return best;
  }
  return -1;
}

/** True when the straight segment a→b stays on walkable cells. */
function lineOfSight(grid: NavGrid, a: XZ, b: XZ): boolean {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const steps = Math.max(1, Math.ceil(length / (CELL * 0.5)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (grid.blocked[cellOf(grid, [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])]) return false;
  }
  return true;
}

// Search buffers, shared by every level and grown to the largest grid.
let gScore = new Float32Array(0);
let parent = new Int32Array(0);
let openedAt = new Uint32Array(0);
let closedAt = new Uint32Array(0);
let searchId = 0;

function ensureBuffers(size: number) {
  if (gScore.length >= size) return;
  gScore = new Float32Array(size);
  parent = new Int32Array(size);
  openedAt = new Uint32Array(size);
  closedAt = new Uint32Array(size);
  searchId = 0;
}

/** Minimal binary min-heap of cell indices keyed by f-score. */
class Heap {
  private items: number[] = [];
  private keys: number[] = [];

  get size() {
    return this.items.length;
  }

  push(item: number, key: number) {
    const { items, keys } = this;
    let i = items.length;
    items.push(item);
    keys.push(key);
    while (i > 0) {
      const up = (i - 1) >> 1;
      if (keys[up] <= key) break;
      items[i] = items[up];
      keys[i] = keys[up];
      i = up;
    }
    items[i] = item;
    keys[i] = key;
  }

  pop(): number {
    const { items, keys } = this;
    const top = items[0];
    const lastItem = items.pop() as number;
    const lastKey = keys.pop() as number;
    if (items.length > 0) {
      let i = 0;
      const n = items.length;
      for (;;) {
        const left = 2 * i + 1;
        if (left >= n) break;
        const right = left + 1;
        const child = right < n && keys[right] < keys[left] ? right : left;
        if (keys[child] >= lastKey) break;
        items[i] = items[child];
        keys[i] = keys[child];
        i = child;
      }
      items[i] = lastItem;
      keys[i] = lastKey;
    }
    return top;
  }
}

/**
 * A walking route from `from` to `to` on `floor`, as world waypoints starting at `from`. The end snaps
 * to the nearest reachable spot when `to` is inside a wall or a closed unit. Null if no route exists.
 */
export function findPath(floor: FloorId, from: XZ, to: XZ): XZ[] | null {
  const grid = getGrid(floor);
  const start = nearestFree(grid, cellOf(grid, from), 8);
  // Anchors are closed boxes up to ~60 units across, so a destination may snap a long way to their edge.
  const goal = nearestFree(grid, cellOf(grid, to), 220);
  if (start === -1 || goal === -1) return null;

  const { cols, blocked } = grid;
  ensureBuffers(blocked.length);
  searchId++;
  const goalC = goal % cols;
  const goalR = (goal - goalC) / cols;
  const heuristic = (index: number) => {
    const c = index % cols;
    const dc = Math.abs(c - goalC);
    const dr = Math.abs((index - c) / cols - goalR);
    return dc + dr + (SQRT2 - 2) * Math.min(dc, dr);
  };

  const heap = new Heap();
  gScore[start] = 0;
  parent[start] = -1;
  openedAt[start] = searchId;
  heap.push(start, heuristic(start));
  let expansions = 0;
  let found = false;

  while (heap.size > 0) {
    const current = heap.pop();
    if (closedAt[current] === searchId) continue;
    closedAt[current] = searchId;
    if (current === goal) {
      found = true;
      break;
    }
    if (++expansions > MAX_EXPANSIONS) break;
    const c = current % cols;
    const r = (current - c) / cols;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nc = c + dc;
        const nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= cols || nr >= grid.rows) continue;
        const next = nr * cols + nc;
        if (blocked[next] || closedAt[next] === searchId) continue;
        // No cutting corners past a wall.
        if (dr !== 0 && dc !== 0 && (blocked[r * cols + nc] || blocked[nr * cols + c])) continue;
        const tentative = gScore[current] + (dr !== 0 && dc !== 0 ? SQRT2 : 1);
        if (openedAt[next] === searchId && tentative >= gScore[next]) continue;
        openedAt[next] = searchId;
        gScore[next] = tentative;
        parent[next] = current;
        heap.push(next, tentative + heuristic(next));
      }
    }
  }
  if (!found) return null;

  const cells: XZ[] = [];
  for (let index = goal; index !== -1; index = parent[index]) cells.push(centreOf(grid, index));
  cells.reverse();

  // Pull the route tight: keep a corner only where the straight line to the next one is blocked.
  const route: XZ[] = [from];
  let anchor: XZ = from;
  for (let i = 1; i < cells.length; i++) {
    if (!lineOfSight(grid, anchor, cells[i])) {
      anchor = cells[i - 1];
      route.push(anchor);
    }
  }
  const end = lineOfSight(grid, anchor, to) && !grid.blocked[cellOf(grid, to)] ? to : cells[cells.length - 1];
  route.push(end);
  return route;
}

/** Total length of a route in world units. */
export function routeLength(route: XZ[]): number {
  let total = 0;
  for (let i = 1; i < route.length; i++) total += Math.hypot(route[i][0] - route[i - 1][0], route[i][1] - route[i - 1][1]);
  return total;
}
