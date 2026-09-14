/** A 2D point in floorplan pixel space: [x, y]. */
export type PlanPoint = [number, number];

export type FloorId = "G" | "1" | "2" | "3" | "3A" | "5" | "6" | "7" | "8" | "9";

export type FrontFacing = "left" | "right" | "up" | "down";

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
}

export interface FloorPlan {
  level: FloorId;
  floorLabel: string;
  revision: string;
  footprint: PlanPoint[];
  units: FloorUnit[];
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
