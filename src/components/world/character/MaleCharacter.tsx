"use client";

import { useEffect, useRef } from "react";
import type { Group } from "three";
import type { CharacterProps } from "./types";

const SKIN = "#e9b78f";
const CAP = "#252524";
const HOODIE = "#303038";
const JEANS = "#4d537e";
const SHOES = "#f5f5f2";

/** Primitive chibi (black cap + hoodie, indigo jeans, white shoes), ~1.15 tall, facing +z. */
export function MaleCharacter({ onLimbs }: CharacterProps) {
  const leftArm = useRef<Group>(null);
  const rightArm = useRef<Group>(null);
  const leftLeg = useRef<Group>(null);
  const rightLeg = useRef<Group>(null);

  useEffect(() => {
    onLimbs({
      leftArm: leftArm.current,
      rightArm: rightArm.current,
      leftLeg: leftLeg.current,
      rightLeg: rightLeg.current,
    });
    return () => onLimbs(null);
  }, [onLimbs]);

  return (
    <group>
      {/* Legs pivot at the hips */}
      {([-1, 1] as const).map((side) => (
        <group key={`leg${side}`} ref={side < 0 ? leftLeg : rightLeg} position={[side * 0.1, 0.38, 0]}>
          <mesh position={[0, -0.16, 0]}>
            <cylinderGeometry args={[0.075, 0.07, 0.32, 12]} />
            <meshLambertMaterial color={JEANS} />
          </mesh>
          <mesh position={[0, -0.34, 0.03]}>
            <boxGeometry args={[0.14, 0.08, 0.22]} />
            <meshLambertMaterial color={SHOES} />
          </mesh>
        </group>
      ))}

      {/* Hoodie body */}
      <mesh position={[0, 0.6, 0]}>
        <capsuleGeometry args={[0.21, 0.16, 6, 16]} />
        <meshLambertMaterial color={HOODIE} />
      </mesh>

      {/* Arms pivot at the shoulders */}
      {([-1, 1] as const).map((side) => (
        <group key={`arm${side}`} ref={side < 0 ? leftArm : rightArm} position={[side * 0.25, 0.8, 0]}>
          <mesh position={[0, -0.14, 0]}>
            <capsuleGeometry args={[0.06, 0.18, 4, 10]} />
            <meshLambertMaterial color={HOODIE} />
          </mesh>
          <mesh position={[0, -0.3, 0]}>
            <sphereGeometry args={[0.055, 12, 10]} />
            <meshLambertMaterial color={SKIN} />
          </mesh>
        </group>
      ))}

      {/* Head */}
      <mesh position={[0, 0.84, 0]}>
        <sphereGeometry args={[0.28, 24, 18]} />
        <meshLambertMaterial color={SKIN} />
      </mesh>
      {([-1, 1] as const).map((side) => (
        <mesh key={`eye${side}`} position={[side * 0.09, 0.79, 0.265]}>
          <sphereGeometry args={[0.028, 10, 8]} />
          <meshLambertMaterial color={CAP} />
        </mesh>
      ))}

      {/* Cap: dome + flat brim */}
      <mesh position={[0, 0.87, 0]}>
        <sphereGeometry args={[0.295, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshLambertMaterial color={CAP} />
      </mesh>
      <mesh position={[0, 0.88, 0.24]} scale={[1, 1, 0.8]}>
        <cylinderGeometry args={[0.2, 0.2, 0.03, 24]} />
        <meshLambertMaterial color={CAP} />
      </mesh>
    </group>
  );
}
