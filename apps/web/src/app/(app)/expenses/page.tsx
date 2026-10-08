'use client';

import type {
  ExpenseCategory,
  ExpenseDto,
  ExpenseSplit,
  HouseholdMemberDto,
} from '@agenda/contracts';
import { ExpenseCategory as Categories } from '@agenda/contracts';
import { parseAmountToCents } from '@agenda/domain';
import { ArrowRight, ChevronLeft, ChevronRight, Plus, Scale, Wallet } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { useSession } from '@/components/app/household-context';
import { MemberAvatar } from '@/components/app/member-avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Segmented } from '@/components/ui/segmented';
import { Select } from '@/components/ui/select';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { errorKey } from '@/lib/api';
import {
  shiftMonth,
  useExpenseActions,
  useExpenses,
  useExpenseSummary,
  useMoney,
} from '@/lib/expenses';
import { useToday } from '@/lib/format';

const CATEGORY_EMOJI: Record<ExpenseCategory, string> = {
  GROCERIES: '🛒',
  HOUSING: '🏠',
  UTILITIES: '💡',
  TRANSPORT: '🚗',
  LEISURE: '🎉',
  HEALTH: '💊',
  KIDS: '🧸',
  GIFTS: '🎁',
  OTHER: '📦',
};

type Editing = { expense?: ExpenseDto } | null;

/** Dépenses du foyer : qui a payé quoi, la part de chacun, et qui doit combien à qui. */
export default function ExpensesPage() {
  const t = useTranslations('expenses');
  const te = useTranslations('errors');
  const format = useFormatter();
  const money = useMoney();
  const toast = useToast();
  const { household, me } = useSession();
  const today = useToday();
  const [month, setMonth] = useState(() => today.slice(0, 7));
  const expenses = useExpenses(household.id, month);
  const summary = useExpenseSummary(household.id, month);
  const actions = useExpenseActions(household.id);
  const [editing, setEditing] = useState<Editing>(null);
  const [weightsOpen, setWeightsOpen] = useState(false);

  const members = household.members;
  const myMemberId = members.find((m) => m.userId === me.id)?.id;
  const memberName = (id: string | null) =>
    members.find((m) => m.id === id)?.displayName ?? t('formerMember');
  const monthLabel = format.dateTime(new Date(`${month}-15T12:00:00`), {
    month: 'long',
    year: 'numeric',
  });
  const dayLabel = (d: string) =>
    format.dateTime(new Date(`${d}T12:00:00`), { weekday: 'long', day: 'numeric', month: 'long' });

  const list = expenses.data ?? [];
  const groups: { date: string; items: ExpenseDto[] }[] = [];
  for (const e of list) {
    const last = groups[groups.length - 1];
    if (last?.date === e.date) last.items.push(e);
    else groups.push({ date: e.date, items: [e] });
  }

  const s = summary.data;
  const weights = members.map((m) => s?.members.find((x) => x.memberId === m.id)?.weight ?? 1);
  const totalWeight = weights.reduce((a, w) => a + w, 0);
  const weightsLabel = weights.map((w) => Math.round((w / totalWeight) * 100)).join(' / ');

  const settle = (from: string, to: string, amountCents: number) =>
    actions.settle.mutate(
      { fromMemberId: from, toMemberId: to, amountCents, id: crypto.randomUUID() },
      {
        onSuccess: () =>
          toast({ message: t('settled', { from: memberName(from), to: memberName(to) }) }),
        onError: (e) => toast({ message: te(errorKey(e) as 'generic'), tone: 'error' }),
      },
    );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[2rem] font-semibold leading-tight tracking-tight">{t('title')}</h1>
          <p className="text-[0.9375rem] capitalize text-text-muted">{monthLabel}</p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            aria-label={t('prev')}
            onClick={() => setMonth(shiftMonth(month, -1))}
          >
            <ChevronLeft aria-hidden className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label={t('next')}
            onClick={() => setMonth(shiftMonth(month, 1))}
          >
            <ChevronRight aria-hidden className="size-4" />
          </Button>
          <Button onClick={() => setEditing({})}>
            <Plus aria-hidden className="size-4" />
            {t('add')}
          </Button>
        </div>
      </div>

      {/* Solde : qui doit combien à qui, depuis le début. */}
      <Card className="flex flex-col gap-3 p-4" aria-labelledby="balance-title">
        <div className="flex items-center justify-between gap-3">
          <h2 id="balance-title" className="font-semibold">
            {t('balanceTitle')}
          </h2>
          <button
            type="button"
            onClick={() => setWeightsOpen(true)}
            className="inline-flex min-h-11 items-center gap-1.5 text-sm text-accent underline-offset-4 hover:underline"
          >
            <Scale aria-hidden className="size-4" />
            {t('splitLabel', { split: weightsLabel })}
          </button>
        </div>
        {!s ? (
          <Skeleton className="h-10 w-full" />
        ) : s.transfers.length === 0 ? (
          <p className="text-[0.9375rem] text-success">✓ {t('even')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {s.transfers.map((tr) => (
              <li
                key={`${tr.fromMemberId}-${tr.toMemberId}`}
                className="flex flex-wrap items-center justify-between gap-2"
              >
                <span className="text-[1.0625rem]">
                  {t('owes', {
                    from: memberName(tr.fromMemberId),
                    to: memberName(tr.toMemberId),
                    amount: money(tr.amountCents),
                  })}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  loading={actions.settle.isPending}
                  onClick={() => settle(tr.fromMemberId, tr.toMemberId, tr.amountCents)}
                >
                  {t('settle')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Totaux du mois. */}
      {s && (
        <Card className="flex flex-col gap-3 p-4" aria-labelledby="month-title">
          <h2 id="month-title" className="font-semibold">
            {t('monthTitle')}
          </h2>
          <p className="flex justify-between text-[0.9375rem]">
            <span>{t('common')}</span>
            <span className="font-medium tabular-nums">{money(s.commonCents)}</span>
          </p>
          <ul className="flex flex-col gap-2">
            {s.members.map((m) => {
              const member = members.find((x) => x.id === m.memberId);
              return (
                <li key={m.memberId} className="flex items-center gap-3 text-[0.9375rem]">
                  {member && <MemberAvatar member={member} size="sm" />}
                  <span className="flex min-w-0 flex-col">
                    <span>{memberName(m.memberId)}</span>
                    <span className="text-[0.8125rem] text-text-muted tabular-nums">
                      {t('memberLine', { paid: money(m.paidCents), share: money(m.shareCents) })}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="flex justify-between border-t border-border pt-3 text-[0.9375rem]">
            <span>{t('mine')}</span>
            <span className="font-medium tabular-nums">{money(s.mineCents)}</span>
          </p>
          {s.byCategory.length > 0 && (
            <details className="text-[0.9375rem]">
              <summary className="min-h-11 cursor-pointer py-2 text-accent">
                {t('byCategory')}
              </summary>
              <ul className="flex flex-col gap-1.5">
                {s.byCategory.map((c) => (
                  <li key={c.category} className="flex justify-between">
                    <span>
                      <span aria-hidden>{CATEGORY_EMOJI[c.category]} </span>
                      {t(`categories.${c.category}`)}
                    </span>
                    <span className="tabular-nums">{money(c.amountCents)}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </Card>
      )}

      {expenses.error ? (
        <ErrorState
          message={te(errorKey(expenses.error) as 'generic')}
          retryLabel={te('retry')}
          onRetry={() => void expenses.refetch()}
        />
      ) : !expenses.data ? (
        <Skeleton className="h-64 w-full" />
      ) : list.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title={t('emptyTitle')}
          body={t('emptyBody')}
          action={
            <Button onClick={() => setEditing({})}>
              <Plus aria-hidden className="size-4" />
              {t('add')}
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map((g) => (
            <section key={g.date} aria-label={dayLabel(g.date)} className="flex flex-col gap-2">
              <h2 className="text-[0.8125rem] font-medium uppercase tracking-wide text-text-muted">
                {dayLabel(g.date)}
              </h2>
              <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface">
                {g.items.map((e) => (
                  <li key={e.id}>
                    <button
                      type="button"
                      onClick={() => setEditing({ expense: e })}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-muted"
                    >
                      <span aria-hidden className="text-xl">
                        {e.kind === 'SETTLEMENT' ? '↔️' : CATEGORY_EMOJI[e.category]}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="font-medium">
                          {e.kind === 'SETTLEMENT' ? t('settlement') : e.title}
                        </span>
                        <span className="text-[0.8125rem] text-text-muted">
                          {e.kind === 'SETTLEMENT' ? (
                            <>
                              {memberName(e.paidById)}{' '}
                              <ArrowRight aria-label={t('to')} className="inline size-3" />{' '}
                              {memberName(e.forMemberId)}
                            </>
                          ) : (
                            t(`meta.${e.split}`, {
                              payer: memberName(e.paidById),
                              for: memberName(e.forMemberId),
                            })
                          )}
                        </span>
                        {e.note && (
                          <span className="line-clamp-2 text-[0.8125rem] text-text-muted">
                            {e.note}
                          </span>
                        )}
                      </span>
                      <span className="font-medium tabular-nums">{money(e.amountCents)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {editing && (
        <ExpenseDialog
          expense={editing.expense}
          defaultPayer={myMemberId ?? members[0]!.id}
          onClose={() => setEditing(null)}
        />
      )}
      {weightsOpen && s && (
        <WeightsDialog members={members} initial={weights} onClose={() => setWeightsOpen(false)} />
      )}
    </div>
  );
}

function ExpenseDialog({
  expense,
  defaultPayer,
  onClose,
}: {
  expense?: ExpenseDto;
  defaultPayer: string;
  onClose: () => void;
}) {
  const t = useTranslations('expenses');
  const tc = useTranslations('common');
  const te = useTranslations('errors');
  const money = useMoney();
  const { household } = useSession();
  const today = useToday();
  const actions = useExpenseActions(household.id);
  const members = household.members;
  const settlement = expense?.kind === 'SETTLEMENT';
  const [amount, setAmount] = useState(
    expense ? (expense.amountCents / 100).toFixed(2).replace('.', ',') : '',
  );
  const [title, setTitle] = useState(expense?.title ?? '');
  const [date, setDate] = useState(expense?.date ?? today);
  const [paidById, setPaidById] = useState(expense?.paidById ?? defaultPayer);
  // « SHARED », « PERSONAL », ou l'identifiant du membre pour qui la dépense a été avancée.
  const [target, setTarget] = useState<string>(
    expense?.split === 'FOR_OTHER'
      ? (expense.forMemberId ?? 'SHARED')
      : (expense?.split ?? 'SHARED'),
  );
  const [category, setCategory] = useState<ExpenseCategory>(expense?.category ?? 'OTHER');
  const [note, setNote] = useState(expense?.note ?? '');
  const [error, setError] = useState<string | null>(null);

  const others = members.filter((m) => m.id !== paidById);
  const targetOptions = [
    { value: 'SHARED', label: t('split.SHARED') },
    ...others.map((m) => ({ value: m.id, label: t('split.FOR_OTHER', { name: m.displayName }) })),
    { value: 'PERSONAL', label: t('split.PERSONAL') },
  ];
  // Payeur changé : une avancée « pour lui-même » redevient commune.
  const safeTarget = targetOptions.some((o) => o.value === target) ? target : 'SHARED';

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const cents = parseAmountToCents(amount);
    if (!cents) return setError(t('amountInvalid'));
    if (!title.trim()) return setError(t('titleRequired'));
    const split: ExpenseSplit =
      safeTarget === 'SHARED' || safeTarget === 'PERSONAL' ? safeTarget : 'FOR_OTHER';
    actions.save.mutate(
      {
        editingId: expense?.id,
        input: {
          id: expense ? undefined : crypto.randomUUID(),
          paidById,
          amountCents: cents,
          date,
          title: title.trim(),
          category,
          split,
          forMemberId: split === 'FOR_OTHER' ? safeTarget : null,
          note: note.trim() || null,
        },
      },
      { onSuccess: onClose, onError: (err) => setError(te(errorKey(err) as 'generic')) },
    );
  };

  const remove = () =>
    expense &&
    actions.remove.mutate(expense.id, {
      onSuccess: onClose,
      onError: (err) => setError(te(errorKey(err) as 'generic')),
    });

  if (settlement && expense) {
    return (
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent title={t('settlement')} closeLabel={tc('close')}>
          <p className="text-[0.9375rem]">
            {t('settlementText', {
              from:
                members.find((m) => m.id === expense.paidById)?.displayName ?? t('formerMember'),
              to:
                members.find((m) => m.id === expense.forMemberId)?.displayName ?? t('formerMember'),
              amount: money(expense.amountCents),
            })}
          </p>
          {error && (
            <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}
          <div className="flex justify-end">
            <Button variant="danger" loading={actions.remove.isPending} onClick={remove}>
              {t('delete')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={t(expense ? 'editTitle' : 'newTitle')} closeLabel={tc('close')}>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={t('amount')}
              value={amount}
              inputMode="decimal"
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0,00"
              required
              autoFocus
            />
            <Field
              label={t('date')}
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>
          <Field
            label={t('what')}
            value={title}
            maxLength={120}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('whatPlaceholder')}
            required
          />
          <div className="flex flex-col gap-1.5">
            <span aria-hidden className="text-sm font-medium">
              {t('paidBy')}
            </span>
            <Segmented
              label={t('paidBy')}
              options={members.map((m) => ({ value: m.id, label: m.displayName }))}
              value={paidById}
              onChange={setPaidById}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span aria-hidden className="text-sm font-medium">
              {t('forWhom')}
            </span>
            <Segmented
              label={t('forWhom')}
              options={targetOptions}
              value={safeTarget}
              onChange={setTarget}
            />
          </div>
          <p className="-mt-2 text-[0.8125rem] text-text-muted">
            {t(
              `splitHint.${safeTarget === 'SHARED' || safeTarget === 'PERSONAL' ? safeTarget : 'FOR_OTHER'}`,
            )}
          </p>
          <Select
            label={t('category')}
            value={category}
            onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
          >
            {Categories.options.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_EMOJI[c]} {t(`categories.${c}`)}
              </option>
            ))}
          </Select>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="expense-note" className="text-sm font-medium">
              {t('note')}
            </label>
            <textarea
              id="expense-note"
              rows={2}
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="rounded-md border border-border bg-surface px-3 py-2 text-[0.9375rem]"
            />
          </div>
          {error && (
            <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}
          <div className="flex flex-wrap justify-between gap-2">
            <div>
              {expense && (
                <Button
                  type="button"
                  variant="ghost"
                  loading={actions.remove.isPending}
                  onClick={remove}
                >
                  {t('delete')}
                </Button>
              )}
            </div>
            <Button type="submit" loading={actions.save.isPending}>
              {t('save')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Proportions de partage des dépenses communes (en %, enregistrées comme poids). */
function WeightsDialog({
  members,
  initial,
  onClose,
}: {
  members: HouseholdMemberDto[];
  initial: number[];
  onClose: () => void;
}) {
  const t = useTranslations('expenses');
  const tc = useTranslations('common');
  const te = useTranslations('errors');
  const { household } = useSession();
  const actions = useExpenseActions(household.id);
  const total = initial.reduce((a, w) => a + w, 0);
  const [values, setValues] = useState(initial.map((w) => String(Math.round((w / total) * 100))));
  const [error, setError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const weights = values.map((v) => Number(v));
    if (weights.some((w) => !Number.isInteger(w) || w < 1 || w > 100)) {
      return setError(t('weightsInvalid'));
    }
    actions.weights.mutate(
      { weights: members.map((m, i) => ({ memberId: m.id, weight: weights[i]! })) },
      { onSuccess: onClose, onError: (err) => setError(te(errorKey(err) as 'generic')) },
    );
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={t('weightsTitle')} closeLabel={tc('close')}>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <p className="text-[0.9375rem] text-text-muted">{t('weightsHint')}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            {members.map((m, i) => (
              <Field
                key={m.id}
                label={m.displayName}
                type="number"
                inputMode="numeric"
                min={1}
                max={100}
                value={values[i]}
                onChange={(e) => setValues((v) => v.map((x, j) => (j === i ? e.target.value : x)))}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setValues(members.map(() => String(Math.round(100 / members.length))))}
            >
              {t('weightsEqual')}
            </Button>
          </div>
          {error && (
            <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}
          <div className="flex justify-end">
            <Button type="submit" loading={actions.weights.isPending}>
              {t('save')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
