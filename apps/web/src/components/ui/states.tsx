import type { LucideIcon } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/cn';
import { Button } from './button';

export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  body?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center gap-3 px-6 py-12 text-center', className)}>
      <span
        aria-hidden
        className="flex size-16 items-center justify-center rounded-full bg-accent/10 text-accent"
      >
        <Icon className="size-7 stroke-[1.5]" />
      </span>
      <p className="text-[1.0625rem] font-medium text-text">{title}</p>
      {body && <p className="max-w-sm text-[0.9375rem] text-text-muted">{body}</p>}
      {action}
    </div>
  );
}

export function ErrorState({
  message,
  retryLabel,
  onRetry,
}: {
  message: string;
  retryLabel: string;
  onRetry?: () => void;
}) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <p className="text-[0.9375rem] text-text">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          {retryLabel}
        </Button>
      )}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-pulse rounded-md bg-surface-muted', className)} />;
}
