import type { ReactNode } from "react";
import type { DirectorySpace } from "@/types/gmbb";

type Pattern = "swirl" | "grid" | "speckle" | "arch" | "bloom";

interface SpaceArtProps {
  space: Pick<DirectorySpace, "name" | "thumb">;
  className?: string;
  slide?: number;
}

const PATTERNS: Pattern[] = ["swirl", "grid", "speckle", "arch", "bloom"];
const BASE_ARTWORK: { hue: number; pattern: Pattern } = { hue: 230, pattern: "grid" };
const SPECKLES: [number, number][] = [
  [34, 32],
  [58, 26],
  [80, 38],
  [44, 52],
  [70, 54],
  [92, 28],
];

function renderPattern(pattern: Pattern, dark: string, light: string): ReactNode {
  switch (pattern) {
    case "swirl":
      return (
        <>
          <circle cx={60} cy={40} r={26} fill="none" stroke={dark} strokeWidth={5} strokeLinecap="round" strokeDasharray="120 40" />
          <circle cx={60} cy={40} r={15} fill="none" stroke={light} strokeWidth={6} strokeLinecap="round" strokeDasharray="60 30" />
          <circle cx={60} cy={40} r={5} fill={dark} />
        </>
      );
    case "grid":
      return [24, 48, 72, 96].map((x) => (
        <rect
          key={x}
          x={x - 9}
          y={22}
          width={18}
          height={36}
          rx={6}
          fill={x % 48 === 0 ? light : dark}
          opacity={x % 48 === 0 ? 0.9 : 0.55}
        />
      ));
    case "speckle":
      return (
        <>
          <rect x={18} y={18} width={84} height={44} rx={14} fill={light} opacity={0.6} />
          {SPECKLES.map(([cx, cy], i) => (
            <circle key={i} cx={cx} cy={cy} r={i % 2 ? 5 : 7} fill={dark} opacity={0.75} />
          ))}
        </>
      );
    case "arch":
      return (
        <>
          <path d="M30 62V40a30 30 0 0 1 60 0v22" fill="none" stroke={dark} strokeWidth={6} strokeLinecap="round" />
          <path d="M46 62V42a14 14 0 0 1 28 0v20" fill={light} opacity={0.8} />
        </>
      );
    case "bloom":
      return (
        <>
          {[0, 60, 120, 180, 240, 300].map((r) => (
            <ellipse key={r} cx={60} cy={40} rx={9} ry={22} fill={light} opacity={0.75} transform={`rotate(${r} 60 40)`} />
          ))}
          <circle cx={60} cy={40} r={8} fill={dark} />
        </>
      );
  }
}

export function SpaceArt({ space, className, slide = 0 }: SpaceArtProps) {
  if (space.thumb) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        className={"space-art " + (className ?? "")}
        src={space.thumb}
        alt={space.name}
        loading="lazy"
        decoding="async"
      />
    );
  }

  const hue = (BASE_ARTWORK.hue + 26 * slide) % 360;
  const pattern =
    slide === 0
      ? BASE_ARTWORK.pattern
      : PATTERNS[(PATTERNS.indexOf(BASE_ARTWORK.pattern) + slide) % PATTERNS.length];
  const dark = "hsl(" + hue + " 46% 42%)";
  const light = "hsl(" + ((hue + 38) % 360) + " 70% 72%)";

  return (
    <div
      className={"space-art generated " + (className ?? "")}
      style={{ background: "hsl(" + hue + " 58% 88%)" }}
      role="img"
      aria-label={"Placeholder artwork for " + space.name}
    >
      <svg viewBox="0 0 120 80" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        {renderPattern(pattern, dark, light)}
      </svg>
    </div>
  );
}
