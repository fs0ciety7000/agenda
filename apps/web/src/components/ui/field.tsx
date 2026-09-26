import * as React from 'react';
import { cn } from '@/lib/cn';

interface FieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
}

/** Champ accessible : label toujours visible, aide et erreur reliées par aria-describedby. */
export const Field = React.forwardRef<HTMLInputElement, FieldProps>(
  ({ label, hint, error, id, className, ...props }, ref) => {
    const autoId = React.useId();
    const inputId = id ?? autoId;
    const hintId = hint ? `${inputId}-hint` : undefined;
    const errorId = error ? `${inputId}-error` : undefined;
    return (
      <div className="flex flex-col gap-1.5">
        <label htmlFor={inputId} className="text-sm font-medium text-text">
          {label}
        </label>
        <input
          ref={ref}
          id={inputId}
          aria-invalid={!!error || undefined}
          aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
          className={cn(
            'h-11 rounded-md border border-border bg-surface px-3 text-[0.9375rem] text-text placeholder:text-text-muted',
            'transition-colors focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent',
            error && 'border-danger',
            className,
          )}
          {...props}
        />
        {hint && !error && (
          <p id={hintId} className="text-[0.8125rem] text-text-muted">
            {hint}
          </p>
        )}
        {error && (
          <p id={errorId} className="text-[0.8125rem] text-danger">
            {error}
          </p>
        )}
      </div>
    );
  },
);
Field.displayName = 'Field';
