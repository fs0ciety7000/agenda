'use client';

import { useEffect, useMemo, useState } from 'react';

const COLORS = [
  'var(--color-accent)',
  'var(--color-member-sage)',
  'var(--color-member-ocean)',
  'var(--color-member-amber)',
  'var(--color-member-plum)',
];

/** Pluie de confettis (2,5 s), purement décorative ; rien si « réduire les animations ». */
export function Confetti({ pieces = 36 }: { pieces?: number }) {
  const [visible, setVisible] = useState(true);
  const reduced = useMemo(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  );
  const items = useMemo(
    () =>
      Array.from({ length: pieces }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.6,
        duration: 1.6 + Math.random() * 0.9,
        dx: `${(Math.random() - 0.5) * 30}vw`,
        rot: `${(Math.random() - 0.5) * 720}deg`,
        color: COLORS[i % COLORS.length],
        round: i % 3 === 0,
      })),
    [pieces],
  );
  useEffect(() => {
    const id = setTimeout(() => setVisible(false), 3200);
    return () => clearTimeout(id);
  }, []);
  if (!visible || reduced) return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[70] overflow-hidden">
      {items.map((p, i) => (
        <span
          key={i}
          className={p.round ? 'absolute top-0 size-2 rounded-full' : 'absolute top-0 h-3 w-1.5'}
          style={
            {
              left: `${p.left}%`,
              background: p.color,
              animation: `confetti-fall ${p.duration}s cubic-bezier(.2,.6,.4,1) ${p.delay}s both`,
              '--dx': p.dx,
              '--rot': p.rot,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
