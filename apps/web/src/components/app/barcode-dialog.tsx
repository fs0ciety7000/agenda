'use client';

import type { BarcodeLookupDto } from '@agenda/contracts';
import { isValidBarcode, normalizeBarcode } from '@agenda/domain';
import { Camera, ScanBarcode } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { errorKey } from '@/lib/api';
import { useBarcodeActions } from '@/lib/shopping';

/**
 * Ajouter un article par son code-barres : photo lue sur le serveur (ou chiffres tapés), nom
 * proposé (mémoire du foyer, sinon Open Food Facts), modifiable ; un nom donné ou corrigé est
 * retenu pour le foyer.
 */
export function BarcodeButton({
  householdId,
  onAdd,
}: {
  householdId: string;
  onAdd: (name: string) => void;
}) {
  const t = useTranslations('barcode');
  const tc = useTranslations('common');
  const te = useTranslations('errors');
  const actions = useBarcodeActions(householdId);
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [result, setResult] = useState<BarcodeLookupDto | null>(null);
  const [name, setName] = useState('');
  const photoRef = useRef<HTMLInputElement>(null);
  const photoId = useId();
  const busy = actions.scan.isPending || actions.lookup.isPending;
  const failed = actions.scan.error ?? actions.lookup.error;

  const reset = () => {
    setCode('');
    setCodeError(null);
    setResult(null);
    setName('');
    actions.scan.reset();
    actions.lookup.reset();
  };
  const show = (r: BarcodeLookupDto) => {
    setResult(r);
    setName(r.name ?? '');
  };
  const search = (e: FormEvent) => {
    e.preventDefault();
    const digits = normalizeBarcode(code);
    if (!isValidBarcode(digits)) return setCodeError(t('invalidCode'));
    setCodeError(null);
    actions.lookup.mutate(digits, { onSuccess: show });
  };
  const add = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || !result?.barcode) return;
    // Nom donné ou corrigé : retenu pour le foyer (sans bloquer l'ajout s'il échoue).
    if (trimmed !== result.name) actions.remember.mutate({ code: result.barcode, name: trimmed });
    onAdd(trimmed);
    setOpen(false);
    // Fermée par le programme (onOpenChange n'est pas appelé) : la prochaine ouverture repart de zéro.
    reset();
  };
  const found = result?.barcode != null;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <Button variant="ghost" onClick={() => setOpen(true)}>
        <ScanBarcode aria-hidden className="size-4" />
        {t('open')}
      </Button>
      <DialogContent title={t('title')} description={t('intro')} closeLabel={tc('close')}>
        {!found ? (
          <div className="flex flex-col gap-4">
            <input
              ref={photoRef}
              id={photoId}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              aria-label={t('photo')}
              className="sr-only"
              tabIndex={-1}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) actions.scan.mutate(file, { onSuccess: show });
              }}
            />
            <Button
              className="self-start"
              loading={actions.scan.isPending}
              onClick={() => photoRef.current?.click()}
            >
              <Camera aria-hidden className="size-4" />
              {actions.scan.isPending ? t('reading') : t('photo')}
            </Button>
            {result && !found && (
              <p role="status" className="text-[0.9375rem] text-text">
                {t('notRead')}
              </p>
            )}
            {failed && (
              <p role="alert" className="text-sm text-danger">
                {te(errorKey(failed) as 'generic')}
              </p>
            )}
            <form onSubmit={search} className="flex flex-col gap-2" noValidate>
              <Field
                label={t('code')}
                hint={t('codeHint')}
                error={codeError ?? undefined}
                value={code}
                inputMode="numeric"
                autoComplete="off"
                maxLength={20}
                onChange={(e) => setCode(e.target.value)}
              />
              <Button
                type="submit"
                variant="secondary"
                className="self-start"
                loading={actions.lookup.isPending}
                disabled={busy || !code.trim()}
              >
                {t('search')}
              </Button>
            </form>
          </div>
        ) : (
          <form onSubmit={add} className="flex flex-col gap-3">
            <p className="text-[0.8125rem] tabular-nums text-text-muted">
              {t('codeLabel', { code: result.barcode! })}
            </p>
            <Field
              label={t('name')}
              hint={t(
                result.source === 'HOUSEHOLD'
                  ? 'fromHousehold'
                  : result.source === 'OPEN_FOOD_FACTS'
                    ? 'fromOff'
                    : 'unknown',
              )}
              value={name}
              maxLength={200}
              autoFocus
              autoComplete="off"
              onChange={(e) => setName(e.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={!name.trim()}>
                {t('add')}
              </Button>
              <Button type="button" variant="ghost" onClick={reset}>
                {t('again')}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
