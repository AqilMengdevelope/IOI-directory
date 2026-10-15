import mallInfoJson from "@/data/mall-info.json";
import mallUpdatesJson from "@/data/mall-updates.json";
import { FLOOR_RAIL_ORDER, getDirectory } from "@/lib/mall";
import type { DirectorySpace, FloorId, MediaImage } from "@/types/mall";

// Everything here comes from the mall's own directory (scripts/ioi-sync-abuzz.mjs refreshes it daily).
// Times are judged on the mall's clock, Malaysia time, whatever the visitor's time zone.

const TIME_ZONE = "Asia/Kuala_Lumpur";
const DAY_MS = 86_400_000;
/** How long a new or newly opened shop counts as "new". */
export const NEW_FOR_DAYS = 30;

export interface ShopRef {
  floor: FloorId;
  unitId: string;
}

export interface MallOffer {
  id: string;
  title: string;
  description: string | null;
  /** ISO time with the mall's +08:00 offset, or null when the offer has no start. */
  startsAt: string | null;
  endsAt: string | null;
  image: MediaImage | null;
  shops: ShopRef[];
}

export interface MallAnnouncement {
  id: string;
  title: string;
  description: string | null;
  link: string | null;
  image: MediaImage | null;
}

type Weekday = "sunday" | "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday";
type DayHours = { from?: string; to?: string };

interface MallInfo {
  version: number;
  releaseDate: string | null;
  hours: Partial<Record<Weekday, DayHours>> | null;
  offers: MallOffer[];
  announcements: MallAnnouncement[];
}

export type ChangeType = "new" | "opened" | "coming-soon" | "renamed" | "moved" | "closed";

export interface MallChange {
  type: ChangeType;
  name: string;
  unitNumber: string | null;
  floor: FloorId | null;
  unitId: string | null;
  previousName?: string;
  previousUnitNumber?: string;
}

interface MallUpdate {
  version: number;
  previousVersion: number;
  releaseDate: string;
  detectedAt: string;
  changes: MallChange[];
}

const mallInfo = mallInfoJson as unknown as MallInfo;
const updates = (mallUpdatesJson as unknown as { updates: MallUpdate[] }).updates;

export const DIRECTORY_VERSION = mallInfo.version;
export const DIRECTORY_RELEASED = mallInfo.releaseDate;
export const announcements = mallInfo.announcements;

// ---------------------------------------------------------------------------
// Opening hours
// ---------------------------------------------------------------------------

const WEEKDAYS: Weekday[] = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const clockFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  weekday: "long",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Day of the week and minutes since midnight on the mall's clock. */
function mallClock(now: number): { day: number; minutes: number } {
  const parts = Object.fromEntries(clockFormat.formatToParts(new Date(now)).map((part) => [part.type, part.value]));
  return {
    day: WEEKDAYS.indexOf(String(parts.weekday).toLowerCase() as Weekday),
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

const toMinutes = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + (m || 0);
};

/** "22:00" → "10 PM", "09:30" → "9:30 AM". */
export function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const suffix = h >= 12 && h < 24 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return m ? `${hour}:${String(m).padStart(2, "0")} ${suffix}` : `${hour} ${suffix}`;
}

export interface OpenStatus {
  open: boolean;
  /** e.g. "Open now · until 10 PM", "Closed · opens 10 AM". */
  label: string;
  /** The usual daily hours, e.g. "10 AM – 10 PM", when every day is the same. */
  usual: string | null;
}

/** Whether the mall is open at `now`, from its published weekly hours. Null when it publishes none. */
export function mallOpenStatus(now: number): OpenStatus | null {
  const hours = mallInfo.hours;
  if (!hours) return null;
  const day = (index: number) => hours[WEEKDAYS[(index + 7) % 7]];
  const { day: today, minutes } = mallClock(now);
  const todays = day(today);
  const spans = WEEKDAYS.map((name) => `${hours[name]?.from}-${hours[name]?.to}`);
  const usual = new Set(spans).size === 1 && todays?.from && todays.to ? `${formatTime(todays.from)} – ${formatTime(todays.to)}` : null;

  if (todays?.from && todays.to && minutes >= toMinutes(todays.from) && minutes < toMinutes(todays.to)) {
    return { open: true, label: `Open now · until ${formatTime(todays.to)}`, usual };
  }
  if (todays?.from && minutes < toMinutes(todays.from)) {
    return { open: false, label: `Closed · opens ${formatTime(todays.from)}`, usual };
  }
  for (let ahead = 1; ahead <= 7; ahead++) {
    const next = day(today + ahead);
    if (next?.from) {
      const when = ahead === 1 ? "tomorrow" : WEEKDAYS[(today + ahead) % 7].replace(/^./, (c) => c.toUpperCase());
      return { open: false, label: `Closed · opens ${formatTime(next.from)} ${when}`, usual };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Offers
// ---------------------------------------------------------------------------

/** Offers running at `now`, ending soonest first. */
export function liveOffers(now: number): MallOffer[] {
  return mallInfo.offers
    .filter((offer) => (!offer.startsAt || Date.parse(offer.startsAt) <= now) && (!offer.endsAt || Date.parse(offer.endsAt) > now))
    .sort((a, b) => (a.endsAt ? Date.parse(a.endsAt) : Infinity) - (b.endsAt ? Date.parse(b.endsAt) : Infinity));
}

export function offersForUnit(unitId: string, now: number): MallOffer[] {
  return liveOffers(now).filter((offer) => offer.shops.some((shop) => shop.unitId === unitId));
}

const dayFormat = new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, day: "numeric", month: "short" });

/** "Until 8 Nov", or "Ends today". */
export function offerEnds(offer: MallOffer, now: number): string | null {
  if (!offer.endsAt) return null;
  const end = Date.parse(offer.endsAt);
  if (dayFormat.format(end) === dayFormat.format(now)) return "Ends today";
  return `Until ${dayFormat.format(end)}`;
}

/** "14 Oct": a short date on the mall's calendar. */
export function shortDate(iso: string): string {
  return dayFormat.format(Date.parse(iso));
}

// ---------------------------------------------------------------------------
// What's new
// ---------------------------------------------------------------------------

export interface RecentChange extends MallChange {
  detectedAt: string;
}

/** Changes the daily sync picked up in the last `days`, newest first, one per shop and kind. */
export function recentChanges(now: number, days = NEW_FOR_DAYS): RecentChange[] {
  const seen = new Set<string>();
  const result: RecentChange[] = [];
  for (const update of updates) {
    if (now - Date.parse(update.detectedAt) > days * DAY_MS) continue;
    for (const change of update.changes) {
      const key = `${change.type}|${change.name.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({ ...change, detectedAt: update.detectedAt });
    }
  }
  return result;
}

/** Units that opened (or joined the directory) in the last `NEW_FOR_DAYS`. */
export function newUnitIds(now: number): Set<string> {
  return new Set(
    recentChanges(now)
      .filter((change) => (change.type === "new" || change.type === "opened") && change.unitId)
      .map((change) => change.unitId as string),
  );
}

export interface PlacedSpace {
  space: DirectorySpace;
  floor: FloorId;
}

/** Every unit the mall lists as coming soon, named shops first. */
export const comingSoonSpaces: PlacedSpace[] = FLOOR_RAIL_ORDER.flatMap((floor) =>
  getDirectory(floor)
    .filter((space) => space.comingSoon)
    .map((space) => ({ space, floor })),
).sort((a, b) => Number(a.space.name === "New shop") - Number(b.space.name === "New shop") || a.space.name.localeCompare(b.space.name));

/** Directory entry for a unit on a floor, if it's still listed. */
export function findSpace(floor: FloorId, unitId: string): DirectorySpace | null {
  return getDirectory(floor).find((space) => space.unitId === unitId) ?? null;
}
