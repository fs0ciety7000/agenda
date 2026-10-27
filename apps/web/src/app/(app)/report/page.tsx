import { Suspense } from 'react';
import { ReportView } from './report-view';

/** Signaler un problème, proposer une idée, poser une question. */
export default function ReportPage() {
  return (
    <Suspense>
      <ReportView />
    </Suspense>
  );
}
