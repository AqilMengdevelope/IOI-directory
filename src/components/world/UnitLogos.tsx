"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { planToWorld } from "@/lib/mall";
import type { FloorPlan } from "@/types/mall";

interface UnitLogosProps {
  plan: FloorPlan;
}

// Clearance above the wall tops (see WorldScene wall heights).
const HEIGHT_BY_KIND = { anchor: 1.6, shop: 0.9, kiosk: 0.5 } as const;
const GAP_ABOVE_WALL = 0.35;
const MIN_WIDTH = 1.1;
const MAX_WIDTH = 9;
/** Logos never get taller than this share of their width, so square marks don't tower over wordmarks. */
const MAX_ASPECT = 0.62;

/**
 * One camera-facing sprite per shop, floating above its unit with the logo from the mall's directory.
 * Built imperatively: a level can carry 250+ logos, and sprites with lazily loaded textures keep that
 * cheap without a React component (or a Suspense boundary) per shop.
 */
export function UnitLogos({ plan }: UnitLogosProps) {
  const group = useMemo(() => {
    const root = new THREE.Group();
    root.name = "unit-logos";
    const loader = new THREE.TextureLoader();

    for (const unit of plan.units) {
      if (!unit.logo) continue;
      const world = unit.polygon.map(planToWorld);
      const xs = world.map((p) => p[0]);
      const zs = world.map((p) => p[1]);
      const span = Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));

      const aspect = Math.min(unit.logo.h / unit.logo.w, MAX_ASPECT);
      const width = THREE.MathUtils.clamp(span * 0.72, MIN_WIDTH, MAX_WIDTH);
      const height = width * aspect;

      const material = new THREE.SpriteMaterial({ transparent: true, depthWrite: false, opacity: 0 });
      loader.load(unit.logo.src, (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = 4;
        material.map = texture;
        material.opacity = 1;
        material.needsUpdate = true;
      });

      const sprite = new THREE.Sprite(material);
      const [x, z] = planToWorld(unit.labelPoint);
      sprite.position.set(x, HEIGHT_BY_KIND[unit.kind] + GAP_ABOVE_WALL + height / 2, z);
      sprite.scale.set(width, height, 1);
      sprite.renderOrder = 2;
      root.add(sprite);
    }
    return root;
  }, [plan]);

  useEffect(
    () => () => {
      group.traverse((object) => {
        if (object instanceof THREE.Sprite) {
          object.material.map?.dispose();
          object.material.dispose();
        }
      });
    },
    [group],
  );

  return <primitive object={group} />;
}
