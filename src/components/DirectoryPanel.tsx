"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/icons";
import { SpaceArt } from "@/components/SpaceArt";
import { useNow } from "@/hooks/useNow";
import { FLOOR_RAIL_ORDER, floorTitle, getDirectory } from "@/lib/mall";
import { liveOffers, newUnitIds } from "@/lib/whats-on";
import type { DirectorySpace, FloorId } from "@/types/mall";

interface DirectoryPanelProps {
  floor: FloorId;
  /** Go to a shop: walks there, riding to its level first when it's on another floor. */
  onVisit: (floor: FloorId, unitId: string) => void;
  onClose: () => void;
}

interface Entry {
  space: DirectorySpace;
  floor: FloorId;
}

type Scope = "floor" | "mall";

/** Shopper-facing groups for the directory's many raw categories, in display order. */
const GROUPS: { key: string; label: string; pattern: RegExp }[] = [
  { key: "food", label: "Food & drink", pattern: /caf|restaurant|food|dessert|bakery|snack/i },
  { key: "fashion", label: "Fashion", pattern: /fashion|wear|undergarment|kids|maternity|bag|leather|accessor/i },
  { key: "footwear", label: "Footwear", pattern: /footwear/i },
  { key: "jewellery", label: "Jewellery, watches & optical", pattern: /jewel|timepiece|optical/i },
  { key: "beauty", label: "Beauty & wellness", pattern: /beauty|skincare|perfum|salon|haircare|personal care|pharmacy|wellness|health|fitness/i },
  { key: "tech", label: "Tech & gadgets", pattern: /digital|technolog|mobile/i },
  { key: "home", label: "Home, gifts & books", pattern: /home|living|gift|souvenir|book/i },
  { key: "fun", label: "Toys, hobbies & fun", pattern: /toy|hobbies|game|pet|entertainment|edutainment/i },
  { key: "stores", label: "Department stores & groceries", pattern: /department|grocery|supemarket|supermarket|convenience/i },
  { key: "services", label: "Services", pattern: /clinic|medical|dental|bank|financial|services|automotive|money/i },
];
const OTHER = { key: "other", label: "Other shops" };

function groupFor(category: string) {
  return GROUPS.find((group) => group.pattern.test(category)) ?? OTHER;
}

const allEntries: Entry[] = FLOOR_RAIL_ORDER.flatMap((floor) => getDirectory(floor).map((space) => ({ space, floor })));

/** Entries matching a lower-cased search `needle` (all of them when it's empty). */
function search(needle: string): Entry[] {
  if (!needle) return allEntries;
  return allEntries.filter((entry) => `${entry.space.name} ${entry.space.unitNumber} ${entry.space.category}`.toLowerCase().includes(needle));
}

export function DirectoryPanel({ floor, onVisit, onClose }: DirectoryPanelProps) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<Scope>("floor");
  // Browsing starts collapsed; a search starts with every matching group open. Each keeps its own toggles.
  const [browseOpen, setBrowseOpen] = useState<Set<string>>(() => new Set());
  const [searchClosed, setSearchClosed] = useState<Set<string>>(() => new Set());

  const now = useNow();
  const fresh = useMemo(() => (now === null ? new Set<string>() : newUnitIds(now)), [now]);
  const withOffers = useMemo(
    () => new Set(now === null ? [] : liveOffers(now).flatMap((offer) => offer.shops.map((shop) => shop.unitId))),
    [now],
  );

  const needle = query.trim().toLowerCase();
  const searching = needle.length > 0;
  const found = useMemo(() => search(needle), [needle]);
  const floorCount = found.filter((entry) => entry.floor === floor).length;
  const mallCount = found.length;

  const groups = useMemo(() => {
    const byKey = new Map<string, { key: string; label: string; entries: Entry[] }>();
    for (const entry of found) {
      if (scope === "floor" && entry.floor !== floor) continue;
      const group = groupFor(entry.space.category);
      const bucket = byKey.get(group.key) ?? { key: group.key, label: group.label, entries: [] };
      bucket.entries.push(entry);
      byKey.set(group.key, bucket);
    }
    const order = [...GROUPS.map((group) => group.key), OTHER.key];
    return [...byKey.values()]
      .sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key))
      .map((group) => ({ ...group, entries: group.entries.sort((a, b) => a.space.name.localeCompare(b.space.name)) }));
  }, [found, scope, floor]);

  const isOpen = (key: string) => (searching ? !searchClosed.has(key) : browseOpen.has(key));
  const toggle = (key: string) => {
    const flip = (set: Set<string>) => {
      const next = new Set(set);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    };
    if (searching) setSearchClosed(flip);
    else setBrowseOpen(flip);
  };
  const allOpen = groups.length > 0 && groups.every((group) => isOpen(group.key));
  const setAll = (open: boolean) => {
    if (searching) setSearchClosed(open ? new Set() : new Set(groups.map((group) => group.key)));
    else setBrowseOpen(open ? new Set(groups.map((group) => group.key)) : new Set());
  };

  const shown = scope === "floor" ? floorCount : mallCount;

  return (
    <aside className="side-panel directory-panel" aria-label="Find a shop">
      <div className="panel-top">
        <span className="eyebrow">
          {scope === "floor" ? `${floorTitle(floor).toUpperCase()} · ` : "IOI CITY MALL · "}
          {shown} {shown === 1 ? "SHOP" : "SHOPS"}
        </span>
        <button className="icon-button" aria-label="Close directory" onClick={onClose}>
          <Icon name="close" size={18} />
        </button>
      </div>
      <div className="panel-heading">
        <h1>Find a shop</h1>
        <p className="directory-note">Search by name, unit or category, then tap a shop to walk there.</p>
      </div>
      <label className="directory-search">
        <Icon name="search" size={16} />
        <input
          value={query}
          onChange={(event) => {
            if (!searching && event.target.value.trim()) setSearchClosed(new Set());
            setQuery(event.target.value);
          }}
          placeholder="Find a name, unit or category"
          aria-label="Search directory"
          autoFocus
        />
        {query && (
          <button type="button" className="directory-clear" aria-label="Clear search" onClick={() => setQuery("")}>
            <Icon name="close" size={14} />
          </button>
        )}
      </label>
      <div className="directory-toolbar">
        <div className="directory-scope" role="radiogroup" aria-label="Where to search">
          <button type="button" role="radio" aria-checked={scope === "floor"} onClick={() => setScope("floor")}>
            This floor <span>{floorCount}</span>
          </button>
          <button type="button" role="radio" aria-checked={scope === "mall"} onClick={() => setScope("mall")}>
            All floors <span>{mallCount}</span>
          </button>
        </div>
        {groups.length > 0 && (
          <button type="button" className="text-button directory-expand" onClick={() => setAll(!allOpen)}>
            {allOpen ? "Collapse all" : "Expand all"}
          </button>
        )}
      </div>

      <div className="directory-list">
        {groups.map((group) => {
          const open = isOpen(group.key);
          const panelId = `directory-group-${group.key}`;
          return (
            <section className="directory-group" key={group.key} data-open={open}>
              <button
                type="button"
                className="directory-group-head"
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => toggle(group.key)}
              >
                <Icon name="chevron" size={16} />
                <span>{group.label}</span>
                <small>{group.entries.length}</small>
              </button>
              {open && (
                <div id={panelId}>
                  {group.entries.map(({ space, floor: spaceFloor }) => (
                    <button
                      className="directory-item"
                      key={space.unitId}
                      onClick={() => onVisit(spaceFloor, space.unitId)}
                      aria-label={`Go to ${space.name}, ${floorTitle(spaceFloor)}, unit ${space.unitNumber}`}
                    >
                      <SpaceArt space={space} className="thumb" />
                      <span className="item-text">
                        <strong>{space.name}</strong>
                        <span>{space.category}</span>
                        <small>
                          {space.unitNumber}
                          {space.comingSoon ? (
                            <span className="status-badge" data-kind="soon">Coming soon</span>
                          ) : (
                            fresh.has(space.unitId) && <span className="status-badge" data-kind="new">New</span>
                          )}
                          {withOffers.has(space.unitId) && <span className="status-badge" data-kind="offer">Offer</span>}
                          {spaceFloor !== floor && <span className="floor-badge">{floorTitle(spaceFloor)}</span>}
                        </small>
                      </span>
                      <Icon name={spaceFloor === floor ? "walk" : "layers"} size={16} />
                    </button>
                  ))}
                </div>
              )}
            </section>
          );
        })}
        {!groups.length && (
          <p className="empty-state">
            No matching shops{scope === "floor" ? " on this floor" : ""}.
            {scope === "floor" && mallCount > 0 && (
              <>
                {" "}
                <button type="button" className="directory-inline-link" onClick={() => setScope("mall")}>
                  {mallCount} on other floors
                </button>
              </>
            )}
          </p>
        )}
      </div>
    </aside>
  );
}
