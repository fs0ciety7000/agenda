'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { DeviceSessions } from '@/components/app/device-sessions';
import { PasskeySettings } from '@/components/app/passkeys';
import { PasswordSettings } from '@/components/app/password-settings';
import { SettingsSubpage } from '@/components/app/settings-nav';
import { TwoFactorSettings } from '@/components/app/two-factor-settings';
import { Button } from '@/components/ui/button';
import { Card, SectionTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import { clearOfflineData } from '@/lib/offline';

/** Réglages → Compte et sécurité : connexion, appareils, déconnexion. */
export default function AccountSettingsPage() {
  const t = useTranslations('settings');
  const router = useRouter();
  const queryClient = useQueryClient();
  const signOut = useMutation({
    mutationFn: (all: boolean) =>
      api<void>(all ? '/v1/auth/logout-all' : '/v1/auth/logout', { method: 'POST', json: {} }),
    onSettled: async () => {
      queryClient.clear();
      await clearOfflineData();
      router.replace('/login');
    },
  });

  return (
    <SettingsSubpage section="account">
      <section className="flex flex-col gap-3" aria-labelledby="s-account">
        <SectionTitle id="s-account">{t('signIn')}</SectionTitle>
        <Card className="flex flex-col gap-4">
          <PasswordSettings />
          <PasskeySettings />
          <TwoFactorSettings />
        </Card>
      </section>
      {/* Les appareils portent leur propre titre (« Appareils connectés »). */}
      <section className="flex flex-col gap-3">
        <Card className="flex flex-col gap-4">
          <DeviceSessions />
        </Card>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            variant="secondary"
            onClick={() => signOut.mutate(false)}
            loading={signOut.isPending && !signOut.variables}
          >
            {t('logout')}
          </Button>
          <Button
            variant="ghost"
            onClick={() => signOut.mutate(true)}
            loading={signOut.isPending && signOut.variables}
          >
            {t('logoutAll')}
          </Button>
        </div>
      </section>
    </SettingsSubpage>
  );
}
