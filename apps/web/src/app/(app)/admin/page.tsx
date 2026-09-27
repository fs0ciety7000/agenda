'use client';

import type { AdminUserDto, BackupRunDto } from '@agenda/contracts';
import {
  CheckCircle2,
  CircleSlash,
  DatabaseBackup,
  LogOut,
  Mail,
  BellRing,
  KeyRound,
  Trash2,
  UserPlus,
  XCircle,
} from 'lucide-react';
import { useFormatter, useNow, useTranslations } from 'next-intl';
import { notFound } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { AdminMonitoring } from '@/components/app/admin-monitoring';
import { useSession } from '@/components/app/household-context';
import { Button } from '@/components/ui/button';
import { Card, SectionTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { errorKey } from '@/lib/api';
import { useAdminActions, useAdminHouseholds, useAdminOverview, useAdminUsers } from '@/lib/admin';
import { cn } from '@/lib/cn';

/** Administration de l'instance (adresses ADMIN_EMAILS). Aucun contenu des foyers, des chiffres. */
export default function AdminPage() {
  const t = useTranslations('admin');
  const { me } = useSession();
  if (!me.isAdmin) notFound();
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="mt-1 text-[0.9375rem] text-text-muted">{t('intro')}</p>
      </div>
      <Overview />
      <AdminMonitoring />
      <Backups />
      <Tools />
      <Users />
      <Households />
    </div>
  );
}

function useBytes() {
  const format = useFormatter();
  return (n: number) =>
    n < 1024 * 1024
      ? `${format.number(Math.max(0, Math.round(n / 1024)))} Ko`
      : n < 1024 ** 3
        ? `${format.number(n / 1024 / 1024, { maximumFractionDigits: 1 })} Mo`
        : `${format.number(n / 1024 ** 3, { maximumFractionDigits: 2 })} Go`;
}

function Overview() {
  const t = useTranslations('admin');
  const overview = useAdminOverview();
  const bytes = useBytes();
  const format = useFormatter();
  if (!overview.data) return <Skeleton className="h-40 w-full" />;
  const { counts, storage, calendar, integrations, registrationEnabled, uptimeSeconds } =
    overview.data;
  const tiles: [string, number | string][] = [
    [t('counts.users'), counts.users],
    [t('counts.households'), counts.households],
    [t('counts.tasks'), counts.tasks],
    [t('counts.openOccurrences'), counts.openOccurrences],
    [t('counts.doneLast7Days'), counts.doneLast7Days],
    [t('counts.shoppingItems'), counts.shoppingItems],
    [t('counts.comments'), counts.comments],
    [t('counts.attachments'), `${counts.attachments} · ${bytes(storage.attachmentsBytes)}`],
    [t('counts.database'), bytes(storage.databaseBytes)],
  ];
  const calendarErrors = (calendar.ERROR ?? 0) + (calendar.BLOCKED ?? 0);
  return (
    <section aria-labelledby="a-overview" className="flex flex-col gap-3">
      <SectionTitle id="a-overview">{t('overview')}</SectionTitle>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {tiles.map(([label, value]) => (
          <Card key={label} className="flex flex-col gap-1 p-4">
            <dt className="text-[0.8125rem] text-text-muted">{label}</dt>
            <dd className="text-xl font-semibold tabular-nums">{value}</dd>
          </Card>
        ))}
      </dl>
      <Card className="flex flex-col gap-3">
        <ul className="grid gap-2 sm:grid-cols-2" aria-label={t('integrations')}>
          {integrations.map((i) => (
            <li key={i.key} className="flex items-center gap-2 text-[0.9375rem]">
              {i.enabled ? (
                <CheckCircle2 aria-hidden className="size-4 text-success" />
              ) : (
                <CircleSlash aria-hidden className="size-4 text-text-muted" />
              )}
              <span>{t(`integration.${i.key}` as 'integration.email')}</span>
              <span className="sr-only">{t(i.enabled ? 'enabled' : 'disabled')}</span>
            </li>
          ))}
          <li className="flex items-center gap-2 text-[0.9375rem]">
            {registrationEnabled ? (
              <CheckCircle2 aria-hidden className="size-4 text-success" />
            ) : (
              <CircleSlash aria-hidden className="size-4 text-text-muted" />
            )}
            {t(registrationEnabled ? 'registrationOpen' : 'registrationClosed')}
          </li>
        </ul>
        <p className="text-[0.8125rem] text-text-muted">
          {t('calendarStatus', {
            synced: calendar.SYNCED ?? 0,
            pending: (calendar.PENDING ?? 0) + (calendar.SYNCING ?? 0),
            errors: calendarErrors,
          })}{' '}
          ·{' '}
          {t('uptime', {
            hours: format.number(uptimeSeconds / 3600, { maximumFractionDigits: 1 }),
          })}
        </p>
      </Card>
    </section>
  );
}

function Backups() {
  const t = useTranslations('admin');
  const te = useTranslations('errors');
  const overview = useAdminOverview();
  const { backup } = useAdminActions();
  const toast = useToast();
  const format = useFormatter();
  const now = useNow({ updateInterval: 10_000 });
  const bytes = useBytes();
  const runs = overview.data?.backups ?? [];
  const busy = runs.some((b) => b.status === 'PENDING' || b.status === 'RUNNING');
  return (
    <section aria-labelledby="a-backups" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionTitle id="a-backups">{t('backups')}</SectionTitle>
        <Button
          variant="secondary"
          disabled={busy || backup.isPending}
          onClick={() =>
            backup.mutate(undefined, {
              onSuccess: () => toast({ message: t('backupRequested') }),
              onError: (e) => toast({ message: te(errorKey(e) as 'generic'), tone: 'error' }),
            })
          }
        >
          <DatabaseBackup aria-hidden className="size-4" />
          {busy ? t('backupRunning') : t('backupNow')}
        </Button>
      </div>
      <p className="-mt-1 text-[0.8125rem] text-text-muted">{t('backupsHint')}</p>
      {runs.length === 0 ? (
        <p className="text-[0.9375rem] text-text-muted">{t('noBackup')}</p>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-left text-[0.875rem]">
            <caption className="sr-only">{t('backups')}</caption>
            <thead className="text-[0.8125rem] text-text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">{t('col.when')}</th>
                <th className="px-4 py-2 font-medium">{t('col.status')}</th>
                <th className="px-4 py-2 font-medium">{t('col.details')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {runs.map((b) => (
                <tr key={b.id}>
                  <td className="whitespace-nowrap px-4 py-2">
                    {format.relativeTime(new Date(b.finishedAt ?? b.startedAt ?? b.createdAt), now)}
                    <span className="block text-[0.8125rem] text-text-muted">
                      {t(`trigger.${b.trigger as 'manual'}`)}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <BackupStatus run={b} />
                  </td>
                  <td className="px-4 py-2 text-text-muted">
                    {[
                      b.sizeBytes != null ? bytes(b.sizeBytes) : null,
                      b.summary,
                      b.status === 'OK' ? t(b.offsite ? 'offsite' : 'localOnly') : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </section>
  );
}

function BackupStatus({ run }: { run: BackupRunDto }) {
  const t = useTranslations('admin.status');
  const cls =
    run.status === 'OK'
      ? 'text-success'
      : run.status === 'FAILED'
        ? 'text-danger'
        : 'text-text-muted';
  return <span className={cn('font-medium', cls)}>{t(run.status)}</span>;
}

function Tools() {
  const t = useTranslations('admin');
  const { testEmail, testPush } = useAdminActions();
  const toast = useToast();
  return (
    <section aria-labelledby="a-tools" className="flex flex-col gap-3">
      <SectionTitle id="a-tools">{t('tools')}</SectionTitle>
      <Card className="flex flex-wrap gap-3">
        <Button
          variant="secondary"
          disabled={testEmail.isPending}
          onClick={() =>
            testEmail.mutate(undefined, {
              onSuccess: (r) =>
                toast({
                  message: r.ok
                    ? t('testEmailOk', { to: r.detail ?? '' })
                    : t('testEmailFailed', { detail: r.detail ?? '' }),
                  tone: r.ok ? undefined : 'error',
                }),
            })
          }
        >
          <Mail aria-hidden className="size-4" />
          {t('testEmail')}
        </Button>
        <Button
          variant="secondary"
          disabled={testPush.isPending}
          onClick={() =>
            testPush.mutate(undefined, {
              onSuccess: (r) => {
                const m = /phones=(\d+);browsers=(\d+)/.exec(r.detail ?? '');
                toast({
                  message: t('testPushResult', { phones: m?.[1] ?? '0', browsers: m?.[2] ?? '0' }),
                  tone: r.ok ? undefined : 'error',
                });
              },
            })
          }
        >
          <BellRing aria-hidden className="size-4" />
          {t('testPush')}
        </Button>
      </Card>
    </section>
  );
}

function Users() {
  const t = useTranslations('admin');
  const te = useTranslations('errors');
  const users = useAdminUsers();
  const { createUser, userAction } = useAdminActions();
  const toast = useToast();
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const { me } = useSession();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [locale, setLocale] = useState<'fr' | 'en'>('fr');
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const shown = (users.data ?? []).filter(
    (u) =>
      !q ||
      u.email.toLowerCase().includes(q) ||
      u.displayName.toLowerCase().includes(q) ||
      u.households.some((h) => h.toLowerCase().includes(q)),
  );

  const submit = (e: FormEvent) => {
    e.preventDefault();
    createUser.mutate(
      { email, displayName: name, locale },
      {
        onSuccess: () => {
          toast({ message: t('userCreated', { email }) });
          setEmail('');
          setName('');
        },
        onError: (err) => toast({ message: te(errorKey(err) as 'generic'), tone: 'error' }),
      },
    );
  };

  const act = (
    u: AdminUserDto,
    action: 'disable' | 'enable' | 'logout-all' | 'password-link' | 'delete',
  ) => {
    if (action === 'delete' && !window.confirm(t('confirmDelete', { email: u.email }))) return;
    if (action === 'disable' && !window.confirm(t('confirmDisable', { email: u.email }))) return;
    userAction.mutate(
      { id: u.id, action },
      {
        onSuccess: () => toast({ message: t(`done.${action}`, { email: u.email }) }),
        onError: (err) => toast({ message: te(errorKey(err) as 'generic'), tone: 'error' }),
      },
    );
  };

  return (
    <section aria-labelledby="a-users" className="flex flex-col gap-3">
      <SectionTitle id="a-users">{t('users')}</SectionTitle>
      <Card>
        <form
          onSubmit={submit}
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_8rem] lg:items-end"
        >
          <Field
            label={t('newEmail')}
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Field
            label={t('newName')}
            required
            maxLength={60}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Select
            label={t('newLocale')}
            value={locale}
            onChange={(e) => setLocale(e.target.value as 'fr' | 'en')}
          >
            <option value="fr">Français</option>
            <option value="en">English</option>
          </Select>
          <div className="sm:col-span-2 lg:col-span-3">
            <Button type="submit" disabled={createUser.isPending}>
              <UserPlus aria-hidden className="size-4" />
              {t('createUser')}
            </Button>
          </div>
        </form>
        <p className="mt-2 text-[0.8125rem] text-text-muted">{t('createHint')}</p>
      </Card>
      {(users.data?.length ?? 0) > 5 && (
        <Field
          label={t('search')}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      )}
      {!users.data ? (
        <Skeleton className="h-32 w-full" />
      ) : (
        <ul aria-label={t('users')} className="flex flex-col gap-2">
          {shown.slice(0, 100).map((u) => {
            const self = u.id === me.id;
            return (
              <li key={u.id}>
                <Card className="flex flex-col gap-2 p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-medium">
                      {u.displayName}{' '}
                      <span className="font-normal text-text-muted">· {u.email}</span>
                    </p>
                    <p className="flex flex-wrap gap-1.5 text-[0.75rem]">
                      {u.isAdmin && <Badge>{t('badge.admin')}</Badge>}
                      {u.disabled && <Badge tone="danger">{t('badge.disabled')}</Badge>}
                      {!u.hasPassword && !u.googleLinked && <Badge>{t('badge.invited')}</Badge>}
                      {u.googleLinked && <Badge>Google</Badge>}
                    </p>
                  </div>
                  <p className="text-[0.8125rem] text-text-muted">
                    {[
                      u.households.length ? u.households.join(', ') : t('noHousehold'),
                      t('createdAt', {
                        date: format.dateTime(new Date(u.createdAt), { dateStyle: 'medium' }),
                      }),
                      u.lastSeenAt
                        ? t('lastSeen', { when: format.relativeTime(new Date(u.lastSeenAt), now) })
                        : t('neverSeen'),
                      t('devices', { count: u.activeSessions }),
                    ].join(' · ')}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="ghost" onClick={() => act(u, 'password-link')}>
                      <KeyRound aria-hidden className="size-4" />
                      {t(u.hasPassword ? 'sendReset' : 'sendWelcome')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={u.activeSessions === 0}
                      onClick={() => act(u, 'logout-all')}
                    >
                      <LogOut aria-hidden className="size-4" />
                      {t('logoutAll')}
                    </Button>
                    {!self && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => act(u, u.disabled ? 'enable' : 'disable')}
                      >
                        {u.disabled ? (
                          <CheckCircle2 aria-hidden className="size-4" />
                        ) : (
                          <XCircle aria-hidden className="size-4" />
                        )}
                        {t(u.disabled ? 'enable' : 'disable')}
                      </Button>
                    )}
                    {!self && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-danger"
                        onClick={() => act(u, 'delete')}
                      >
                        <Trash2 aria-hidden className="size-4" />
                        {t('delete')}
                      </Button>
                    )}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone?: 'danger' }) {
  return (
    <span
      className={cn(
        'rounded-full border px-2 py-0.5',
        tone === 'danger' ? 'border-danger text-danger' : 'border-border text-text-muted',
      )}
    >
      {children}
    </span>
  );
}

function Households() {
  const t = useTranslations('admin');
  const households = useAdminHouseholds();
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const bytes = useBytes();
  return (
    <section aria-labelledby="a-households" className="flex flex-col gap-3">
      <SectionTitle id="a-households">{t('households')}</SectionTitle>
      {!households.data ? (
        <Skeleton className="h-24 w-full" />
      ) : (
        <ul aria-label={t('households')} className="flex flex-col gap-2">
          {households.data.map((h) => (
            <li key={h.id}>
              <Card className="flex flex-col gap-1 p-4">
                <p className="font-medium">{h.name}</p>
                <p className="text-[0.875rem]">
                  {h.members
                    .map(
                      (m) =>
                        `${m.displayName}${m.email ? ` (${m.email})` : ''}${m.role === 'OWNER' ? ' ★' : ''}`,
                    )
                    .join(', ')}
                </p>
                <p className="text-[0.8125rem] text-text-muted">
                  {[
                    t('hhTasks', { count: h.tasks, open: h.openOccurrences }),
                    bytes(h.attachmentsBytes),
                    h.lastActivityAt
                      ? t('lastActivity', {
                          when: format.relativeTime(new Date(h.lastActivityAt), now),
                        })
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
