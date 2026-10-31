'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { AbsencesSettings } from '@/components/app/absences';
import { CategoriesSettings } from '@/components/app/categories-settings';
import { useSession } from '@/components/app/household-context';
import { InboundEmailSettings } from '@/components/app/inbound-email';
import { InviteLink } from '@/components/app/invite-link';
import { MemberAvatar } from '@/components/app/member-avatar';
import { SettingsSubpage } from '@/components/app/settings-nav';
import { TemplatesSettings } from '@/components/app/templates';
import { Button } from '@/components/ui/button';
import { Card, SectionTitle } from '@/components/ui/card';

/** Réglages → Foyer : membres, absences, catégories, modèles, ajout par e-mail, journal. */
export default function HouseholdSettingsPage() {
  const t = useTranslations('settings');
  const tb = useTranslations('backup');
  const { household } = useSession();
  return (
    <SettingsSubpage section="household">
      <section className="flex flex-col gap-3" aria-labelledby="s-household">
        <SectionTitle id="s-household">{t('members')}</SectionTitle>
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
                {m.pending && (
                  <span className="text-[0.8125rem] text-text-muted">· {tb('pending')}</span>
                )}
              </li>
            ))}
          </ul>
          {/* Membre restauré pas encore arrivé : un nouveau lien remplace celui qui aurait expiré. */}
          {(household.members.length < 2 || household.members.some((m) => m.pending)) && (
            <InviteLink householdId={household.id} />
          )}
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

      <section className="flex flex-col gap-3" aria-labelledby="s-activity">
        <SectionTitle id="s-activity">{t('activity')}</SectionTitle>
        <Card className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[0.9375rem] text-text-muted">{t('activityHint')}</p>
          <Button asChild variant="secondary">
            <Link href="/history">{t('activityOpen')}</Link>
          </Button>
        </Card>
      </section>
    </SettingsSubpage>
  );
}
