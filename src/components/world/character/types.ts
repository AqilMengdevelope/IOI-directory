import type { Object3D } from "three";

/** Target standing height of either character, in world units. */
export const CHARACTER_HEIGHT = 1.15;

/** Pivot nodes (shoulders / hips) the rig swings while walking. */
export interface CharacterLimbs {
  leftArm: Object3D | null;
  rightArm: Object3D | null;
  leftLeg: Object3D | null;
  rightLeg: Object3D | null;
}

export interface CharacterProps {
  /** Called with the limb pivots once mounted, and with null on unmount. */
  onLimbs: (limbs: CharacterLimbs | null) => void;
}
