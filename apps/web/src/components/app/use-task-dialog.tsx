'use client';

import type { OccurrenceDto } from '@agenda/contracts';
import { useState } from 'react';
import { TaskFormDialog, type TaskDraft } from './task-form';

/** Un seul formulaire par page : création (avec brouillon) ou modification. */
export function useTaskDialog() {
  const [state, setState] = useState<{
    open: boolean;
    occurrence?: OccurrenceDto | null;
    draft?: TaskDraft;
  }>({
    open: false,
  });
  return {
    openNew: (draft?: TaskDraft) => setState({ open: true, occurrence: null, draft }),
    openEdit: (occurrence: OccurrenceDto) => setState({ open: true, occurrence }),
    dialog: (
      <TaskFormDialog
        open={state.open}
        onOpenChange={(open) => setState((s) => ({ ...s, open }))}
        occurrence={state.occurrence}
        draft={state.draft}
      />
    ),
  };
}
