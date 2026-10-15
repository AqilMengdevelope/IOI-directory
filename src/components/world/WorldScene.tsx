"use client";

import { useEffect, useMemo, useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import brandColorsJson from "@/data/brand-colors.json";
import type { ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { Icon } from "@/components/icons";
import {
  escalatorFootprint,
  frontEdges,
  getDirectory,
  getEscalators,
  getFloorPlan,
  planToWorld,
  WORLD_BACKGROUND,
} from "@/lib/mall";
import type { FloorId, FloorPlan, FloorUnit } from "@/types/mall";
import { Escalators } from "./Escalators";
import { ShopInteriors } from "./ShopInteriors";
import { UnitLogos } from "./UnitLogos";

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
// Hoarding in front of shops being fitted out: taller than the walls, with a red band on top.
const HOARDING_HEIGHT = 1.15;
const HOARDING_THICKNESS = 0.2;
const HOARDING_BAND = 0.1;

const COLORS = {
  slab: "#f5f5f2",
  rim: "#e0dbd0",
  tileWest: "#e4e9f2",
  tileEast: "#f2e4e4",
  tileKiosk: "#dcdcd6",
  wall: "#ffffff",
  cap: "#f6f1e8",
  corridor: "#e9dcbf",
  hoarding: "#3d4149",
  hoardingBand: "#ec1d25",
  tileComingSoon: "#d6d3cc",
} as const;

const brandColors = brandColorsJson as Record<string, { primary: string; accent: string | null }>;

/**
 * Floor colour for an anchor (big store): its brand colour, softened, when the logo has a real colour;
 * otherwise the mall map's fill. Black, white and grey logos fall back to the map colour.
 */
function anchorFloor(unit: FloorUnit): THREE.Color | null {
  const brand = brandColors[unit.id];
  for (const hex of [brand?.primary, brand?.accent]) {
    if (!hex) continue;
    const color = new THREE.Color(hex);
    const { s, l } = color.getHSL({ h: 0, s: 0, l: 0 });
    if (s > 0.3 && l > 0.15 && l < 0.85) return color.lerp(new THREE.Color("#ffffff"), 0.35);
  }
  return null;
}

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
function shapeFromWorld(points: XZ[], holes: XZ[][] = []): THREE.Shape {
  const shape = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, -z)));
  shape.holes = holes.map((hole) => new THREE.Path(hole.map(([x, z]) => new THREE.Vector2(x, -z))));
  return shape;
}

/** Extruded flat polygon with its top face at `topY`, optionally with openings cut through it. */
function extrudeFlat(points: XZ[], depth: number, topY: number, holes: XZ[][] = []): THREE.BufferGeometry {
  const geometry = new THREE.ExtrudeGeometry(shapeFromWorld(points, holes), { depth, bevelEnabled: false });
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
  liftShafts: THREE.BufferGeometry | null;
  liftCaps: THREE.BufferGeometry | null;
  hoarding: THREE.BufferGeometry | null;
  hoardingBands: THREE.BufferGeometry | null;
}

const KIOSK_HEIGHT = 0.5;
const LIFT_HEIGHT = 1.9;

function buildWorld(plan: FloorPlan): WorldGeometry {
  const footprint = plan.footprint.map(planToWorld);
  // Down escalators descend through openings in the floor.
  const openings = getEscalators(plan.level)
    .filter((escalator) => escalator.direction === "down")
    .map(escalatorFootprint);
  const slab = extrudeFlat(footprint, SLAB_DEPTH, 0, openings);
  // Layers are spaced well apart: at this mall's size, centimetre gaps depth-fight when zoomed out.
  const rim = extrudeFlat(offsetPolygon(footprint, RIM_OFFSET), SLAB_DEPTH, -0.08, openings);

  const tileParts: THREE.BufferGeometry[] = [];
  const tileTriangleEnds: number[] = [];
  const tileUnitIds: string[] = [];
  let triangleCount = 0;

  const wallEdges = new Map<string, { a: XZ; b: XZ; height: number }>();
  const westTiles: THREE.BufferGeometry[] = [];
  const eastTiles: THREE.BufferGeometry[] = [];
  const kioskTiles: THREE.BufferGeometry[] = [];
  const hoardingParts: THREE.BufferGeometry[] = [];
  const hoardingBandParts: THREE.BufferGeometry[] = [];

  for (const unit of plan.units) {
    const poly = unit.polygon.map(planToWorld);

    // Invisible-ish pick tile (kept for click-to-select), plus a tinted visible tile by zone/kind.
    const tile = extrudeFlat(poly, TILE_THICKNESS, 0.01 + TILE_THICKNESS);
    tileParts.push(tile);
    triangleCount += tile.getAttribute("position").count / 3;
    tileTriangleEnds.push(triangleCount);
    tileUnitIds.push(unit.id);

    // Anchors are drawn like shops (low walls, open front) on a floor in their brand colour.
    const isKiosk = unit.kind === "kiosk";
    const tinted = extrudeFlat(poly, TILE_THICKNESS, 0.035 + TILE_THICKNESS);
    // Paint each tile with the mall map's own fill colour (softened), falling back to the zone tint.
    let fill = new THREE.Color(unit.color ?? (isKiosk ? COLORS.tileKiosk : unit.zone === "East wing" ? COLORS.tileEast : COLORS.tileWest));
    if (unit.color) fill.lerp(new THREE.Color("#ffffff"), unit.kind === "anchor" ? 0.25 : 0.45);
    if (unit.kind === "anchor") fill = anchorFloor(unit) ?? fill;
    if (unit.comingSoon) fill = new THREE.Color(COLORS.tileComingSoon);
    const count = tinted.getAttribute("position").count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      colors[i * 3] = fill.r;
      colors[i * 3 + 1] = fill.g;
      colors[i * 3 + 2] = fill.b;
    }
    tinted.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    (isKiosk ? kioskTiles : unit.zone === "East wing" ? eastTiles : westTiles).push(tinted);

    const fronts = frontEdges(unit);
    // A shop being fitted out is closed all round; its would-be shopfront gets hoarding.
    if (unit.comingSoon) {
      for (const i of frontEdges({ ...unit, comingSoon: false })) {
        const a = poly[i];
        const b = poly[(i + 1) % poly.length];
        if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.05) continue;
        hoardingParts.push(edgeBox(a, b, HOARDING_THICKNESS, HOARDING_HEIGHT, 0, 0));
        hoardingBandParts.push(edgeBox(a, b, HOARDING_THICKNESS + 0.02, HOARDING_BAND, HOARDING_HEIGHT - HOARDING_BAND - 0.08, 0.01));
      }
    }
    poly.forEach((a, i) => {
      const b = poly[(i + 1) % poly.length];
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.05) return;
      const ka = `${a[0].toFixed(1)},${a[1].toFixed(1)}`;
      const kb = `${b[0].toFixed(1)},${b[1].toFixed(1)}`;
      const key = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
      const height = isKiosk ? KIOSK_HEIGHT : fronts.has(i) ? LIP_HEIGHT : WALL_HEIGHT;
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

  // The corridor is the slab itself: the walk graph is pathfinding data, not something to draw.
  const corridorParts: THREE.BufferGeometry[] = [];

  // Lifts: a small shaft with a brand-red cap, so they are easy to spot and walk up to.
  const liftShaftParts: THREE.BufferGeometry[] = [];
  const liftCapParts: THREE.BufferGeometry[] = [];
  for (const amenity of plan.amenities) {
    if (amenity.kind !== "lift") continue;
    const [x, z] = planToWorld(amenity.at);
    liftShaftParts.push(box(1.1, LIFT_HEIGHT, 1.1, x, LIFT_HEIGHT / 2, z));
    liftCapParts.push(box(1.3, 0.14, 1.3, x, LIFT_HEIGHT + 0.07, z));
  }

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
    liftShafts: mergeAndDispose(liftShaftParts),
    liftCaps: mergeAndDispose(liftCapParts),
    hoarding: mergeAndDispose(hoardingParts),
    hoardingBands: mergeAndDispose(hoardingBandParts),
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
    world.liftShafts,
    world.liftCaps,
    world.hoarding,
    world.hoardingBands,
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

      {/* Below the escalator wells (ESCALATOR_RISE deep), so they're never clipped by it. */}
      <mesh rotation-x={-Math.PI / 2} position={[0, -2.2, 0]}>
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
          <meshLambertMaterial vertexColors />
        </mesh>
      )}
      {world.eastTiles && (
        <mesh geometry={world.eastTiles}>
          <meshLambertMaterial vertexColors />
        </mesh>
      )}
      {world.kioskTiles && (
        <mesh geometry={world.kioskTiles}>
          <meshLambertMaterial vertexColors />
        </mesh>
      )}
      {world.corridor && (
        <mesh geometry={world.corridor}>
          <meshLambertMaterial color={COLORS.corridor} />
        </mesh>
      )}

      {world.liftShafts && (
        <mesh geometry={world.liftShafts}>
          <meshLambertMaterial color="#8a8f99" />
        </mesh>
      )}
      {world.liftCaps && (
        <mesh geometry={world.liftCaps}>
          <meshLambertMaterial color="#ec1d25" />
        </mesh>
      )}
      {world.hoarding && (
        <mesh geometry={world.hoarding}>
          <meshLambertMaterial color={COLORS.hoarding} />
        </mesh>
      )}
      {world.hoardingBands && (
        <mesh geometry={world.hoardingBands}>
          <meshLambertMaterial color={COLORS.hoardingBand} />
        </mesh>
      )}

      <Escalators floor={floor} />

      {!hasUnits && (
        <Html center position={[0, 1, 0]}>
          <div className="world-fallback">Explore the upper-floor illustration.</div>
        </Html>
      )}

      <ShopInteriors plan={plan} directory={directory} />
      <UnitLogos plan={plan} />

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
