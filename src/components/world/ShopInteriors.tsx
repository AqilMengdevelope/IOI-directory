"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { DirectorySpace, FloorPlan } from "@/types/mall";
import { buildInteriors, type PrimKind } from "./interiors";

interface ShopInteriorsProps {
  plan: FloorPlan;
  directory: DirectorySpace[];
}

/** Side of the square world-space chunks the furniture is split into, so off-screen chunks are culled. */
const CHUNK_SIZE = 40;
/** Chunks further than this from the camera are hidden; zoomed that far out, furniture is sub-pixel. */
const DRAW_DISTANCE = 190;
const KINDS: PrimKind[] = ["box", "cylinder", "disc", "glass", "foliage"];

/** A unit cylinder lying on its side, axis along x (wheels). */
function discGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 12);
  geometry.rotateZ(Math.PI / 2);
  return geometry;
}

/** A unit box without its bottom face, which always sits on the floor and is never seen. */
function openBottomBox(): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const index = geometry.getIndex();
  if (!index) return geometry;
  // BoxGeometry faces run +x, −x, +y, −y, +z, −z, six indices each; drop −y.
  const kept = Array.from(index.array).filter((_, i) => i < 18 || i >= 24);
  geometry.setIndex(kept);
  geometry.clearGroups();
  return geometry;
}

/**
 * Tables, chairs, shelves and racks inside every shop. Built imperatively like UnitLogos: a level
 * carries tens of thousands of pieces, drawn as one instanced mesh per primitive per chunk.
 */
export function ShopInteriors({ plan, directory }: ShopInteriorsProps) {
  const group = useMemo(() => {
    const root = new THREE.Group();
    root.name = "shop-interiors";
    const pieces = buildInteriors(plan, directory);

    const geometries: Record<PrimKind, THREE.BufferGeometry> = {
      box: openBottomBox(),
      cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 10),
      disc: discGeometry(),
      glass: new THREE.BoxGeometry(1, 1, 1),
      foliage: new THREE.IcosahedronGeometry(0.5, 0),
    };
    const materials: Record<PrimKind, THREE.Material> = {
      box: new THREE.MeshLambertMaterial(),
      cylinder: new THREE.MeshLambertMaterial(),
      disc: new THREE.MeshLambertMaterial(),
      glass: new THREE.MeshLambertMaterial({ transparent: true, opacity: 0.32, depthWrite: false }),
      foliage: new THREE.MeshLambertMaterial({ flatShading: true }),
    };
    root.userData.dispose = () => {
      KINDS.forEach((kind) => {
        geometries[kind].dispose();
        materials[kind].dispose();
      });
    };

    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const colors = new Map<string, THREE.Color>();

    for (const kind of KINDS) {
      const chunks = new Map<string, typeof pieces.box>();
      for (const piece of pieces[kind]) {
        const key = `${Math.floor(piece.x / CHUNK_SIZE)},${Math.floor(piece.z / CHUNK_SIZE)}`;
        const chunk = chunks.get(key);
        if (chunk) chunk.push(piece);
        else chunks.set(key, [piece]);
      }
      for (const chunk of chunks.values()) {
        const mesh = new THREE.InstancedMesh(geometries[kind], materials[kind], chunk.length);
        chunk.forEach((piece, i) => {
          position.set(piece.x, piece.y, piece.z);
          rotation.setFromAxisAngle(up, piece.rot);
          scale.set(piece.sx, piece.sy, piece.sz);
          mesh.setMatrixAt(i, matrix.compose(position, rotation, scale));
          let color = colors.get(piece.color);
          if (!color) {
            color = new THREE.Color(piece.color);
            colors.set(piece.color, color);
          }
          mesh.setColorAt(i, color);
        });
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.computeBoundingSphere();
        mesh.matrixAutoUpdate = false;
        // Glass draws after the opaque furniture it encloses.
        if (kind === "glass") mesh.renderOrder = 1;
        root.add(mesh);
      }
    }
    return root;
  }, [plan, directory]);

  const groupRef = useRef<THREE.Group>(null);
  useFrame(({ camera }) => {
    for (const mesh of groupRef.current?.children ?? []) {
      const sphere = (mesh as THREE.InstancedMesh).boundingSphere;
      if (sphere) mesh.visible = camera.position.distanceTo(sphere.center) - sphere.radius < DRAW_DISTANCE;
    }
  });

  useEffect(
    () => () => {
      group.traverse((object) => {
        if (object instanceof THREE.InstancedMesh) object.dispose();
      });
      (group.userData.dispose as (() => void) | undefined)?.();
    },
    [group],
  );

  return <primitive ref={groupRef} object={group} />;
}
