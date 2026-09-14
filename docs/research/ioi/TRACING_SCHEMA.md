# IOI City Mall — level tracing schema

Source: `docs/research/ioi/floor-map-board.jpg`, a photo of the mall's own floor-map board. Each level is cropped to `docs/research/ioi/levels/<LEVEL>.jpg` and cut into 2× upscaled tiles with a coordinate grid in `docs/research/ioi/levels/tiles/<LEVEL>/` (`overview-grid.jpg` shows the whole level with 100 px grid labels; `tile-x####-y####.jpg` are zoomed tiles whose red/blue grid labels are the level crop's own pixel coordinates).

All coordinates in the output are **level-crop pixels** (the numbers printed on the grid), `[x, y]`, x to the right, y downwards.

## Output file: `docs/research/ioi/traced/<LEVEL>.json`

```jsonc
{
  "level": "LG",                       // LG | G | L1 | L2 | L3 | L4
  "cropSize": [1700, 900],             // width, height of the level crop
  "footprint": [[x, y], ...],          // the mall floor outline for this level: the coloured retail area
                                       // (shops + corridors + courts), NOT the pale yellow site background,
                                       // NOT parking bands. 12–40 points, clockwise, closed implicitly.
  "landmarks": {                       // used to align levels on top of each other
    "eastCourt": [x, y],               // centre of the round East Court / roundabout (East wing)
    "westCourt": [x, y] | null,        // centre of the West Court (West wing), null if the wing is absent
    "aeon": [x, y] | null,             // centre of the AEON anchor block, null if absent
    "parkson": [x, y] | null           // centre of the PARKSON anchor block, null if absent
  },
  "corridor": [[x, y], ...],           // centreline polyline of the main walkway from the far West end to
                                       // the far East end, 10–40 points (follow the tan/gold path)
  "units": [
    {
      "unitNumber": "LG-24",           // "<LEVEL>-<label on the board>", e.g. "LG-K12", "G-E-201", "L1-AT-3"
      "label": "24",                   // exactly what the board prints inside the shape
      "name": "HARVEY NORMAN" | null,  // tenant name only if the board prints one (anchors); else null
      "kind": "anchor" | "shop" | "kiosk",
      "zone": "west" | "east",
      "polygon": [[x, y], ...],        // 4–8 points tracing the shape, clockwise
      "frontFacing": "up" | "down" | "left" | "right"   // which side opens onto the corridor
    }
  ],
  "amenities": [                       // optional but wanted: escalators, lifts, toilets, info counters
    { "kind": "escalator" | "lift" | "toilet" | "info" | "entrance", "at": [x, y], "label": "West Entrance" | null }
  ],
  "notes": "free text: anything unreadable, guessed, or ambiguous"
}
```

## Rules
- Trace **every** shape on the board for that level, including kiosks (`K…`, `F-K…`, `S-K…`, `E-2xx`) and combined units ("4 & 6", "13&15", "248 & 249" → label `"4 & 6"`, unitNumber `"LG-4-6"`).
- Anchor blocks (Parkson, Lotus's, HomePro, AEON, Nitori, GSC…, Icescape, District 21, etc.) are `kind: "anchor"` with their printed name and code (e.g. `label: "AT-2"`).
- Parking bands, hotels (Le Meridien, Moxy), Symphony park, towers, "YOU ARE HERE" and legend are **not** units — leave them out of `units` and out of the footprint.
- Small shops are often drawn as thin slices side by side along the corridor: trace each as its own quad; approximate, but keep neighbours non-overlapping and in the right order.
- If a label is unreadable, still trace the shape with `label: "?"` and mention it in `notes`.
- Read positions from the tile grid labels, not by guessing from the overview alone. Zoom further with `sips -c H W --cropOffset Y X <crop> --out /tmp/x.jpg` (macOS) if needed.
