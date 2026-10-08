'use client';

import * as React from 'react';
import { cn } from '@/lib/cn';

interface Toast {
  id: number;
  message: string;
  action?: { label: string; onClick: () => void };
  tone?: 'default' | 'error';
}

const ToastContext = React.createContext<(t: Omit<Toast, 'id'>) => void>(() => {});

/** Toasts discrets, annoncés aux lecteurs d'écran (role=status), 5 s par défaut. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const dismiss = React.useCallback(
    (id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)),
    [],
  );
  const push = React.useCallback(
    (t: Omit<Toast, 'id'>) => {
      const id = Date.now() + Math.random();
      setToasts((ts) => [...ts.slice(-2), { ...t, id }]);
      setTimeout(() => dismiss(id), 5000);
    },
    [dismiss],
  );
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              'pointer-events-auto flex min-h-11 w-full max-w-sm items-center justify-between gap-3 rounded-lg px-4 py-2 text-sm shadow-[0_4px_12px_rgb(0_0_0/0.12)]',
              t.tone === 'error' ? 'bg-danger text-surface' : 'bg-text text-bg',
            )}
          >
            <span>{t.message}</span>
            {t.action && (
              <button
                type="button"
                className="-mr-2 min-h-11 rounded-md px-2 font-medium underline-offset-4 hover:underline"
                onClick={() => {
                  t.action!.onClick();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => React.useContext(ToastContext);
