"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { planToWorld } from "@/lib/mall";
import type { FloorPlan } from "@/types/mall";

interface UnitLogosProps {
  plan: FloorPlan;
}

// Clearance above the wall tops (see WorldScene wall heights).
const HEIGHT_BY_KIND = { anchor: 0.9, shop: 0.9, kiosk: 0.5 } as const;
const GAP_ABOVE_WALL = 0.35;
const MIN_WIDTH = 1.1;
const MAX_WIDTH = 9;
/** Logos never get taller than this share of their width, so square marks don't tower over wordmarks. */
const MAX_ASPECT = 0.62;
/** "COMING SOON" plate over shops behind hoarding: drawn once, shared by every such unit. */
const SOON_ASPECT = 0.3;

function comingSoonTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = Math.round(512 * SOON_ASPECT);
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const radius = 26;
    ctx.fillStyle = "#ec1d25";
    ctx.beginPath();
    ctx.roundRect(0, 0, canvas.width, canvas.height, radius);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "800 64px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("COMING SOON", canvas.width / 2, canvas.height / 2 + 4);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/**
 * One camera-facing sprite per shop, floating above its unit with the logo from the mall's directory.
 * Shops still being fitted out also get a "COMING SOON" plate. Built imperatively: a level can carry
 * 250+ logos, and sprites with lazily loaded textures keep that cheap without a React component (or a
 * Suspense boundary) per shop.
 */
export function UnitLogos({ plan }: UnitLogosProps) {
  const group = useMemo(() => {
    const root = new THREE.Group();
    root.name = "unit-logos";
    const loader = new THREE.TextureLoader();
    let soonMaterial: THREE.SpriteMaterial | null = null;

    for (const unit of plan.units) {
      if (!unit.logo && !unit.comingSoon) continue;
      const world = unit.polygon.map(planToWorld);
      const xs = world.map((p) => p[0]);
      const zs = world.map((p) => p[1]);
      const span = Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
      const width = THREE.MathUtils.clamp(span * 0.72, MIN_WIDTH, MAX_WIDTH);
      const [x, z] = planToWorld(unit.labelPoint);
      let baseY = HEIGHT_BY_KIND[unit.kind] + GAP_ABOVE_WALL;

      if (unit.comingSoon) {
        soonMaterial ??= new THREE.SpriteMaterial({ map: comingSoonTexture(), transparent: true, depthWrite: false });
        const plate = new THREE.Sprite(soonMaterial);
        const plateWidth = THREE.MathUtils.clamp(width, 2.6, 4.2);
        const plateHeight = plateWidth * SOON_ASPECT;
        plate.position.set(x, baseY + plateHeight / 2, z);
        plate.scale.set(plateWidth, plateHeight, 1);
        plate.renderOrder = 2;
        root.add(plate);
        baseY += plateHeight + 0.15;
      }
      if (!unit.logo) continue;

      const height = width * Math.min(unit.logo.h / unit.logo.w, MAX_ASPECT);
      const material = new THREE.SpriteMaterial({ transparent: true, depthWrite: false, opacity: 0 });
      loader.load(unit.logo.src, (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = 4;
        material.map = texture;
        material.opacity = 1;
        material.needsUpdate = true;
      });

      const sprite = new THREE.Sprite(material);
      sprite.position.set(x, baseY + height / 2, z);
      sprite.scale.set(width, height, 1);
      sprite.renderOrder = 2;
      root.add(sprite);
    }
    return root;
  }, [plan]);

  useEffect(
    () => () => {
      const materials = new Set<THREE.SpriteMaterial>();
      group.traverse((object) => {
        if (object instanceof THREE.Sprite) materials.add(object.material);
      });
      materials.forEach((material) => {
        material.map?.dispose();
        material.dispose();
      });
    },
    [group],
  );

  return <primitive object={group} />;
}
