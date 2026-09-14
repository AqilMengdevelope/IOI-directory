"use client";

import { useGLTF } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import { Box3 } from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { CHARACTER_HEIGHT, type CharacterProps } from "./types";

const GIRL_URL = "/models/jalan-girl.glb";

if (typeof window !== "undefined") {
  useGLTF.preload(GIRL_URL);
}

/** The site's girl model: a rigid, unskinned node hierarchy with shoulder/hip pivots and no clips. */
export function FemaleCharacter({ onLimbs }: CharacterProps) {
  const { scene } = useGLTF(GIRL_URL);

  const model = useMemo(() => {
    const root = cloneSkinned(scene);
    root.updateMatrixWorld(true);
    const box = new Box3().setFromObject(root);
    const height = box.max.y - box.min.y;
    const scale = height > 0 ? CHARACTER_HEIGHT / height : 1;
    return { root, scale, offsetY: -box.min.y * scale };
  }, [scene]);

  useEffect(() => {
    const { root } = model;
    onLimbs({
      leftArm: root.getObjectByName("girl_left_arm") ?? null,
      rightArm: root.getObjectByName("girl_right_arm") ?? null,
      leftLeg: root.getObjectByName("girl_left_leg") ?? null,
      rightLeg: root.getObjectByName("girl_right_leg") ?? null,
    });
    return () => onLimbs(null);
  }, [model, onLimbs]);

  return (
    <group position={[0, model.offsetY, 0]} scale={model.scale}>
      <primitive object={model.root} />
    </group>
  );
}
