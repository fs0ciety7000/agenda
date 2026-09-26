'use client';

import { useEffect } from 'react';
import { reportError } from '@/lib/report-error';

/** Dernier recours (la mise en page elle-même a échoué) : pas de traductions disponibles. */
export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => reportError(error, 'global'), [error]);
  return (
    <html lang="fr">
      <body
        style={{
          fontFamily: 'system-ui, sans-serif',
          padding: 24,
          maxWidth: 420,
          margin: '15vh auto',
        }}
      >
        <h1>Une erreur est survenue</h1>
        <p>L’erreur a été signalée. Rechargez la page pour réessayer.</p>
        <button type="button" onClick={reset} style={{ padding: '10px 16px' }}>
          Réessayer
        </button>
      </body>
    </html>
  );
}
