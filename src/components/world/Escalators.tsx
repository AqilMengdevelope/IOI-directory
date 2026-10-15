"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  ESCALATOR_RISE,
  ESCALATOR_RUN,
  ESCALATOR_WIDTH,
  adjacentFloor,
  escalatorPoint,
  floorTitle,
  getEscalators,
} from "@/lib/mall";
import type { Escalator } from "@/lib/mall";
import type { FloorId } from "@/types/mall";

interface EscalatorsProps {
  floor: FloorId;
}

const STEPS = 14;
/** Steps travelling past a point per second. */
const STEP_RATE = 1.6;
const SLOPE = Math.atan2(ESCALATOR_RISE, ESCALATOR_RUN);
const SLOPE_LENGTH = Math.hypot(ESCALATOR_RUN, ESCALATOR_RISE);
const W = ESCALATOR_WIDTH;
const RAIL_X = W / 2 + 0.07;
/** Half-width of a down escalator's opening in the floor (matches escalatorFootprint). */
const VOID_HALF = W / 2 + 0.35;
const VOID_BACK = -ESCALATOR_RUN / 2 - 0.6;

const COLORS = {
  cladding: "#eceae6",
  metal: "#c3c7cd",
  rail: "#1c1c1e",
  glass: "#cfe7ef",
  step: "#9a9ea6",
  comb: "#f2c230",
  pit: "#d9d5cc",
  up: "#ec1d25",
  down: "#303038",
} as const;

type Part = "cladding" | "metal" | "rail" | "glass" | "comb";

/** Collects local-frame boxes for one escalator and moves them into place. */
function partsFor(e: Escalator): Record<Part, THREE.BufferGeometry[]> {
  const parts: Record<Part, THREE.BufferGeometry[]> = { cladding: [], metal: [], rail: [], glass: [], comb: [] };
  const sign = e.direction === "up" ? 1 : -1;
  const exitY = sign * ESCALATOR_RISE;

  const box = (part: Part, w: number, h: number, d: number, x: number, y: number, z: number) => {
    const geometry = new THREE.BoxGeometry(w, h, d);
    geometry.translate(x, y, z);
    parts[part].push(geometry);
  };
  // A box laid along the slope; `lift` raises it off the step line. Rises (or falls) towards local −z.
  const sloped = (part: Part, w: number, h: number, x: number, lift: number) => {
    const geometry = new THREE.BoxGeometry(w, h, SLOPE_LENGTH);
    geometry.rotateX(sign * SLOPE);
    geometry.translate(x, exitY / 2 + lift, 0);
    parts[part].push(geometry);
  };

  sloped("cladding", W + 0.24, 0.34, 0, -0.2);
  for (const side of [-1, 1]) {
    sloped("metal", 0.035, 0.16, side * (W / 2 + 0.02), 0.04);
    sloped("glass", 0.025, 0.46, side * RAIL_X, 0.16 + 0.23);
    sloped("rail", 0.075, 0.055, side * RAIL_X, 0.64);
    // Handrail newels: the rail runs level for a stride at each end, over a glass end panel.
    for (const [z, y] of [
      [ESCALATOR_RUN / 2 + 0.25, 0],
      [-ESCALATOR_RUN / 2 - 0.25, exitY],
    ] as const) {
      box("rail", 0.075, 0.055, 0.5, side * RAIL_X, y + 0.66, z);
      box("glass", 0.025, 0.5, 0.5, side * RAIL_X, y + 0.39, z);
    }
  }

  // Comb plates at both landings, with the yellow safety line where the steps disappear.
  for (const [z, y, dir] of [
    [ESCALATOR_RUN / 2 + 0.25, 0, 1],
    [-ESCALATOR_RUN / 2 - 0.25, exitY, -1],
  ] as const) {
    box("metal", W + 0.12, 0.025, 0.5, 0, y + 0.0125, z);
    box("comb", W, 0.03, 0.05, 0, y + 0.015, z - dir * 0.22);
  }

  if (e.direction === "up") {
    // Upper landing and a slim column, so the ramp doesn't end in mid-air.
    box("cladding", W + 0.5, 0.18, 0.7, 0, ESCALATOR_RISE - 0.09, -ESCALATOR_RUN / 2 - 0.3);
    box("cladding", 0.18, ESCALATOR_RISE - 0.18, 0.18, 0, (ESCALATOR_RISE - 0.18) / 2, -ESCALATOR_RUN / 2 - 0.3);
  } else {
    // Guard glass around the opening, open only where riders step on.
    const length = ESCALATOR_RUN / 2 - VOID_BACK;
    const midZ = (ESCALATOR_RUN / 2 + VOID_BACK) / 2;
    for (const side of [-1, 1]) {
      box("glass", 0.025, 0.5, length, side * VOID_HALF, 0.25, midZ);
      box("rail", 0.05, 0.04, length, side * VOID_HALF, 0.52, midZ);
    }
    box("glass", VOID_HALF * 2, 0.5, 0.025, 0, 0.25, VOID_BACK);
    box("rail", VOID_HALF * 2, 0.04, 0.05, 0, 0.52, VOID_BACK);
  }

  for (const list of Object.values(parts)) {
    for (const geometry of list) {
      geometry.rotateY(e.angle);
      geometry.translate(e.x, 0, e.z);
    }
  }
  return parts;
}

/** Inside of the shaft under a down escalator's opening; only the back faces draw, so it reads as a well. */
function pitFor(e: Escalator): THREE.BufferGeometry {
  const depth = ESCALATOR_RISE + 0.25;
  const geometry = new THREE.BoxGeometry(VOID_HALF * 2 - 0.02, depth, ESCALATOR_RUN / 2 - VOID_BACK - 0.02);
  geometry.translate(0, -depth / 2, (ESCALATOR_RUN / 2 + VOID_BACK) / 2);
  geometry.rotateY(e.angle);
  geometry.translate(e.x, 0, e.z);
  return geometry;
}

function signTexture(text: string, background: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = background;
    ctx.beginPath();
    ctx.roundRect(4, 4, 504, 120, 60);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = `800 58px ${getComputedStyle(document.body).fontFamily}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 256, 68);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/**
 * Every escalator on a level: glass balustrades, black handrails, comb plates, moving steps and a
 * direction sign at each entry. Down escalators sink into an opening WorldScene cuts in the slab.
 */
export function Escalators({ floor }: EscalatorsProps) {
  const escalators = useMemo(() => getEscalators(floor), [floor]);

  const scene = useMemo(() => {
    const collected: Record<Part, THREE.BufferGeometry[]> = { cladding: [], metal: [], rail: [], glass: [], comb: [] };
    const pits: THREE.BufferGeometry[] = [];
    for (const e of escalators) {
      const parts = partsFor(e);
      (Object.keys(parts) as Part[]).forEach((part) => collected[part].push(...parts[part]));
      if (e.direction === "down") pits.push(pitFor(e));
    }
    const merge = (list: THREE.BufferGeometry[]) => {
      if (list.length === 0) return null;
      const merged = mergeGeometries(list, false);
      list.forEach((geometry) => geometry.dispose());
      return merged;
    };
    return {
      cladding: merge(collected.cladding),
      metal: merge(collected.metal),
      rail: merge(collected.rail),
      glass: merge(collected.glass),
      comb: merge(collected.comb),
      pits: merge(pits),
    };
  }, [escalators]);

  const signs = useMemo(() => {
    const above = adjacentFloor(floor, "up");
    const below = adjacentFloor(floor, "down");
    const textures = new Map<string, THREE.CanvasTexture>();
    const list = escalators.map((e) => {
      const target = e.direction === "up" ? above : below;
      const text = `${e.direction === "up" ? "↑" : "↓"} ${target ? floorTitle(target) : ""}`;
      let texture = textures.get(text);
      if (!texture) {
        texture = signTexture(text, e.direction === "up" ? COLORS.up : COLORS.down);
        textures.set(text, texture);
      }
      const [x, z] = escalatorPoint(e, 0, ESCALATOR_RUN / 2 + 0.25);
      return { key: `${e.x},${e.z}`, texture, position: [x, 1.35, z] as [number, number, number] };
    });
    return { list, textures: [...textures.values()] };
  }, [escalators, floor]);

  useEffect(
    () => () => {
      Object.values(scene).forEach((geometry) => geometry?.dispose());
    },
    [scene],
  );
  useEffect(() => () => signs.textures.forEach((texture) => texture.dispose()), [signs]);

  // Moving steps: one instanced mesh for the treads, one for their yellow edge lines.
  const stepsRef = useRef<THREE.InstancedMesh>(null);
  const edgesRef = useRef<THREE.InstancedMesh>(null);
  const phase = useRef(0);
  const scratch = useMemo(
    () => ({ matrix: new THREE.Matrix4(), position: new THREE.Vector3(), rotation: new THREE.Quaternion(), scale: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0) }),
    [],
  );
  const count = escalators.length * STEPS;

  useFrame((_, delta) => {
    const steps = stepsRef.current;
    const edges = edgesRef.current;
    if (!steps || !edges) return;
    phase.current = (phase.current + Math.min(delta, 0.1) * STEP_RATE) % 1;
    const { matrix, position, rotation, scale, up } = scratch;
    const depth = ESCALATOR_RUN / STEPS;
    const height = ESCALATOR_RISE / STEPS;
    escalators.forEach((e, n) => {
      const sign = e.direction === "up" ? 1 : -1;
      rotation.setFromAxisAngle(up, e.angle);
      for (let i = 0; i < STEPS; i++) {
        const t = (i + phase.current) / STEPS;
        const lz = ESCALATOR_RUN / 2 - t * ESCALATOR_RUN - depth / 2;
        const top = sign * ESCALATOR_RISE * t;
        const [x, z] = escalatorPoint(e, 0, lz);
        position.set(x, top - height / 2, z);
        scale.set(W, height, depth);
        steps.setMatrixAt(n * STEPS + i, matrix.compose(position, rotation, scale));
        const [ex, ez] = escalatorPoint(e, 0, lz + depth / 2 - 0.02);
        position.set(ex, top + 0.004, ez);
        scale.set(W, 0.01, 0.035);
        edges.setMatrixAt(n * STEPS + i, matrix.compose(position, rotation, scale));
      }
    });
    steps.instanceMatrix.needsUpdate = true;
    edges.instanceMatrix.needsUpdate = true;
  });

  return (
    <group>
      {scene.cladding && (
        <mesh geometry={scene.cladding}>
          <meshLambertMaterial color={COLORS.cladding} />
        </mesh>
      )}
      {scene.metal && (
        <mesh geometry={scene.metal}>
          <meshLambertMaterial color={COLORS.metal} />
        </mesh>
      )}
      {scene.rail && (
        <mesh geometry={scene.rail}>
          <meshLambertMaterial color={COLORS.rail} />
        </mesh>
      )}
      {scene.comb && (
        <mesh geometry={scene.comb}>
          <meshBasicMaterial color={COLORS.comb} />
        </mesh>
      )}
      {scene.pits && (
        <mesh geometry={scene.pits}>
          <meshLambertMaterial color={COLORS.pit} side={THREE.BackSide} />
        </mesh>
      )}
      {count > 0 && (
        <>
          <instancedMesh key={`steps-${count}`} ref={stepsRef} args={[undefined, undefined, count]} frustumCulled={false}>
            <boxGeometry />
            <meshLambertMaterial color={COLORS.step} />
          </instancedMesh>
          <instancedMesh key={`edges-${count}`} ref={edgesRef} args={[undefined, undefined, count]} frustumCulled={false}>
            <boxGeometry />
            <meshBasicMaterial color={COLORS.comb} />
          </instancedMesh>
        </>
      )}
      {scene.glass && (
        <mesh geometry={scene.glass} renderOrder={1}>
          <meshLambertMaterial color={COLORS.glass} transparent opacity={0.3} depthWrite={false} />
        </mesh>
      )}
      {signs.list.map((sign) => (
        <sprite key={sign.key} position={sign.position} scale={[1.3, 0.325, 1]} renderOrder={3}>
          <spriteMaterial map={sign.texture} transparent depthWrite={false} />
        </sprite>
      ))}
    </group>
  );
}
