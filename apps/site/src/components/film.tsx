'use client';

import { Volume2, VolumeX } from 'lucide-react';
import { useInView, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { Content } from '@/lib/content';
import { SectionHeading } from './ui';

/**
 * Vidéo de présentation (20 s, source : assets/motion). 16:9 sur grand écran, 1:1 sur mobile.
 * Lecture muette en boucle quand elle est visible ; jamais automatique si l'utilisateur
 * préfère réduire les animations (lecture manuelle via les contrôles).
 */
export function Film({ t }: { t: Content }) {
  const box = useRef<HTMLDivElement>(null);
  const wide = useRef<HTMLVideoElement>(null);
  const square = useRef<HTMLVideoElement>(null);
  const inView = useInView(box, { amount: 0.5 });
  const reduce = useReducedMotion();
  const [muted, setMuted] = useState(true);

  const current = () => {
    const w = wide.current;
    return w && w.offsetParent !== null ? w : square.current;
  };

  useEffect(() => {
    if (reduce) return;
    const v = current();
    if (!v) return;
    // L'attribut « muted » n'est pas toujours rendu par React : le navigateur l'exige pour l'autoplay.
    v.muted = muted;
    if (inView) v.play().catch(() => {});
    else v.pause();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seule la visibilité déclenche lecture/pause
  }, [inView, reduce]);

  const toggleSound = () => {
    const v = current();
    if (!v) return;
    v.muted = !muted;
    setMuted(!muted);
    if (v.paused) v.play().catch(() => {});
  };

  const common = {
    muted: true,
    loop: true,
    playsInline: true,
    preload: 'none' as const,
    controls: !!reduce,
    'aria-label': t.film.label,
  };

  return (
    <section id="film" className="relative py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-5">
        <SectionHeading eyebrow={t.film.eyebrow} title={t.film.title} text={t.film.text} center />
        <div
          ref={box}
          className="relative mx-auto mt-14 max-w-md overflow-hidden rounded-[28px] border border-border bg-surface shadow-[0_40px_90px_-40px_rgb(36_24_29/0.55)] md:max-w-5xl"
        >
          <video
            ref={wide}
            {...common}
            poster="/video/tandem-16x9.jpg"
            className="hidden h-auto w-full md:block"
          >
            <source src="/video/tandem-16x9.mp4" type="video/mp4" />
          </video>
          <video
            ref={square}
            {...common}
            poster="/video/tandem-1x1.jpg"
            className="block h-auto w-full md:hidden"
          >
            <source src="/video/tandem-1x1.mp4" type="video/mp4" />
          </video>
          {reduce ? null : (
            <button
              type="button"
              onClick={toggleSound}
              aria-pressed={!muted}
              aria-label={muted ? t.film.unmute : t.film.mute}
              className="absolute right-4 bottom-4 flex size-11 items-center justify-center rounded-full bg-text/70 text-bg backdrop-blur transition-colors hover:bg-text"
            >
              {muted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
