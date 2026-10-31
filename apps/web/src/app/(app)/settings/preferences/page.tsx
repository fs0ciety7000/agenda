'use client';

import { useTranslations } from 'next-intl';
import { Suspense, useEffect, useState } from 'react';
import { CalendarSettings } from '@/components/app/calendar-settings';
import { useSession } from '@/components/app/household-context';
import { IcalFeedSettings } from '@/components/app/ical-feed';
import { LanguageSwitcher } from '@/components/app/language-switcher';
import { NotificationSettings } from '@/components/app/notification-settings';
import { SettingsSubpage } from '@/components/app/settings-nav';
import { Card, SectionTitle } from '@/components/ui/card';
import { cn } from '@/lib/cn';
import { applyTheme, readTheme, type ThemePreference } from '@/lib/theme';

const THEMES: ThemePreference[] = ['system', 'light', 'dark'];

/** Réglages → Préférences : apparence, langue, notifications, calendrier. */
export default function PreferencesSettingsPage() {
  const t = useTranslations('settings');
  const { household } = useSession();
  const [theme, setTheme] = useState<ThemePreference>('system');
  useEffect(() => {
    setTheme(readTheme());
  }, []);

  return (
    <SettingsSubpage section="preferences">
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

      <section className="flex flex-col gap-3" aria-labelledby="s-language">
        <SectionTitle id="s-language">{t('language')}</SectionTitle>
        <LanguageSwitcher account label={t('language')} />
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="s-notifications">
        <SectionTitle id="s-notifications">{t('notifications')}</SectionTitle>
        <Card>
          <NotificationSettings />
        </Card>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="s-calendar">
        <SectionTitle id="s-calendar">{t('calendar')}</SectionTitle>
        <Card className="flex flex-col gap-4">
          <Suspense>
            <CalendarSettings />
          </Suspense>
          <IcalFeedSettings householdId={household.id} />
        </Card>
      </section>
    </SettingsSubpage>
  );
}
