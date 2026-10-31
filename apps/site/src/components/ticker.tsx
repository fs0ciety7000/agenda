'use client';

import { Pause, Play } from 'lucide-react';
import { useEffect, useState } from 'react';

/**
 * Compteur qui avance tout seul (pile de tâches, semaine), arrêté si le système demande moins
 * d'animations, si l'onglet est caché, ou au clic sur le bouton pause (WCAG 2.2.2).
 */
export function useTicker(ms: number) {
  const [tick, setTick] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) setPaused(true);
  }, []);
  useEffect(() => {
    if (paused) return;
    const id = window.setInterval(() => {
      if (!document.hidden) setTick((t) => t + 1);
    }, ms);
    return () => window.clearInterval(id);
  }, [ms, paused]);
  return { tick, paused, toggle: () => setPaused((p) => !p) };
}

export function PauseButton({
  paused,
  onToggle,
  labels,
  className,
}: {
  paused: boolean;
  onToggle: () => void;
  labels: { pause: string; play: string };
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={paused ? labels.play : labels.pause}
      className={
        className ??
        'flex size-11 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-muted hover:text-text'
      }
    >
      {paused ? <Play className="size-4" aria-hidden /> : <Pause className="size-4" aria-hidden />}
    </button>
  );
}
