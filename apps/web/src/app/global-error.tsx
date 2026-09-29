'use client';

import { useEffect } from 'react';
import { reportError } from '@/lib/report-error';

const TEXT = {
  fr: {
    title: 'Une erreur est survenue',
    body: 'L’erreur a été signalée. Rechargez la page pour réessayer.',
    retry: 'Réessayer',
  },
  en: {
    title: 'Something went wrong',
    body: 'The error has been reported. Reload the page to try again.',
    retry: 'Try again',
  },
};

/** Dernier recours (la mise en page elle-même a échoué) : pas de traductions chargées, la langue suit celle du document. */
export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => reportError(error, 'global'), [error]);
  const lang =
    typeof document !== 'undefined' && document.documentElement.lang.startsWith('en') ? 'en' : 'fr';
  const t = TEXT[lang];
  return (
    <html lang={lang}>
      <body
        style={{
          fontFamily: 'system-ui, sans-serif',
          padding: 24,
          maxWidth: 420,
          margin: '15vh auto',
        }}
      >
        <h1>{t.title}</h1>
        <p>{t.body}</p>
        <button type="button" onClick={reset} style={{ padding: '10px 16px' }}>
          {t.retry}
        </button>
      </body>
    </html>
  );
}
