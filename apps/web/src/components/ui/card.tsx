import * as React from 'react';
import { cn } from '@/lib/cn';

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('rounded-lg border border-border bg-surface p-5', className)} {...props} />
  );
}

export function SectionTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className={cn('text-xs font-medium uppercase tracking-[0.04em] text-text-muted', className)}
      {...props}
    />
  );
}
