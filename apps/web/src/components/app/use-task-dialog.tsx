'use client';

import type { OccurrenceDto } from '@agenda/contracts';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import type { TaskDraft } from './task-form';

// Le formulaire (répétition, commentaires, pièces jointes…) pèse lourd : chargé à la première
// ouverture plutôt qu'au démarrage de chaque page.
const TaskFormDialog = dynamic(() => import('./task-form').then((m) => m.TaskFormDialog), {
  ssr: false,
});

/** Un seul formulaire par page : création (avec brouillon) ou modification. */
export function useTaskDialog() {
  const [state, setState] = useState<{
    open: boolean;
    occurrence?: OccurrenceDto | null;
    draft?: TaskDraft;
  }>({
    open: false,
  });
  // Monté dès la première ouverture, puis gardé (animation de fermeture, retour du focus).
  const [used, setUsed] = useState(false);
  const open = (next: typeof state) => {
    setUsed(true);
    setState(next);
  };
  return {
    openNew: (draft?: TaskDraft) => open({ open: true, occurrence: null, draft }),
    openEdit: (occurrence: OccurrenceDto) => open({ open: true, occurrence }),
    dialog: used ? (
      <TaskFormDialog
        open={state.open}
        onOpenChange={(isOpen) => setState((s) => ({ ...s, open: isOpen }))}
        occurrence={state.occurrence}
        draft={state.draft}
      />
    ) : null,
  };
}
