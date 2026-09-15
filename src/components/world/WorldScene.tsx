"use client";

import { useEffect, useMemo, useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { Icon } from "@/components/icons";
import {
  adjacentFloor,
  floorTitle,
  frontEdgeIndex,
  getDirectory,
  getFloorPlan,
  planToWorld,
  WORLD_BACKGROUND,
} from "@/lib/mall";
import type { FloorId, FloorPlan } from "@/types/mall";

export interface WorldSceneProps {
  floor: FloorId;
  nearbyUnitId: string | null;
  onSelectUnit: (id: string) => void;
}

type XZ = [number, number];

const SLAB_DEPTH = 0.35;
const RIM_OFFSET = 0.4;
const TILE_THICKNESS = 0.02;
const WALL_THICKNESS = 0.12;
// Architectural-model look: walls low enough to see over, so the floor plan stays readable.
const WALL_HEIGHT = 0.9;
const LIP_HEIGHT = 0.18;
const CAP_HEIGHT = 0.04;
const CAP_WIDTH = 0.16;
const CORRIDOR_WIDTH = 2.6;

const COLORS = {
  slab: "#f5f5f2",
  rim: "#e0dbd0",
  tileWest: "#e4e9f2",
  tileEast: "#f2e4e4",
  tileKiosk: "#dcdcd6",
  wall: "#ffffff",
  cap: "#f6f1e8",
  corridor: "#e9dcbf",
  anchor: "#cfcfcc",
  rail: "#252524",
  tread: "#bdbcb6",
} as const;

// ---------------------------------------------------------------------------
// Geometry helpers (world x/z)
// ---------------------------------------------------------------------------

function pointInPolygon([x, z]: XZ, poly: XZ[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Shape x = world x, shape y = −world z, so rotating −π/2 about X lands points back on (x, z). */
function shapeFromWorld(points: XZ[]): THREE.Shape {
  return new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, -z)));
}

/** Extruded flat polygon with its top face at `topY`. */
function extrudeFlat(points: XZ[], depth: number, topY: number): THREE.BufferGeometry {
  const geometry = new THREE.ExtrudeGeometry(shapeFromWorld(points), { depth, bevelEnabled: false });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, topY - depth, 0);
  return geometry;
}

/** Mitred outward offset of a simple polygon. */
function offsetPolygon(points: XZ[], distance: number): XZ[] {
  const n = points.length;
  const normals: XZ[] = points.map((a, i) => {
    const b = points[(i + 1) % n];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len = Math.hypot(dx, dz) || 1;
    let nx = dz / len;
    let nz = -dx / len;
    const mid: XZ = [(a[0] + b[0]) / 2 + nx * 0.01, (a[1] + b[1]) / 2 + nz * 0.01];
    if (pointInPolygon(mid, points)) {
      nx = -nx;
      nz = -nz;
    }
    return [nx, nz];
  });
  return points.map((p, i) => {
    const n1 = normals[(i - 1 + n) % n];
    const n2 = normals[i];
    let mx = n1[0] + n2[0];
    let mz = n1[1] + n2[1];
    const mLen = Math.hypot(mx, mz) || 1;
    mx /= mLen;
    mz /= mLen;
    const cos = Math.max(0.35, mx * n1[0] + mz * n1[1]);
    return [p[0] + (mx * distance) / cos, p[1] + (mz * distance) / cos];
  });
}

/** Axis box from `a` to `b` on the ground, extended past the ends by `extend`. */
function edgeBox(a: XZ, b: XZ, thickness: number, height: number, baseY: number, extend: number): THREE.BufferGeometry {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const len = Math.hypot(dx, dz);
  const geometry = new THREE.BoxGeometry(len + extend, height, thickness);
  geometry.rotateY(Math.atan2(-dz, dx));
  geometry.translate((a[0] + b[0]) / 2, baseY + height / 2, (a[1] + b[1]) / 2);
  return geometry;
}

function box(w: number, h: number, d: number, x: number, y: number, z: number, rotY = 0): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(w, h, d);
  if (rotY) geometry.rotateY(rotY);
  geometry.translate(x, y, z);
  return geometry;
}

function mergeAndDispose(parts: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  if (parts.length === 0) return null;
  const merged = mergeGeometries(parts, false);
  parts.forEach((part) => part.dispose());
  return merged;
}

// ---------------------------------------------------------------------------
// Scene geometry build
// ---------------------------------------------------------------------------

interface EscalatorPlacement {
  x: number;
  z: number;
  /** Rotation about Y; the ramp rises towards its local −z. */
  angle: number;
}

interface WorldGeometry {
  slab: THREE.BufferGeometry;
  rim: THREE.BufferGeometry;
  tiles: THREE.BufferGeometry | null;
  /** Cumulative triangle end index per unit, aligned with `tileUnitIds`. */
  tileTriangleEnds: number[];
  tileUnitIds: string[];
  walls: THREE.BufferGeometry | null;
  caps: THREE.BufferGeometry | null;
  westTiles: THREE.BufferGeometry | null;
  eastTiles: THREE.BufferGeometry | null;
  kioskTiles: THREE.BufferGeometry | null;
  corridor: THREE.BufferGeometry | null;
  anchors: THREE.BufferGeometry | null;
  treads: THREE.BufferGeometry | null;
  rails: THREE.BufferGeometry | null;
  escalators: EscalatorPlacement[];
}

const ANCHOR_HEIGHT = 1.6;
const KIOSK_HEIGHT = 0.5;
const ESCALATOR_RUN = 2.6;
const ESCALATOR_RISE = 1.4;
const ESCALATOR_WIDTH = 0.6;
/** Only the escalator pairs nearest the East Court get ramps; the rest stay as map points. */
const ESCALATOR_LIMIT = 4;

/** Direction of the corridor centreline at its point nearest `x, z`, as an angle about Y. */
function corridorAngleAt(corridor: XZ[], x: number, z: number): number {
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
  // Ramp geometry runs along local z, so rotate the +z axis onto the corridor direction.
  return Math.atan2(b[0] - a[0], b[1] - a[1]);
}

function buildEscalator(place: EscalatorPlacement, treads: THREE.BufferGeometry[], rails: THREE.BufferGeometry[]) {
  const length = Math.hypot(ESCALATOR_RUN, ESCALATOR_RISE);
  const slope = Math.atan2(ESCALATOR_RISE, ESCALATOR_RUN);
  const parts: [THREE.BufferGeometry, boolean][] = [];
  // Rises towards local −z; low end sits at local z = +RUN/2 on the floor.
  const sloped = (w: number, h: number, dx: number, lift: number) => {
    const geometry = new THREE.BoxGeometry(w, h, length);
    geometry.rotateX(slope);
    geometry.translate(dx, ESCALATOR_RISE / 2 + lift, 0);
    return geometry;
  };
  parts.push([sloped(ESCALATOR_WIDTH, 0.14, 0, 0.07), true]);
  const side = ESCALATOR_WIDTH / 2 + 0.04;
  for (const dx of [-side, side]) {
    parts.push([sloped(0.08, 0.3, dx, 0.12), false]);
    parts.push([sloped(0.06, 0.06, dx, 1.0), false]);
    parts.push([box(0.06, 1.0, 0.06, dx, 0.5, ESCALATOR_RUN / 2), false]);
    parts.push([box(0.06, 1.0, 0.06, dx, ESCALATOR_RISE + 0.5, -ESCALATOR_RUN / 2), false]);
  }
  for (const [geometry, isTread] of parts) {
    geometry.rotateY(place.angle);
    geometry.translate(place.x, 0, place.z);
    (isTread ? treads : rails).push(geometry);
  }
}

function buildWorld(plan: FloorPlan): WorldGeometry {
  const footprint = plan.footprint.map(planToWorld);
  const slab = extrudeFlat(footprint, SLAB_DEPTH, 0);
  const rim = extrudeFlat(offsetPolygon(footprint, RIM_OFFSET), SLAB_DEPTH, -0.01);

  const tileParts: THREE.BufferGeometry[] = [];
  const tileTriangleEnds: number[] = [];
  const tileUnitIds: string[] = [];
  let triangleCount = 0;

  const wallEdges = new Map<string, { a: XZ; b: XZ; height: number }>();
  const anchorParts: THREE.BufferGeometry[] = [];
  const westTiles: THREE.BufferGeometry[] = [];
  const eastTiles: THREE.BufferGeometry[] = [];
  const kioskTiles: THREE.BufferGeometry[] = [];

  for (const unit of plan.units) {
    const poly = unit.polygon.map(planToWorld);

    // Invisible-ish pick tile (kept for click-to-select), plus a tinted visible tile by zone/kind.
    const tile = extrudeFlat(poly, TILE_THICKNESS, 0.01 + TILE_THICKNESS);
    tileParts.push(tile);
    triangleCount += tile.getAttribute("position").count / 3;
    tileTriangleEnds.push(triangleCount);
    tileUnitIds.push(unit.id);

    if (unit.kind === "anchor") {
      anchorParts.push(extrudeFlat(poly, ANCHOR_HEIGHT, ANCHOR_HEIGHT));
      continue;
    }

    const isKiosk = unit.kind === "kiosk";
    const tinted = extrudeFlat(poly, TILE_THICKNESS, 0.035 + TILE_THICKNESS);
    (isKiosk ? kioskTiles : unit.zone === "East wing" ? eastTiles : westTiles).push(tinted);

    const front = isKiosk ? -1 : frontEdgeIndex(unit);
    poly.forEach((a, i) => {
      const b = poly[(i + 1) % poly.length];
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.05) return;
      const ka = `${a[0].toFixed(1)},${a[1].toFixed(1)}`;
      const kb = `${b[0].toFixed(1)},${b[1].toFixed(1)}`;
      const key = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
      const height = isKiosk ? KIOSK_HEIGHT : i === front ? LIP_HEIGHT : WALL_HEIGHT;
      const existing = wallEdges.get(key);
      if (!existing || existing.height < height) wallEdges.set(key, { a, b, height });
    });
  }

  const wallParts: THREE.BufferGeometry[] = [];
  const capParts: THREE.BufferGeometry[] = [];
  for (const { a, b, height } of wallEdges.values()) {
    wallParts.push(edgeBox(a, b, WALL_THICKNESS, height, 0, WALL_THICKNESS));
    capParts.push(edgeBox(a, b, CAP_WIDTH, CAP_HEIGHT, height, CAP_WIDTH));
  }

  // The main walkway, drawn as a flat ribbon along the traced corridor centreline.
  const corridorWorld = plan.corridor.map(planToWorld);
  const corridorParts: THREE.BufferGeometry[] = [];
  for (let i = 0; i + 1 < corridorWorld.length; i++) {
    corridorParts.push(edgeBox(corridorWorld[i], corridorWorld[i + 1], CORRIDOR_WIDTH, 0.015, 0.02, CORRIDOR_WIDTH * 0.4));
  }

  // Escalators come from the traced amenities, aligned to the corridor and sorted nearest the East Court.
  const corridor = plan.corridor.map(planToWorld);
  const escalators: EscalatorPlacement[] = plan.amenities
    .filter((amenity) => amenity.kind === "escalator")
    .map((amenity) => {
      const [x, z] = planToWorld(amenity.at);
      return { x, z, angle: corridorAngleAt(corridor, x, z) };
    })
    .sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))
    .slice(0, ESCALATOR_LIMIT);
  const treadParts: THREE.BufferGeometry[] = [];
  const railParts: THREE.BufferGeometry[] = [];
  for (const place of escalators) buildEscalator(place, treadParts, railParts);

  return {
    slab,
    rim,
    tiles: mergeAndDispose(tileParts),
    tileTriangleEnds,
    tileUnitIds,
    walls: mergeAndDispose(wallParts),
    caps: mergeAndDispose(capParts),
    westTiles: mergeAndDispose(westTiles),
    eastTiles: mergeAndDispose(eastTiles),
    kioskTiles: mergeAndDispose(kioskTiles),
    corridor: mergeAndDispose(corridorParts),
    anchors: mergeAndDispose(anchorParts),
    treads: mergeAndDispose(treadParts),
    rails: mergeAndDispose(railParts),
    escalators,
  };
}

function disposeWorld(world: WorldGeometry) {
  [
    world.slab,
    world.rim,
    world.tiles,
    world.walls,
    world.caps,
    world.westTiles,
    world.eastTiles,
    world.kioskTiles,
    world.corridor,
    world.anchors,
    world.treads,
    world.rails,
  ].forEach((geometry) => geometry?.dispose());
}

function unitIdForFace(world: WorldGeometry, faceIndex: number | null | undefined): string | null {
  if (faceIndex === null || faceIndex === undefined) return null;
  const index = world.tileTriangleEnds.findIndex((end) => faceIndex < end);
  return index === -1 ? null : world.tileUnitIds[index];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const stopPointer = (event: ReactPointerEvent) => event.stopPropagation();

export function WorldScene({ floor, nearbyUnitId, onSelectUnit }: WorldSceneProps) {
  const plan = useMemo(() => getFloorPlan(floor), [floor]);
  const world = useMemo(() => buildWorld(plan), [plan]);
  const directory = useMemo(() => getDirectory(floor), [floor]);
  const hoveringRef = useRef(false);

  useEffect(() => () => disposeWorld(world), [world]);

  useEffect(
    () => () => {
      if (hoveringRef.current) document.body.style.cursor = "";
      hoveringRef.current = false;
    },
    [],
  );

  const hasUnits = plan.units.length > 0;
  const nearbyUnit = nearbyUnitId ? plan.units.find((unit) => unit.id === nearbyUnitId) : undefined;
  const nearbyName = nearbyUnit
    ? (directory.find((space) => space.unitId === nearbyUnit.id)?.name ?? `Unit ${nearbyUnit.unitNumber}`)
    : null;
  const nearbyPosition = nearbyUnit ? planToWorld(nearbyUnit.labelPoint) : null;

  const above = adjacentFloor(floor, "up");
  const below = adjacentFloor(floor, "down");
  const upLabel = above ? `↑ ${floorTitle(above)}` : "↑ Top level";
  const upAria = above ? `Up escalator to ${floorTitle(above)}` : "Top level";
  const downLabel = below ? `↓ ${floorTitle(below)}` : "↓ Lowest level";
  const downAria = below ? `Down escalator to ${floorTitle(below)}` : "Lowest level";

  const handleTileClick = (event: ThreeEvent<MouseEvent>) => {
    const id = unitIdForFace(world, event.faceIndex);
    if (!id) return;
    event.stopPropagation();
    onSelectUnit(id);
  };

  const handleTileOver = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    hoveringRef.current = true;
    document.body.style.cursor = "pointer";
  };

  const handleTileOut = () => {
    hoveringRef.current = false;
    document.body.style.cursor = "";
  };

  return (
    <group>
      <ambientLight intensity={1.1} />
      <hemisphereLight args={["#ffffff", "#8a8d85", 1]} />
      <directionalLight position={[10, 24, 8]} intensity={2.1} />

      <mesh rotation-x={-Math.PI / 2} position={[0, -0.02, 0]}>
        <planeGeometry args={[600, 600]} />
        <meshBasicMaterial color={WORLD_BACKGROUND} />
      </mesh>

      <mesh geometry={world.rim}>
        <meshLambertMaterial color={COLORS.rim} />
      </mesh>
      <mesh geometry={world.slab}>
        <meshLambertMaterial color={COLORS.slab} />
      </mesh>

      {world.tiles && (
        <mesh geometry={world.tiles} onClick={handleTileClick} onPointerOver={handleTileOver} onPointerOut={handleTileOut}>
          <meshLambertMaterial color={COLORS.slab} />
        </mesh>
      )}
      {world.walls && (
        <mesh geometry={world.walls}>
          <meshLambertMaterial color={COLORS.wall} />
        </mesh>
      )}
      {world.caps && (
        <mesh geometry={world.caps}>
          <meshLambertMaterial color={COLORS.cap} />
        </mesh>
      )}
      {world.westTiles && (
        <mesh geometry={world.westTiles}>
          <meshLambertMaterial color={COLORS.tileWest} />
        </mesh>
      )}
      {world.eastTiles && (
        <mesh geometry={world.eastTiles}>
          <meshLambertMaterial color={COLORS.tileEast} />
        </mesh>
      )}
      {world.kioskTiles && (
        <mesh geometry={world.kioskTiles}>
          <meshLambertMaterial color={COLORS.tileKiosk} />
        </mesh>
      )}
      {world.corridor && (
        <mesh geometry={world.corridor}>
          <meshLambertMaterial color={COLORS.corridor} />
        </mesh>
      )}
      {world.anchors && (
        <mesh geometry={world.anchors}>
          <meshLambertMaterial color={COLORS.anchor} />
        </mesh>
      )}
      {world.treads && (
        <mesh geometry={world.treads}>
          <meshLambertMaterial color={COLORS.tread} />
        </mesh>
      )}
      {world.rails && (
        <mesh geometry={world.rails}>
          <meshLambertMaterial color={COLORS.rail} />
        </mesh>
      )}

      {world.escalators[0] && (
        <Html
          center
          position={[world.escalators[0].x, ESCALATOR_RISE + 0.9, world.escalators[0].z]}
          zIndexRange={[12, 10]}
          style={{ pointerEvents: "none" }}
        >
          <span className="escalator-direction" aria-label={upAria}>
            {upLabel}
          </span>
        </Html>
      )}
      {world.escalators[1] && (
        <Html
          center
          position={[world.escalators[1].x, ESCALATOR_RISE + 0.9, world.escalators[1].z]}
          zIndexRange={[12, 10]}
          style={{ pointerEvents: "none" }}
        >
          <span className="escalator-direction" aria-label={downAria}>
            {downLabel}
          </span>
        </Html>
      )}

      {!hasUnits && (
        <Html center position={[0, 1, 0]}>
          <div className="world-fallback">Explore the upper-floor illustration.</div>
        </Html>
      )}

      {nearbyUnit && nearbyName && nearbyPosition && (
        <Html
          center
          position={[nearbyPosition[0], 2.45, nearbyPosition[1]]}
          wrapperClass="nearby-shop-pill-wrap"
          zIndexRange={[80, 50]}
          style={{ pointerEvents: "auto" }}
        >
          <button
            type="button"
            className="nearby-shop-pill"
            aria-label={`Open details for ${nearbyName}`}
            onPointerDown={stopPointer}
            onPointerUp={stopPointer}
            onClick={(event) => {
              event.stopPropagation();
              onSelectUnit(nearbyUnit.id);
            }}
          >
            <span>{nearbyName}</span>
            <Icon name="chevronRight" size={14} />
          </button>
        </Html>
      )}
    </group>
  );
}
