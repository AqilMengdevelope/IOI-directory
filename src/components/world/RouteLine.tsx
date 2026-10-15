"use client";

import { useEffect, useMemo, useRef } from "react";
import type { RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

type XZ = [number, number];

/** Shared by PlayerRig (which writes it) and RouteLine (which draws it each frame). */
export interface RouteState {
  points: XZ[] | null;
  /** Bumped whenever `points` changes, so the geometry is rebuilt only then. */
  version: number;
  /** Distance already walked along `points`; the line is trimmed behind it. */
  travelled: number;
}

const Y = 0.075;
const WIDTH = 0.2;
const CHEVRON_GAP = 0.9;
const CHEVRON_SPEED = 1.4;
const MAX_CHEVRONS = 400;
const COLOR = "#ec1d25";
/** Camera height at which the line is drawn at its base size; higher (zoomed out) draws it thicker. */
const BASE_CAMERA_HEIGHT = 18;
const MAX_THICKEN = 4;

function chevronGeometry(): THREE.BufferGeometry {
  // A flat arrowhead pointing along +z, laid on the floor.
  const shape = new THREE.Shape();
  shape.moveTo(-0.13, -0.07);
  shape.lineTo(0, 0.07);
  shape.lineTo(0.13, -0.07);
  shape.lineTo(0.13, -0.01);
  shape.lineTo(0, 0.13);
  shape.lineTo(-0.13, -0.01);
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape);
  // Shape +y → world +z, lying flat (drawn double-sided).
  geometry.rotateX(Math.PI / 2);
  return geometry;
}

/** The walking route on the floor: a red ribbon, white chevrons moving towards the goal, a pulsing ring. */
export function RouteLine({ routeRef }: { routeRef: RefObject<RouteState> }) {
  const ribbonRef = useRef<THREE.Mesh>(null);
  const chevronsRef = useRef<THREE.InstancedMesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const built = useRef({ version: -1, cumulative: [] as number[], points: [] as XZ[] });
  const phase = useRef(0);

  const ribbon = useMemo(() => new THREE.BufferGeometry(), []);
  const chevron = useMemo(() => chevronGeometry(), []);
  const scratch = useMemo(() => ({ matrix: new THREE.Matrix4(), quaternion: new THREE.Quaternion(), position: new THREE.Vector3(), scale: new THREE.Vector3(1, 1, 1), up: new THREE.Vector3(0, 1, 0) }), []);

  useEffect(
    () => () => {
      ribbon.dispose();
      chevron.dispose();
    },
    [ribbon, chevron],
  );

  useFrame((state, delta) => {
    const route = routeRef.current;
    const ribbonMesh = ribbonRef.current;
    const chevrons = chevronsRef.current;
    const ring = ringRef.current;
    if (!route || !ribbonMesh || !chevrons || !ring) return;
    const points = route.points;
    const visible = !!points && points.length > 1;
    ribbonMesh.visible = visible;
    chevrons.visible = visible;
    ring.visible = visible;
    if (!points || !visible) return;

    // Rebuild the ribbon (one quad per segment) only when the route changes.
    if (built.current.version !== route.version) {
      const cumulative = [0];
      const positions = new Float32Array((points.length - 1) * 18);
      for (let i = 0; i < points.length - 1; i++) {
        cumulative.push(cumulative[i] + Math.hypot(points[i + 1][0] - points[i][0], points[i + 1][1] - points[i][1]));
      }
      ribbon.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      built.current = { version: route.version, cumulative, points };
    }
    const { cumulative } = built.current;
    // Thicken with camera height so the route stays legible zoomed out, without swamping close views.
    const thicken = THREE.MathUtils.clamp(state.camera.position.y / BASE_CAMERA_HEIGHT, 1, MAX_THICKEN);
    const half = (WIDTH / 2) * thicken;
    const total = cumulative[cumulative.length - 1];
    const travelled = Math.min(route.travelled, total);

    // Ribbon quads from the walked point onwards.
    const positions = ribbon.getAttribute("position") as THREE.BufferAttribute;
    const array = positions.array as Float32Array;
    let first = 0;
    while (first < points.length - 2 && cumulative[first + 1] <= travelled) first++;
    for (let i = 0; i < points.length - 1; i++) {
      let [ax, az] = points[i];
      const [bx, bz] = points[i + 1];
      const length = cumulative[i + 1] - cumulative[i] || 1e-6;
      if (i === first) {
        const t = Math.max(0, Math.min(1, (travelled - cumulative[i]) / length));
        ax += (bx - ax) * t;
        az += (bz - az) * t;
      }
      const nx = (-(bz - points[i][1]) / length) * half;
      const nz = ((bx - points[i][0]) / length) * half;
      // Each quad overshoots its end by half a width so corners close.
      const ex = bx + ((bx - points[i][0]) / length) * half;
      const ez = bz + ((bz - points[i][1]) / length) * half;
      const quad = [ax + nx, az + nz, ax - nx, az - nz, ex + nx, ez + nz, ex + nx, ez + nz, ax - nx, az - nz, ex - nx, ez - nz];
      for (let v = 0; v < 6; v++) {
        array[i * 18 + v * 3] = quad[v * 2];
        array[i * 18 + v * 3 + 1] = Y;
        array[i * 18 + v * 3 + 2] = quad[v * 2 + 1];
      }
    }
    positions.needsUpdate = true;
    ribbon.setDrawRange(first * 6, (points.length - 1 - first) * 6);
    ribbon.computeBoundingSphere();

    // Chevrons flowing towards the goal, only ahead of the character.
    phase.current = (phase.current + delta * CHEVRON_SPEED) % CHEVRON_GAP;
    const { matrix, quaternion, position, scale, up } = scratch;
    scale.setScalar(thicken);
    const gap = CHEVRON_GAP * thicken;
    let count = 0;
    let segment = 0;
    // Chevrons sit at phase + k·gap, so advancing the phase slides them all forward seamlessly.
    const offset = phase.current * thicken;
    const firstChevron = Math.ceil((travelled - offset) / gap) * gap + offset;
    for (let d = firstChevron; d < total - 0.3 && count < MAX_CHEVRONS; d += gap) {
      while (segment < points.length - 2 && cumulative[segment + 1] < d) segment++;
      const [ax, az] = points[segment];
      const [bx, bz] = points[segment + 1];
      const length = cumulative[segment + 1] - cumulative[segment] || 1e-6;
      const t = (d - cumulative[segment]) / length;
      position.set(ax + (bx - ax) * t, Y + 0.004, az + (bz - az) * t);
      quaternion.setFromAxisAngle(up, Math.atan2(bx - ax, bz - az));
      chevrons.setMatrixAt(count++, matrix.compose(position, quaternion, scale));
    }
    chevrons.count = count;
    chevrons.instanceMatrix.needsUpdate = true;

    const [gx, gz] = points[points.length - 1];
    const pulse = (1 + Math.sin(state.clock.elapsedTime * 4) * 0.12) * thicken;
    ring.position.set(gx, Y + 0.002, gz);
    ring.scale.set(pulse, pulse, pulse);
  });

  return (
    <group>
      <mesh ref={ribbonRef} geometry={ribbon} renderOrder={2} frustumCulled={false}>
        <meshBasicMaterial color={COLOR} transparent opacity={0.85} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <instancedMesh ref={chevronsRef} args={[chevron, undefined, MAX_CHEVRONS]} renderOrder={3} frustumCulled={false}>
        <meshBasicMaterial color="#ffffff" depthWrite={false} side={THREE.DoubleSide} />
      </instancedMesh>
      <mesh ref={ringRef} rotation-x={-Math.PI / 2} renderOrder={3}>
        <ringGeometry args={[0.32, 0.46, 40]} />
        <meshBasicMaterial color={COLOR} transparent opacity={0.9} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}
