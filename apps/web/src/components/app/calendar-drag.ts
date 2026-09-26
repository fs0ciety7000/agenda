'use client';

import type { OccurrenceDto } from '@agenda/contracts';
import { addDays } from '@agenda/domain';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';

export const SNAP_MINUTES = 15;
const MOUSE_THRESHOLD_PX = 4;
const TOUCH_HOLD_MS = 350;
const TOUCH_SLOP_PX = 8;

export type DragMode = 'move' | 'resize';

export interface Placement {
  date: string;
  startMinute: number | null;
  durationMinutes: number | null;
}

interface DragState {
  o: OccurrenceDto;
  mode: DragMode;
  pointerId: number;
  /** Doigt : le navigateur peut annuler le pointeur (menu contextuel, défilement), on suit alors les événements tactiles. */
  touch: boolean;
  x0: number;
  y0: number;
  active: boolean;
  preview: Placement;
}

const snap = (minutes: number) => Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES;
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export const placementOf = (o: OccurrenceDto): Placement => ({
  date: o.date!,
  startMinute: o.startMinute,
  durationMinutes: o.durationMinutes,
});

export const samePlacement = (a: Placement, b: Placement) =>
  a.date === b.date && a.startMinute === b.startMinute && a.durationMinutes === b.durationMinutes;

/** Nouvelle position au clavier (Alt + flèches), mêmes règles que le glisser-déposer. */
export function nudge(o: OccurrenceDto, key: string, resize: boolean): Placement | null {
  const p = placementOf(o);
  const dir = key === 'ArrowUp' || key === 'ArrowLeft' ? -1 : 1;
  if (key === 'ArrowLeft' || key === 'ArrowRight') {
    return resize ? null : { ...p, date: addDays(p.date, dir) };
  }
  if (key !== 'ArrowUp' && key !== 'ArrowDown') return null;
  if (p.startMinute == null) return null;
  if (resize) {
    const d = clamp(
      (p.durationMinutes ?? 30) + dir * SNAP_MINUTES,
      SNAP_MINUTES,
      24 * 60 - p.startMinute,
    );
    return { ...p, durationMinutes: d };
  }
  const duration = p.durationMinutes ?? 30;
  return {
    ...p,
    startMinute: clamp(p.startMinute + dir * SNAP_MINUTES, 0, 24 * 60 - Math.min(duration, 60)),
  };
}

/**
 * Glisser-déposer au pointeur (souris, stylet, doigt) dans le calendrier :
 * - souris : le glissement commence après quelques pixels (un simple clic ouvre toujours la tâche) ;
 * - tactile : appui long, pour ne pas gêner le défilement ;
 * - le jour cible est la colonne / case `[data-date]` sous le pointeur, l'heure suit le décalage
 *   vertical (`pxPerHour`, 0 = pas d'heure : vue mois), par pas de 15 minutes.
 */
export function useCalendarDrag({
  containerRef,
  pxPerHour,
  onDrop,
}: {
  containerRef: RefObject<HTMLElement | null>;
  pxPerHour: number;
  onDrop: (o: OccurrenceDto, to: Placement) => void;
}) {
  const [preview, setPreview] = useState<{ id: string; placement: Placement } | null>(null);
  const state = useRef<DragState | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClick = useRef(false);
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;

  const dateAt = useCallback(
    (x: number, y: number): string | null => {
      const cells = containerRef.current?.querySelectorAll<HTMLElement>('[data-date]') ?? [];
      let byX: string | null = null;
      for (const cell of cells) {
        const r = cell.getBoundingClientRect();
        if (x < r.left || x >= r.right) continue;
        if (y >= r.top && y < r.bottom) return cell.dataset.date!;
        byX ??= pxPerHour > 0 ? cell.dataset.date! : null;
      }
      return byX;
    },
    [containerRef, pxPerHour],
  );

  const compute = useCallback(
    (s: DragState, x: number, y: number): Placement => {
      const origin = placementOf(s.o);
      const deltaMin = pxPerHour > 0 ? snap(((y - s.y0) / pxPerHour) * 60) : 0;
      if (s.mode === 'resize') {
        const start = origin.startMinute ?? 0;
        return {
          ...origin,
          durationMinutes: clamp(
            (origin.durationMinutes ?? 30) + deltaMin,
            SNAP_MINUTES,
            24 * 60 - start,
          ),
        };
      }
      const date = dateAt(x, y) ?? s.preview.date;
      if (origin.startMinute == null) return { ...origin, date };
      const duration = origin.durationMinutes ?? 30;
      return {
        ...origin,
        date,
        startMinute: clamp(origin.startMinute + deltaMin, 0, 24 * 60 - Math.min(duration, 60)),
      };
    },
    [dateAt, pxPerHour],
  );

  const stop = useCallback(() => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
    state.current = null;
    setPreview(null);
  }, []);

  const activate = useCallback((s: DragState) => {
    s.active = true;
    suppressClick.current = true;
    setPreview({ id: s.o.id, placement: s.preview });
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate?.(10);
  }, []);

  useEffect(() => {
    const follow = (s: DragState, x: number, y: number) => {
      const next = compute(s, x, y);
      if (!samePlacement(next, s.preview)) {
        s.preview = next;
        setPreview({ id: s.o.id, placement: next });
      }
    };
    const finish = (drop: boolean) => {
      const s = state.current;
      if (!s) return;
      if (drop && s.active && !samePlacement(s.preview, placementOf(s.o))) {
        onDropRef.current(s.o, s.preview);
      }
      stop();
      // Le `click` qui suit est ignoré (consumeClick), pas les suivants.
      setTimeout(() => (suppressClick.current = false), 0);
    };
    const move = (e: PointerEvent) => {
      const s = state.current;
      if (!s || e.pointerId !== s.pointerId) return;
      const dist = Math.hypot(e.clientX - s.x0, e.clientY - s.y0);
      if (!s.active) {
        if (s.touch) {
          // Le doigt bouge avant l'appui long : c'est un défilement.
          if (dist > TOUCH_SLOP_PX) stop();
          return;
        }
        if (dist < MOUSE_THRESHOLD_PX) return;
        activate(s);
      }
      follow(s, e.clientX, e.clientY);
    };
    const up = (e: PointerEvent) => {
      const s = state.current;
      if (!s || e.pointerId !== s.pointerId) return;
      // Sur mobile, l'appui long peut provoquer un pointercancel (menu contextuel, geste système)
      // alors que le doigt est toujours posé : le glissement continue via touchmove / touchend.
      if (e.type === 'pointercancel' && s.touch && s.active) return;
      finish(e.type === 'pointerup');
    };
    const touchMove = (e: TouchEvent) => {
      const s = state.current;
      if (!s?.active || !s.touch) return;
      // Empêcher le navigateur de faire défiler la page pendant le glissement.
      if (e.cancelable) e.preventDefault();
      const t = e.touches[0];
      if (t) follow(s, t.clientX, t.clientY);
    };
    const touchEnd = (e: TouchEvent) => {
      const s = state.current;
      if (!s?.touch) return;
      if (s.active) finish(e.type === 'touchend');
      else if (e.touches.length === 0) stop();
    };
    // L'appui long ouvrirait le menu contextuel du navigateur (et annulerait le geste).
    const contextMenu = (e: Event) => {
      if (state.current?.touch) e.preventDefault();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && state.current) stop();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    window.addEventListener('touchmove', touchMove, { passive: false });
    window.addEventListener('touchend', touchEnd);
    window.addEventListener('touchcancel', touchEnd);
    window.addEventListener('contextmenu', contextMenu);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      window.removeEventListener('touchmove', touchMove);
      window.removeEventListener('touchend', touchEnd);
      window.removeEventListener('touchcancel', touchEnd);
      window.removeEventListener('contextmenu', contextMenu);
      window.removeEventListener('keydown', key);
    };
  }, [activate, compute, stop]);

  const start = useCallback(
    (e: ReactPointerEvent, o: OccurrenceDto, mode: DragMode) => {
      if (!o.date || (e.pointerType === 'mouse' && e.button !== 0)) return;
      if (mode === 'resize') e.stopPropagation();
      suppressClick.current = false;
      const s: DragState = {
        o,
        mode,
        pointerId: e.pointerId,
        touch: e.pointerType !== 'mouse',
        x0: e.clientX,
        y0: e.clientY,
        active: false,
        preview: placementOf(o),
      };
      state.current = s;
      if (s.touch) {
        holdTimer.current = setTimeout(() => {
          if (state.current === s) activate(s);
        }, TOUCH_HOLD_MS);
      }
    },
    [activate],
  );

  return {
    preview,
    start,
    /** À appeler dans `onClick` : vrai si ce clic termine un glissement (ne pas ouvrir la tâche). */
    consumeClick: () => {
      const v = suppressClick.current;
      suppressClick.current = false;
      return v;
    },
  };
}
