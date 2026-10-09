'use client';

import { CreateHouseholdInput, type HouseholdDto, type RestoreResultDto } from '@agenda/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { AndroidAppCard } from '@/components/app/android-app-card';
import { InviteLink } from '@/components/app/invite-link';
import { RestoreBackup, RestoredInvitations } from '@/components/app/restore-backup';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { api, errorKey } from '@/lib/api';
import { connectUrl, useCalendarStatus } from '@/lib/calendar';
import { queryKeys, useMe } from '@/lib/queries';

const Form = CreateHouseholdInput.pick({ name: true, memberDisplayName: true });
type FormValues = z.input<typeof Form>;

/**
 * Onboarding : 1. créer le foyer 2. inviter l'autre personne 3. (si activé sur le serveur)
 * connecter le calendrier partagé ; puis l'app Android si elle est publiée.
 */
export default function OnboardingPage() {
  const t = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();
  const me = useMe();
  const [household, setHousehold] = useState<HouseholdDto | null>(null);
  const [restored, setRestored] = useState<RestoreResultDto | null>(null);
  const restoredHeading = useRef<HTMLHeadingElement>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    getValues,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(Form) });
  const inviteHeading = useRef<HTMLHeadingElement>(null);

  // Le prénom du compte arrive après le premier rendu : pré-remplir sans écraser une saisie.
  useEffect(() => {
    if (me.data?.displayName && !getValues('memberDisplayName')) {
      setValue('memberDisplayName', me.data.displayName);
    }
  }, [me.data?.displayName, getValues, setValue]);

  // Étape suivante : y amener le focus (clavier, lecteur d'écran).
  useEffect(() => {
    if (household) inviteHeading.current?.focus();
  }, [household]);
  useEffect(() => {
    if (restored) restoredHeading.current?.focus();
  }, [restored]);

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      const created = await api<HouseholdDto>('/v1/households', { method: 'POST', json: values });
      queryClient.setQueryData<HouseholdDto[]>(queryKeys.households, (prev) => [
        ...(prev ?? []),
        created,
      ]);
      setHousehold(created);
    } catch (e) {
      setServerError(t(`errors.${errorKey(e)}` as 'errors.generic'));
    }
  });

  return (
    <main
      id="main"
      className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center gap-8 px-4 py-12"
    >
      <div className="flex flex-col gap-2">
        <Image src="/icons/icon-192.png" alt="" width={64} height={64} priority className="mb-4" />
        <h1 className="text-[2rem] font-semibold leading-tight tracking-tight">
          {t('onboarding.welcome')}
        </h1>
        <p className="text-[1.0625rem] text-text-muted">{t('onboarding.tagline')}</p>
      </div>

      {restored && (
        <Card className="flex flex-col gap-4">
          <h2 ref={restoredHeading} tabIndex={-1} className="text-lg font-semibold outline-none">
            ✓ {t('backup.restoredTitle', { name: restored.household.name })}
          </h2>
          <p className="text-[0.9375rem] text-text-muted">{t('backup.restoredBody')}</p>
          <RestoredInvitations result={restored} />
          <Button onClick={() => router.replace('/')} size="lg" className="self-end">
            {t('onboarding.continue')}
          </Button>
        </Card>
      )}

      {!restored && (
        <Card className="flex flex-col gap-5">
          <h2 className="text-lg font-semibold">
            <span className="mr-2 text-text-muted">1.</span>
            {t('onboarding.stepHousehold')}
          </h2>
          {household ? (
            <p className="text-[0.9375rem]">✓ {household.name}</p>
          ) : (
            <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
              <Field
                label={t('onboarding.householdName')}
                placeholder={t('onboarding.householdNamePlaceholder')}
                error={errors.name && t('errors.required')}
                {...register('name')}
              />
              <Field
                label={t('onboarding.yourName')}
                hint={t('onboarding.yourNameHint')}
                autoComplete="given-name"
                {...register('memberDisplayName')}
              />
              {serverError && (
                <p role="alert" className="text-sm text-danger">
                  {serverError}
                </p>
              )}
              <Button type="submit" loading={isSubmitting} className="self-start">
                {t('onboarding.create')}
              </Button>
            </form>
          )}
        </Card>
      )}

      {!household && !restored && <RestoreBackup onRestored={setRestored} />}

      {household && (
        <Card className="flex flex-col gap-4">
          <h2 ref={inviteHeading} tabIndex={-1} className="text-lg font-semibold outline-none">
            <span className="mr-2 text-text-muted">2.</span>
            {t('onboarding.stepInvite')}
          </h2>
          <InviteLink householdId={household.id} />
        </Card>
      )}

      {household && <CalendarStep householdId={household.id} />}
      {household && <AndroidAppCard />}

      {household && (
        <Button onClick={() => router.replace('/')} size="lg" className="self-end">
          {t('onboarding.continue')}
        </Button>
      )}
    </main>
  );
}

/** Facultatif, et seulement si l'intégration Google est activée sur ce serveur. */
function CalendarStep({ householdId }: { householdId: string }) {
  const t = useTranslations('onboarding');
  const status = useCalendarStatus(householdId);
  if (!status.data?.configured || status.data.connection) return null;
  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">
        <span className="mr-2 text-text-muted">3.</span>
        {t('stepCalendar')}
      </h2>
      <p className="text-[0.9375rem] text-text-muted">{t('calendarBody')}</p>
      <Button asChild variant="secondary" className="self-start">
        <a href={connectUrl('/settings')}>{t('connectCalendar')}</a>
      </Button>
    </Card>
  );
}
