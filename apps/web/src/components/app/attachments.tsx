'use client';

import { ATTACHMENT_MAX_BYTES, type AttachmentDto, type OccurrenceDto } from '@agenda/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { FileText, Image as ImageIcon, Paperclip, Trash2 } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { api, errorKey } from '@/lib/api';

/** Pièces jointes d'une tâche (facture, photo…) : ouvrir, ajouter, supprimer. */
export function Attachments({ hid, occurrence }: { hid: string; occurrence: OccurrenceDto }) {
  const t = useTranslations('attachments');
  const te = useTranslations('errors');
  const format = useFormatter();
  const toast = useToast();
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<AttachmentDto[]>(occurrence.attachments);
  const [busy, setBusy] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ['households', hid, 'occurrences'] });

  const size = (n: number) =>
    n < 1024 * 1024
      ? t('kb', { n: format.number(Math.max(1, Math.round(n / 1024))) })
      : t('mb', { n: format.number(n / 1024 / 1024, { maximumFractionDigits: 1 }) });

  const onPick = async (list: FileList | null) => {
    const file = list?.[0];
    if (input.current) input.current.value = '';
    if (!file) return;
    if (file.size > ATTACHMENT_MAX_BYTES) {
      toast({ message: te('ATTACHMENT_TOO_LARGE'), tone: 'error' });
      return;
    }
    setBusy(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const o = await api<OccurrenceDto>(
        `/v1/households/${hid}/occurrences/${occurrence.id}/attachments`,
        { method: 'POST', body },
      );
      setFiles(o.attachments);
      void refresh();
    } catch (e) {
      toast({ message: te(errorKey(e) as 'generic'), tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const onRemove = async (a: AttachmentDto) => {
    if (!window.confirm(t('confirmDelete', { name: a.filename }))) return;
    try {
      await api<void>(`/v1/households/${hid}/attachments/${a.id}`, { method: 'DELETE' });
      setFiles((list) => list.filter((x) => x.id !== a.id));
      void refresh();
    } catch (e) {
      toast({ message: te(errorKey(e) as 'generic'), tone: 'error' });
    }
  };

  return (
    <section aria-labelledby="attachments-title" className="flex flex-col gap-2">
      <h3 id="attachments-title" className="text-sm font-medium">
        {t('title')}
      </h3>
      {files.length > 0 && (
        <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
          {files.map((a) => {
            const Icon = a.contentType.startsWith('image/') ? ImageIcon : FileText;
            return (
              <li key={a.id} className="flex min-h-11 items-center gap-2 pl-3">
                <Icon aria-hidden className="size-4 shrink-0 text-text-muted" />
                <a
                  href={`/v1/households/${hid}/attachments/${a.id}`}
                  target="_blank"
                  rel="noopener"
                  className="min-w-0 flex-1 truncate py-2 text-[0.9375rem] underline-offset-4 hover:underline"
                >
                  {a.filename}
                </a>
                <span className="shrink-0 text-[0.8125rem] text-text-muted">{size(a.size)}</span>
                <button
                  type="button"
                  onClick={() => void onRemove(a)}
                  aria-label={t('delete', { name: a.filename })}
                  className="flex size-11 shrink-0 items-center justify-center rounded-md text-text-muted hover:text-danger"
                >
                  <Trash2 aria-hidden className="size-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <input
        ref={input}
        type="file"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => void onPick(e.target.files)}
      />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="self-start"
        loading={busy}
        onClick={() => input.current?.click()}
      >
        <Paperclip aria-hidden className="size-4" />
        {t('add')}
      </Button>
    </section>
  );
}
