/** A 2D point in floorplan pixel space: [x, y]. */
export type PlanPoint = [number, number];

/** IOI City Mall levels. LG and G–L2 span both wings; 3 and 4 exist in the East wing only. */
export type FloorId = "LG" | "G" | "1" | "2" | "3" | "4";

export type FrontFacing = "left" | "right" | "up" | "down";

export type UnitKind = "anchor" | "shop" | "kiosk";

export interface FloorUnit {
  id: string;
  meshName: string;
  unitNumber: string;
  shortNumber: string;
  polygon: PlanPoint[];
  labelPoint: PlanPoint;
  zone: string;
  frontFacing: FrontFacing | string;
  numberingNote: string | null;
  kind: UnitKind;
  /** Name printed on the mall's floor map (anchors only); shops come from the directory. */
  name: string | null;
  /** Fill colour from the mall's own map (CSS hex), when known. */
  color?: string;
}

export type AmenityKind = "escalator" | "lift" | "toilet" | "info" | "entrance";

export interface Amenity {
  kind: AmenityKind;
  at: PlanPoint;
  label: string | null;
}

export interface FloorPlan {
  level: FloorId;
  floorLabel: string;
  revision: string;
  footprint: PlanPoint[];
  units: FloorUnit[];
  /** Centreline of the main walkway, west to east. */
  corridor: PlanPoint[];
  amenities: Amenity[];
}

export interface FloorMeta {
  id: FloorId;
  name: string;
  blurb: string;
  available: boolean;
}

export interface TenantPhoto {
  src: string;
  caption: string;
  sourceUrl: string;
  credit: string;
  width: number;
  height: number;
}

export interface TenantReference {
  name: string;
  note: string;
  photos: TenantPhoto[];
}

/** One entry in the "Around this floor" directory. */
export interface DirectorySpace {
  unitId: string;
  unitNumber: string;
  name: string;
  category: string;
  description: string | null;
  /** Key into the tenant references map, when real photos exist. */
  tenantKey: string | null;
  /** First reference photo, or null to render generated placeholder art. */
  thumb: string | null;
}

export interface TenantStory {
  id: string;
  kind: "image" | "video";
  src: string;
  caption: string;
  sourceUrl: string;
  postedAt: string;
  credit: string;
  ownAccount: boolean;
  width: number;
  height: number;
  durationMs: number;
}

export interface TenantStoryFile {
  tenantId: string;
  name: string;
  collectedAt: string;
  stories: TenantStory[];
}

export type CameraMode = "follow" | "eye" | "overview";
export type MusicMood = "hiphop" | "chill" | "rock";
export type CharacterGender = "male" | "female";
