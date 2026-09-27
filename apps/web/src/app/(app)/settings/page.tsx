'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense, useEffect, useState } from 'react';
import { useSession } from '@/components/app/household-context';
import { CalendarSettings } from '@/components/app/calendar-settings';
import { CategoriesSettings } from '@/components/app/categories-settings';
import { TemplatesSettings } from '@/components/app/templates';
import { InboundEmailSettings } from '@/components/app/inbound-email';
import { AbsencesSettings } from '@/components/app/absences';
import { InviteLink } from '@/components/app/invite-link';
import { AndroidAppCard } from '@/components/app/android-app-card';
import { NotificationSettings } from '@/components/app/notification-settings';
import { PasswordSettings } from '@/components/app/password-settings';
import { PrivacySettings } from '@/components/app/privacy-settings';
import { MemberAvatar } from '@/components/app/member-avatar';
import { Button } from '@/components/ui/button';
import { Card, SectionTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { clearOfflineData } from '@/lib/offline';
import { applyTheme, readTheme, type ThemePreference } from '@/lib/theme';

const THEMES: ThemePreference[] = ['system', 'light', 'dark'];

export default function SettingsPage() {
  const t = useTranslations('settings');
  const router = useRouter();
  const queryClient = useQueryClient();
  const { household, me } = useSession();
  const [theme, setTheme] = useState<ThemePreference>('system');
  useEffect(() => setTheme(readTheme()), []);

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
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>

      <section className="flex flex-col gap-3" aria-labelledby="s-household">
        <SectionTitle id="s-household">{t('household')}</SectionTitle>
        <Card className="flex flex-col gap-5">
          <p className="text-lg font-medium">{household.name}</p>
          <ul aria-label={t('members')} className="flex flex-col gap-3">
            {household.members.map((m) => (
              <li key={m.id} className="flex items-center gap-3">
                <MemberAvatar member={m} />
                <span className="text-[0.9375rem]">{m.displayName}</span>
                {m.role === 'OWNER' && (
                  <span className="text-[0.8125rem] text-text-muted">· {t('owner')}</span>
                )}
              </li>
            ))}
          </ul>
          {household.members.length < 2 && <InviteLink householdId={household.id} />}
        </Card>
      </section>

      <AbsencesSettings />

      <section className="flex flex-col gap-3" aria-labelledby="s-categories">
        <SectionTitle id="s-categories">{t('categories')}</SectionTitle>
        <Card>
          <CategoriesSettings />
        </Card>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="s-templates">
        <SectionTitle id="s-templates">{t('templates')}</SectionTitle>
        <Card>
          <TemplatesSettings />
        </Card>
      </section>

      <InboundEmailSettings householdId={household.id} />

      {me.isAdmin && (
        <section className="flex flex-col gap-3" aria-labelledby="s-admin">
          <SectionTitle id="s-admin">{t('admin')}</SectionTitle>
          <Card className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[0.9375rem] text-text-muted">{t('adminHint')}</p>
            <Button asChild variant="secondary">
              <Link href="/admin">{t('adminOpen')}</Link>
            </Button>
          </Card>
        </section>
      )}

      <section className="flex flex-col gap-3" aria-labelledby="s-activity">
        <SectionTitle id="s-activity">{t('activity')}</SectionTitle>
        <Card className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[0.9375rem] text-text-muted">{t('activityHint')}</p>
          <Button asChild variant="secondary">
            <Link href="/history">{t('activityOpen')}</Link>
          </Button>
        </Card>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="s-calendar">
        <SectionTitle id="s-calendar">{t('calendar')}</SectionTitle>
        <Card>
          <Suspense>
            <CalendarSettings />
          </Suspense>
        </Card>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="s-appearance">
        <SectionTitle id="s-appearance">{t('appearance')}</SectionTitle>
        <div
          role="radiogroup"
          aria-labelledby="s-appearance"
          className="inline-flex self-start rounded-md border border-border bg-surface p-1"
        >
          {THEMES.map((value) => (
            <button
              key={value}
              role="radio"
              aria-checked={theme === value}
              onClick={() => {
                applyTheme(value);
                setTheme(value);
              }}
              className={cn(
                'min-h-9 rounded-sm px-4 py-1.5 text-sm text-text-muted transition-colors',
                theme === value && 'bg-surface-muted font-medium text-text',
              )}
            >
              {t(`theme.${value}`)}
            </button>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="s-notifications">
        <SectionTitle id="s-notifications">{t('notifications')}</SectionTitle>
        <Card>
          <NotificationSettings />
        </Card>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="s-privacy">
        <SectionTitle id="s-privacy">{t('privacy')}</SectionTitle>
        <Card>
          <Suspense>
            <PrivacySettings />
          </Suspense>
        </Card>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="s-account">
        <SectionTitle id="s-account">{t('account')}</SectionTitle>
        <Card>
          <PasswordSettings />
        </Card>
        <AndroidAppCard />
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
    </div>
  );
}
