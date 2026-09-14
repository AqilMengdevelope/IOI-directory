"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";
import { SpaceArt } from "@/components/SpaceArt";
import type { DirectorySpace, FloorId } from "@/types/gmbb";

interface DirectoryPanelProps {
  floor: FloorId;
  spaces: DirectorySpace[];
  onSelect: (unitId: string) => void;
  onClose: () => void;
}

export function DirectoryPanel({ floor, spaces, onSelect, onClose }: DirectoryPanelProps) {
  const [query, setQuery] = useState("");
  const needle = query.toLowerCase();
  const filtered = spaces.filter((space) =>
    (space.name + " " + space.unitNumber + " " + space.category).toLowerCase().includes(needle),
  );

  return (
    <aside className="side-panel" aria-label="GMBB shops">
      <div className="panel-top">
        <span className="eyebrow">
          LEVEL {floor} · {spaces.length} SPACES
        </span>
        <button className="icon-button" aria-label="Close directory" onClick={onClose}>
          <Icon name="close" size={18} />
        </button>
      </div>
      <div className="panel-heading">
        <h1>Around this floor</h1>
        <p className="directory-note">Shops, studios and spaces from the floor review.</p>
      </div>
      <label className="directory-search">
        <Icon name="list" size={16} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Find a name, unit or category"
          aria-label="Search directory"
        />
      </label>
      <div className="directory-list">
        {filtered.map((space) => (
          <button className="directory-item" key={space.unitId} onClick={() => onSelect(space.unitId)}>
            <SpaceArt space={space} className="thumb" />
            <span className="item-text">
              <strong>{space.name}</strong>
              <span>{space.category}</span>
              <small>{space.unitNumber}</small>
            </span>
            <Icon name="arrow" size={16} />
          </button>
        ))}
        {!filtered.length && <p className="empty-state">No matching spaces.</p>}
      </div>
    </aside>
  );
}
