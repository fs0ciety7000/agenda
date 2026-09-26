'use client';

import * as React from 'react';
import { cn } from '@/lib/cn';

export interface SegmentOption<T extends string> {
  value: T;
  label: React.ReactNode;
}

/** Choix unique (radiogroup) : flèches ← → pour naviguer, comme un groupe de boutons radio. */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: {
  label: string;
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    const delta =
      e.key === 'ArrowRight' || e.key === 'ArrowDown'
        ? 1
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
          ? -1
          : 0;
    if (!delta) return;
    e.preventDefault();
    const next = (index + delta + options.length) % options.length;
    onChange(options[next]!.value);
    refs.current[next]?.focus();
  };
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        'grid auto-cols-fr grid-flow-col gap-1 rounded-md border border-border bg-surface-muted p-1',
        className,
      )}
    >
      {options.map((o, i) => {
        const checked = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              'flex min-h-10 items-center justify-center gap-1.5 truncate rounded-sm px-2 text-sm text-text-muted transition-colors',
              checked && 'bg-surface font-medium text-text shadow-[0_1px_2px_rgb(0_0_0/0.06)]',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
