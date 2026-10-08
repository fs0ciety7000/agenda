import { ChevronDown } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/cn';

/** Select natif stylé : accessible par défaut et idéal au doigt sur mobile. */
export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement> & { label?: string; hideLabel?: boolean }
>(({ label, hideLabel, id, className, children, ...props }, ref) => {
  const autoId = React.useId();
  const selectId = id ?? autoId;
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={selectId} className={cn('text-sm font-medium', hideLabel && 'sr-only')}>
          {label}
        </label>
      )}
      <div className="relative">
        <select
          ref={ref}
          id={selectId}
          className={cn(
            'h-11 w-full appearance-none rounded-md border border-border-strong bg-surface pl-3 pr-9 text-[0.9375rem] text-text',
            'focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent',
            className,
          )}
          {...props}
        >
          {children}
        </select>
        <ChevronDown
          aria-hidden
          className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-text-muted"
        />
      </div>
    </div>
  );
});
Select.displayName = 'Select';
