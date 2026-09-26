'use client';

import { CreateHouseholdInput, type HouseholdDto } from '@agenda/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { InviteLink } from '@/components/app/invite-link';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { api, errorKey } from '@/lib/api';
import { queryKeys, useMe } from '@/lib/queries';

const Form = CreateHouseholdInput.pick({ name: true, memberDisplayName: true });
type FormValues = z.input<typeof Form>;

/** Onboarding : 1. créer le foyer 2. inviter. (Google Calendar : Phase 4, notifications : Phase 6.) */
export default function OnboardingPage() {
  const t = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();
  const me = useMe();
  const [household, setHousehold] = useState<HouseholdDto | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(Form) });

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
        <h1 className="text-[2rem] font-semibold leading-tight tracking-tight">
          {t('onboarding.welcome')}
        </h1>
        <p className="text-[1.0625rem] text-text-muted">{t('onboarding.tagline')}</p>
      </div>

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
              defaultValue={me.data?.displayName}
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

      {household && (
        <Card className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold">
            <span className="mr-2 text-text-muted">2.</span>
            {t('onboarding.stepInvite')}
          </h2>
          <InviteLink householdId={household.id} />
          <Button onClick={() => router.replace('/')} className="self-end">
            {t('onboarding.continue')}
          </Button>
        </Card>
      )}
    </main>
  );
}
