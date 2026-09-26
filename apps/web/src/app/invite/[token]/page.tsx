'use client';

import type { HouseholdDto } from '@agenda/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ApiError, api, errorKey } from '@/lib/api';
import { queryKeys, useMe } from '@/lib/queries';

export default function InvitePage() {
  const t = useTranslations();
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const me = useMe();
  const accept = useMutation({
    mutationFn: () =>
      api<HouseholdDto>('/v1/invitations/accept', { method: 'POST', json: { token } }),
    onSuccess: (household) => {
      queryClient.setQueryData<HouseholdDto[]>(queryKeys.households, (prev) => [
        ...(prev ?? []).filter((h) => h.id !== household.id),
        household,
      ]);
      router.replace('/');
    },
  });
  const loggedOut = me.error instanceof ApiError && me.error.status === 401;
  const next = encodeURIComponent(`/invite/${token}`);

  return (
    <main id="main" className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4">
      <Card className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold">{t('invite.title')}</h1>
        <p className="text-[0.9375rem] text-text-muted">
          {loggedOut ? t('invite.loginFirst') : t('invite.body')}
        </p>
        {loggedOut ? (
          <div className="flex gap-3">
            <Button asChild>
              <Link href={`/login?next=${next}`}>{t('auth.toLogin')}</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href={`/register?next=${next}`}>{t('auth.toRegister')}</Link>
            </Button>
          </div>
        ) : (
          <Button
            onClick={() => accept.mutate()}
            loading={accept.isPending || me.isPending}
            className="self-start"
          >
            {t('invite.accept')}
          </Button>
        )}
        {accept.error && (
          <p role="alert" className="text-sm text-danger">
            {t(`errors.${errorKey(accept.error)}` as 'errors.generic')}
          </p>
        )}
      </Card>
    </main>
  );
}
