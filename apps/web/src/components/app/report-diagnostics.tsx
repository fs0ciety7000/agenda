'use client';

import { ReportDiagnostics } from '@agenda/contracts';
import { useTranslations } from 'next-intl';

/** Toujours dans le même ordre (la base ne garde pas celui des clés JSON). */
const KEYS = Object.keys(ReportDiagnostics.shape) as (keyof ReportDiagnostics)[];

/** Informations techniques d'un signalement, lisibles (aperçu avant envoi, administration). */
export function DiagnosticsList({
  diagnostics,
  className,
}: {
  diagnostics: ReportDiagnostics;
  className?: string;
}) {
  const t = useTranslations('report');
  const show = (v: unknown) =>
    v === true
      ? t('yes')
      : v === false
        ? t('no')
        : v === null || v === undefined || v === ''
          ? '—'
          : String(v);
  return (
    <dl className={`grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 break-all ${className ?? ''}`}>
      {KEYS.filter((k) => k in diagnostics).map((k) => (
        <div key={k} className="contents">
          <dt className="text-text-muted">{t(`diag.${k}`)}</dt>
          <dd>{show(diagnostics[k])}</dd>
        </div>
      ))}
    </dl>
  );
}
