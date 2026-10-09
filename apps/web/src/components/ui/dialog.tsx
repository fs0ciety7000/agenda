'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/cn';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

/**
 * Feuille en bas d'écran sur mobile, boîte de dialogue centrée à partir de 640 px.
 * Radix gère le piège de focus, Échap, le retour du focus et aria-modal.
 */
export function DialogContent({
  title,
  description,
  closeLabel,
  className,
  onOpenAutoFocus,
  fallbackFocus,
  children,
}: {
  title: string;
  description?: string;
  closeLabel: string;
  className?: string;
  /** Focus initial personnalisé (le focus revient quand même à l'élément d'origine). */
  onOpenAutoFocus?: (event: Event) => void;
  /** Élément à focaliser à la fermeture quand rien ne l'était à l'ouverture (raccourci clavier). */
  fallbackFocus?: () => HTMLElement | null;
  children: React.ReactNode;
}) {
  // Sans Dialog.Trigger (ouverture par état, raccourci), Radix ne sait pas où rendre le focus :
  // on garde l'élément actif à l'ouverture et on y revient à la fermeture.
  const returnTo = React.useRef<HTMLElement | null>(null);
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[1px] data-[state=open]:animate-[fade-in_var(--gn-motion-base)_var(--gn-motion-easing)]" />
      <DialogPrimitive.Content
        onOpenAutoFocus={(e) => {
          returnTo.current = document.activeElement as HTMLElement | null;
          onOpenAutoFocus?.(e);
        }}
        onCloseAutoFocus={(e) => {
          const active = returnTo.current;
          const el =
            active && active !== document.body && document.contains(active)
              ? active
              : (fallbackFocus?.() ?? null);
          if (el) {
            e.preventDefault();
            el.focus();
          }
        }}
        className={cn(
          'fixed z-50 flex max-h-[92dvh] w-full flex-col gap-5 overflow-y-auto bg-surface p-5 shadow-[0_12px_32px_rgb(0_0_0/0.10)]',
          'inset-x-0 bottom-0 rounded-t-xl pb-[max(1.25rem,env(safe-area-inset-bottom))]',
          'sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-[12vh] sm:max-w-lg sm:-translate-x-1/2 sm:rounded-xl sm:pb-5',
          'data-[state=open]:animate-[sheet-in_var(--gn-motion-slow)_var(--gn-motion-easing)]',
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <DialogPrimitive.Title className="text-lg font-semibold">{title}</DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="text-sm text-text-muted">
                {description}
              </DialogPrimitive.Description>
            ) : (
              <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
            )}
          </div>
          <DialogPrimitive.Close
            aria-label={closeLabel}
            className="-m-2 inline-flex size-11 items-center justify-center rounded-md text-text-muted hover:bg-surface-muted hover:text-text"
          >
            <X aria-hidden className="size-5" />
          </DialogPrimitive.Close>
        </div>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
