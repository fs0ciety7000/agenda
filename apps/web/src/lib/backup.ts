'use client';

import type { RestoreResultDto, RevealNoteInput } from '@agenda/contracts';
import { useMutation } from '@tanstack/react-query';
import { api } from './api';

/** Fait télécharger un fichier reçu (sans quitter la page). */
export function saveFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Nom du fichier de sauvegarde, daté du jour. */
export const backupFilename = (day = new Date().toISOString().slice(0, 10)) =>
  `tandem-foyer-${day}.zip`;

/**
 * Sauvegarde du foyer (.zip) : téléchargée après vérification (mot de passe ou confirmation,
 * comme pour les notes sensibles) ; restaurée sur cette instance depuis un compte sans foyer.
 */
export function useBackup(hid?: string) {
  return {
    download: useMutation({
      mutationFn: (input: RevealNoteInput) =>
        api<Blob>(`/v1/households/${hid}/backup`, { method: 'POST', json: input, blob: true }),
      onSuccess: (blob) => saveFile(blob, backupFilename()),
    }),
    restore: useMutation({
      mutationFn: (file: File) => {
        const body = new FormData();
        body.append('file', file);
        return api<RestoreResultDto>('/v1/households/restore', { method: 'POST', body });
      },
    }),
  };
}
