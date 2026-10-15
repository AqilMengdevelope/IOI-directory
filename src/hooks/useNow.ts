import { useSyncExternalStore } from "react";

const MINUTE = 60_000;

function subscribe(onChange: () => void) {
  const timer = window.setInterval(onChange, 15_000);
  return () => window.clearInterval(timer);
}

/** The current minute, kept stable within it so renders that read it agree. */
const currentMinute = () => Math.floor(Date.now() / MINUTE) * MINUTE;

/**
 * The time, to the minute, ticking while mounted. Null during server rendering and hydration, so
 * time-dependent text (opening status, live offers) never mismatches the server's HTML.
 */
export function useNow(): number | null {
  return useSyncExternalStore(subscribe, currentMinute, () => null);
}
