/**
 * Gravure du pied de page : un village la nuit, maisons hachurées, ciel étoilé et deux fenêtres
 * allumées (abricot, lilas) reliées par un fil qui se dessine. SVG calculé au build (graine fixe),
 * quelques kilo-octets ; tout s'arrête avec prefers-reduced-motion (globals.css).
 */
const W = 1440;
const BASE = 470;

function village() {
  let seed = 11;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const houses: {
    d: string;
    o: number;
    window: { x: number; y: number; lit?: 'apricot' | 'lilac' };
  }[] = [];
  let x = -20;
  while (x < W) {
    const w = 90 + rand() * 90;
    const h = 90 + rand() * 120;
    const roof = 30 + rand() * 40;
    const n = houses.length;
    const d = `M${x.toFixed(0)} ${BASE}V${(BASE - h).toFixed(0)}L${(x + w / 2).toFixed(0)} ${(BASE - h - roof).toFixed(0)}L${(x + w).toFixed(0)} ${(BASE - h).toFixed(0)}V${BASE}Z`;
    houses.push({
      d,
      o: 0.35 + rand() * 0.35,
      window: {
        x: x + w / 2 - 7,
        y: BASE - h + 24,
        lit: n === 3 ? 'apricot' : n === 8 ? 'lilac' : undefined,
      },
    });
    x += w + 6;
  }
  const stars = Array.from({ length: 80 }, (_, i) => ({
    x: rand() * W,
    y: rand() * 220,
    r: 0.5 + rand(),
    twinkle: i % 5 === 0 ? 2 + (i % 4) : 0,
  }));
  const a = houses.find((h) => h.window.lit === 'apricot')!.window;
  const b = houses.find((h) => h.window.lit === 'lilac')!.window;
  const [ax, ay, bx, by] = [a.x + 7, a.y + 9, b.x + 7, b.y + 9];
  const thread = `M${ax.toFixed(0)} ${ay}C${(ax + 120).toFixed(0)} ${ay - 160},${((ax + bx) / 2).toFixed(0)} ${Math.min(ay, by) - 200},${bx.toFixed(0)} ${by}`;
  return { houses, stars, thread, lamp: { x: ax, y: ay } };
}

const { houses, stars, thread, lamp } = village();

export function Gravure({ label }: { label: string }) {
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${W} 520`}
      preserveAspectRatio="xMidYMax slice"
      className="block h-[22rem] w-full sm:h-[32.5rem]"
    >
      <defs>
        <pattern
          id="g-hatch"
          width="6"
          height="6"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(-35)"
        >
          <line x1="0" y1="0" x2="0" y2="6" stroke="var(--gn-brand-mist)" strokeWidth="1" />
        </pattern>
        <pattern
          id="g-hatch2"
          width="4"
          height="4"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(55)"
        >
          <line x1="0" y1="0" x2="0" y2="4" stroke="var(--gn-brand-lilac)" strokeWidth="0.8" />
        </pattern>
        <radialGradient id="g-lamp">
          <stop offset="0" stopColor="var(--gn-brand-apricot)" stopOpacity="0.55" />
          <stop offset="1" stopColor="var(--gn-brand-apricot)" stopOpacity="0" />
        </radialGradient>
      </defs>
      {stars.map((s, i) => (
        <circle
          key={i}
          cx={s.x.toFixed(0)}
          cy={s.y.toFixed(0)}
          r={s.r.toFixed(2)}
          fill="var(--gn-brand-paper)"
          className={s.twinkle ? 'twinkle' : undefined}
          style={s.twinkle ? { animationDuration: `${s.twinkle}s` } : { opacity: 0.5 }}
        />
      ))}
      <text
        x={W / 2}
        y="300"
        textAnchor="middle"
        fontSize="330"
        fontStyle="italic"
        letterSpacing="-10"
        fill="url(#g-hatch2)"
        opacity="0.55"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        Tandem
      </text>
      {houses.map((h, i) => (
        <g key={i}>
          <path d={h.d} fill="var(--gn-brand-night)" />
          <path
            d={h.d}
            fill="url(#g-hatch)"
            opacity={h.o.toFixed(2)}
            stroke="var(--gn-brand-mist)"
            strokeWidth="1"
          />
          <rect
            x={h.window.x.toFixed(0)}
            y={h.window.y.toFixed(0)}
            width="14"
            height="18"
            rx="2"
            fill={h.window.lit ? `var(--gn-brand-${h.window.lit})` : 'rgb(243 238 228 / 0.1)'}
            className={h.window.lit ? 'glow' : undefined}
          />
        </g>
      ))}
      <circle cx={lamp.x.toFixed(0)} cy={lamp.y} r="60" fill="url(#g-lamp)" className="glow" />
      <path
        d={thread}
        fill="none"
        stroke="var(--gn-brand-apricot)"
        strokeWidth="1.6"
        className="draw-slow"
      />
      <rect x="0" y={BASE} width={W} height="50" fill="url(#g-hatch)" opacity="0.35" />
      <line x1="0" y1={BASE} x2={W} y2={BASE} stroke="var(--gn-brand-mist)" strokeWidth="1" />
    </svg>
  );
}
