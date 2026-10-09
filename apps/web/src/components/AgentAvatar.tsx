import type { AgentName } from "@gyna/schemas";

/** Polygone régulier aux coins arrondis, en coordonnées 0-100. */
function roundedPolygon(n: number, rx: number, ry: number, radius: number, rot: number): string {
  const pts = Array.from({ length: n }, (_, i) => {
    const a = rot + (i * 2 * Math.PI) / n;
    return [50 + rx * Math.cos(a), 52 + ry * Math.sin(a)] as const;
  });
  const toward = (from: readonly [number, number], to: readonly [number, number]) => {
    const dx = to[0] - from[0], dy = to[1] - from[1], l = Math.hypot(dx, dy);
    return `${(from[0] + (dx / l) * radius).toFixed(2)} ${(from[1] + (dy / l) * radius).toFixed(2)}`;
  };
  return (
    pts
      .map((p, i) => {
        const prev = pts[(i - 1 + n) % n]!, next = pts[(i + 1) % n]!;
        return `${i === 0 ? "M" : "L"}${toward(p, prev)} Q${p[0].toFixed(2)} ${p[1].toFixed(2)} ${toward(p, next)}`;
      })
      .join(" ") + " Z"
  );
}

interface Look {
  shape: string;
  color: string;
  shade: string;
  /** Couleur des yeux et du sourire. */
  ink: string;
  /** Hauteur des yeux. */
  eyeY: number;
}

const LOOKS: Record<AgentName, Look> = {
  gyna: { shape: roundedPolygon(6, 44, 42, 13, -Math.PI / 2), color: "#c8f08f", shade: "#9ccc5f", ink: "#141826", eyeY: 50 },
  sourcing: { shape: roundedPolygon(8, 44, 40, 11, Math.PI / 8), color: "#9b87f0", shade: "#7a64d8", ink: "#ffffff", eyeY: 49 },
  qualification: {
    shape: "M6 52 C6 32 22 24 50 24 C78 24 94 32 94 52 C94 72 78 80 50 80 C22 80 6 72 6 52 Z",
    color: "#f5b547", shade: "#df9520", ink: "#ffffff", eyeY: 49,
  },
  redaction: {
    shape: "M50 14 C74 14 88 32 88 54 C88 76 72 88 50 88 C28 88 12 76 12 54 C12 32 26 14 50 14 Z",
    color: "#f26b3a", shade: "#d44f20", ink: "#ffffff", eyeY: 50,
  },
  veille: { shape: roundedPolygon(4, 54, 52, 19, Math.PI / 4), color: "#7fd3e6", shade: "#4fb4cc", ink: "#141826", eyeY: 50 },
};

/**
 * Avatar d'un agent : une forme et une couleur par agent, un visage souriant.
 * Au repos, il cligne des yeux et regarde autour ; au travail, il rebondit, les yeux en « ^ ^ ».
 */
export function AgentAvatar({ agent, size = 34, working = false, label }: { agent: AgentName; size?: number; working?: boolean; label?: string }) {
  const l = LOOKS[agent];
  const id = `av-${agent}-${size}`;
  const y = l.eyeY, gap = 13;
  const eye = (cx: number) => (
    <>
      <ellipse cx={cx} cy={y} rx={4.2} ry={5.6} fill={l.ink} />
      {l.ink === "#ffffff" ? null : <circle cx={cx + 1.3} cy={y - 1.8} r={1.3} fill="#fff" />}
    </>
  );
  const happy = (cx: number) => (
    <path d={`M${cx - 4.5} ${y + 1.5} Q${cx} ${y - 5} ${cx + 4.5} ${y + 1.5}`} stroke={l.ink} strokeWidth={3} strokeLinecap="round" fill="none" />
  );
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={`av av-${agent}${working ? " is-working" : ""}`}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <defs>
        <clipPath id={`${id}-c`}><path d={l.shape} /></clipPath>
        <linearGradient id={`${id}-g`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={l.color} />
          <stop offset="1" stopColor={l.shade} />
        </linearGradient>
      </defs>
      <g className="av-body">
        <path d={l.shape} fill={`url(#${id}-g)`} />
        <g clipPath={`url(#${id}-c)`}><ellipse cx={38} cy={22} rx={30} ry={12} fill="#fff" opacity={0.22} /></g>
        <ellipse cx={50 - gap - 9} cy={y + 9} rx={5.5} ry={3.2} fill="#ff7a9a" opacity={0.35} />
        <ellipse cx={50 + gap + 9} cy={y + 9} rx={5.5} ry={3.2} fill="#ff7a9a" opacity={0.35} />
        <g className="av-look">
          {working ? (
            <>{happy(50 - gap)}{happy(50 + gap)}</>
          ) : (
            <g className="av-blink">{eye(50 - gap)}{eye(50 + gap)}</g>
          )}
          <path d={`M45.5 ${y + 10} Q50 ${y + 14} 54.5 ${y + 10}`} stroke={l.ink} strokeWidth={2.6} strokeLinecap="round" fill="none" opacity={0.9} />
        </g>
      </g>
    </svg>
  );
}
