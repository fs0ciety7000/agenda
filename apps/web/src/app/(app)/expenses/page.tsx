'use client';

import type {
  ExpenseCategory,
  ExpenseDto,
  ExpenseSplit,
  HouseholdMemberDto,
} from '@agenda/contracts';
import { ExpenseCategory as Categories } from '@agenda/contracts';
import { parseAmountToCents } from '@agenda/domain';
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Download,
  Paperclip,
  Plus,
  Repeat,
  Scale,
  Target,
  Wallet,
} from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useState, type FormEvent } from 'react';
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
import { cn } from '@/lib/cn';
import {
  budgetLevel,
  exportUrl,
  monthSpan,
  receiptUrl,
  shiftMonth,
  useExpenseActions,
  useExpenses,
  useExpenseStats,
  useExpenseSummary,
  useMoney,
  useRecurringExpenses,
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

type Prefill = { title?: string; category?: ExpenseCategory };
type Editing = { expense?: ExpenseDto; prefill?: Prefill } | null;

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
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [categoryBudgetsOpen, setCategoryBudgetsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const stats = useExpenseStats(household.id, month);
  const recurring = useRecurringExpenses(household.id);

  // Lien « Noter la dépense » (Courses, tâche payée) : ?new=1&title=…&category=…
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has('new')) return;
    const category = params.get('category');
    setEditing({
      prefill: {
        title: params.get('title')?.slice(0, 120) ?? undefined,
        category: Categories.options.includes(category as ExpenseCategory)
          ? (category as ExpenseCategory)
          : undefined,
      },
    });
    window.history.replaceState(null, '', '/expenses');
  }, []);

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
        <div className="flex flex-wrap items-center gap-1">
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
          <Button variant="ghost" size="sm" onClick={() => setExportOpen(true)}>
            <Download aria-hidden className="size-4" />
            {t('export')}
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
          <BudgetMeter
            spentCents={s.commonCents}
            budgetCents={s.budgetCents}
            onEdit={() => setBudgetOpen(true)}
          />
          <CategoryBudgets
            budgets={s.categoryBudgets}
            spent={s.byCategory}
            onEdit={() => setCategoryBudgetsOpen(true)}
          />
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

      {stats.data && stats.data.months.some((m) => m.commonCents > 0) && (
        <TrendCard
          months={stats.data.months}
          budgetCents={stats.data.budgetCents}
          current={month}
        />
      )}

      {(recurring.data?.length ?? 0) > 0 && (
        <Card className="flex flex-col gap-3 p-4" aria-labelledby="recurring-title">
          <h2 id="recurring-title" className="font-semibold">
            {t('recurringTitle')}
          </h2>
          <ul className="flex flex-col gap-2">
            {recurring.data!.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 text-[0.9375rem]">
                <span aria-hidden>{CATEGORY_EMOJI[r.category]}</span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span>
                    {r.title} · <span className="tabular-nums">{money(r.amountCents)}</span>
                  </span>
                  <span className="text-[0.8125rem] text-text-muted">
                    {t('recurringLine', { day: r.dayOfMonth, payer: memberName(r.paidById) })}
                  </span>
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (window.confirm(t('recurringStopConfirm', { title: r.title }))) {
                      actions.stopRecurring.mutate(r.id, {
                        onError: (e) =>
                          toast({ message: te(errorKey(e) as 'generic'), tone: 'error' }),
                      });
                    }
                  }}
                  aria-label={t('recurringStopLabel', { title: r.title })}
                >
                  {t('recurringStop')}
                </Button>
              </li>
            ))}
          </ul>
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
          illustration="expenses"
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
                        {(e.recurringId || e.hasReceipt) && (
                          <span className="flex gap-2 text-[0.75rem] text-text-muted">
                            {e.recurringId && (
                              <span className="inline-flex items-center gap-1">
                                <Repeat aria-hidden className="size-3" />
                                {t('monthly')}
                              </span>
                            )}
                            {e.hasReceipt && (
                              <span className="inline-flex items-center gap-1">
                                <Paperclip aria-hidden className="size-3" />
                                {t('receipt')}
                              </span>
                            )}
                          </span>
                        )}
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
          prefill={editing.prefill}
          defaultPayer={myMemberId ?? members[0]!.id}
          onClose={() => setEditing(null)}
        />
      )}
      {budgetOpen && s && (
        <BudgetDialog initial={s.budgetCents} onClose={() => setBudgetOpen(false)} />
      )}
      {s && categoryBudgetsOpen && (
        <CategoryBudgetsDialog
          initial={s.categoryBudgets}
          onClose={() => setCategoryBudgetsOpen(false)}
        />
      )}
      {exportOpen && <ExportDialog month={month} onClose={() => setExportOpen(false)} />}
      {weightsOpen && s && (
        <WeightsDialog members={members} initial={weights} onClose={() => setWeightsOpen(false)} />
      )}
    </div>
  );
}

function ExpenseDialog({
  expense,
  prefill,
  defaultPayer,
  onClose,
}: {
  expense?: ExpenseDto;
  prefill?: Prefill;
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
  const editable = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');
  const [amount, setAmount] = useState(expense ? editable(expense.amountCents) : '');
  const [title, setTitle] = useState(expense?.title ?? prefill?.title ?? '');
  const [date, setDate] = useState(expense?.date ?? today);
  const [paidById, setPaidById] = useState(expense?.paidById ?? defaultPayer);
  // « SHARED », « CUSTOM », « PERSONAL », ou l'identifiant du membre pour qui la dépense a été
  // avancée.
  const [target, setTarget] = useState<string>(
    expense?.split === 'FOR_OTHER'
      ? (expense.forMemberId ?? 'SHARED')
      : (expense?.split ?? 'SHARED'),
  );
  // Parts à la main, en texte (« 12,50 ») par membre.
  const [custom, setCustom] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      members.map((m) => {
        const share =
          expense?.split === 'CUSTOM' ? expense.shares.find((x) => x.memberId === m.id) : null;
        return [m.id, share ? editable(share.amountCents) : ''];
      }),
    ),
  );
  const [category, setCategory] = useState<ExpenseCategory>(
    expense?.category ?? prefill?.category ?? 'OTHER',
  );
  const [note, setNote] = useState(expense?.note ?? '');
  const [monthly, setMonthly] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const others = members.filter((m) => m.id !== paidById);
  const targetOptions = [
    { value: 'SHARED', label: t('split.SHARED') },
    { value: 'CUSTOM', label: t('split.CUSTOM') },
    ...others.map((m) => ({ value: m.id, label: t('split.FOR_OTHER', { name: m.displayName }) })),
    { value: 'PERSONAL', label: t('split.PERSONAL') },
  ];
  // Payeur changé : une avancée « pour lui-même » redevient commune.
  const safeTarget = targetOptions.some((o) => o.value === target) ? target : 'SHARED';
  const split: ExpenseSplit = ['SHARED', 'CUSTOM', 'PERSONAL'].includes(safeTarget)
    ? (safeTarget as ExpenseSplit)
    : 'FOR_OTHER';
  const totalCents = parseAmountToCents(amount) ?? 0;
  const customCents = members.map((m) =>
    custom[m.id]?.trim() ? parseAmountToCents(custom[m.id]!) : 0,
  );
  const customLeft = totalCents - customCents.reduce<number>((a, c) => a + (c ?? 0), 0);
  const canRepeat = !expense && split !== 'CUSTOM';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const cents = parseAmountToCents(amount);
    if (!cents) return setError(t('amountInvalid'));
    if (!title.trim()) return setError(t('titleRequired'));
    if (split === 'CUSTOM' && (customCents.some((c) => c === null) || customLeft !== 0)) {
      return setError(t('customInvalid', { amount: money(cents) }));
    }
    const fail = (err: unknown) => setError(te(errorKey(err) as 'generic'));
    if (canRepeat && monthly) {
      actions.createRecurring.mutate(
        {
          paidById,
          amountCents: cents,
          title: title.trim(),
          category,
          split: split as 'SHARED' | 'FOR_OTHER' | 'PERSONAL',
          forMemberId: split === 'FOR_OTHER' ? safeTarget : null,
          note: note.trim() || null,
          startDate: date,
        },
        { onSuccess: onClose, onError: fail },
      );
      return;
    }
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
          shares:
            split === 'CUSTOM'
              ? members.map((m, i) => ({ memberId: m.id, amountCents: customCents[i] ?? 0 }))
              : null,
        },
      },
      {
        onSuccess: (saved) => {
          if (!file) return onClose();
          actions.uploadReceipt.mutate(
            { id: saved.id, file },
            { onSuccess: onClose, onError: fail },
          );
        },
        onError: fail,
      },
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
          <p className="-mt-2 text-[0.8125rem] text-text-muted">{t(`splitHint.${split}`)}</p>
          {split === 'CUSTOM' && (
            <div className="flex flex-col gap-2">
              <div className="grid gap-3 sm:grid-cols-2">
                {members.map((m) => (
                  <Field
                    key={m.id}
                    label={t('customShare', { name: m.displayName })}
                    value={custom[m.id] ?? ''}
                    inputMode="decimal"
                    placeholder="0,00"
                    onChange={(e) => setCustom((c) => ({ ...c, [m.id]: e.target.value }))}
                  />
                ))}
              </div>
              <p
                aria-live="polite"
                className={
                  customLeft === 0
                    ? 'text-[0.8125rem] text-success'
                    : 'text-[0.8125rem] text-text-muted'
                }
              >
                {customLeft === 0
                  ? `✓ ${t('customOk')}`
                  : t('customLeft', { amount: money(customLeft) })}
              </p>
            </div>
          )}
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
              className="rounded-md border border-border-strong bg-surface px-3 py-2 text-[0.9375rem]"
            />
          </div>
          {canRepeat && (
            <label className="flex min-h-11 items-start gap-3 text-[0.9375rem]">
              <input
                type="checkbox"
                checked={monthly}
                onChange={(e) => setMonthly(e.target.checked)}
                className="mt-1 size-4 accent-accent"
              />
              <span className="flex flex-col">
                <span>{t('repeatMonthly')}</span>
                <span className="text-[0.8125rem] text-text-muted">{t('repeatMonthlyHint')}</span>
              </span>
            </label>
          )}
          {!(canRepeat && monthly) && (
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">{t('receipt')}</span>
              {expense?.hasReceipt ? (
                <div className="flex flex-wrap items-center gap-3 text-[0.9375rem]">
                  <a
                    href={receiptUrl(household.id, expense.id)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-accent underline-offset-4 hover:underline"
                  >
                    {t('receiptOpen')}
                  </a>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    loading={actions.removeReceipt.isPending}
                    onClick={() => actions.removeReceipt.mutate(expense.id, { onSuccess: onClose })}
                  >
                    {t('receiptRemove')}
                  </Button>
                </div>
              ) : (
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  aria-label={t('receiptAdd')}
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="text-[0.9375rem] file:mr-3 file:min-h-11 file:rounded-md file:border file:border-border file:bg-surface file:px-4 file:text-text"
                />
              )}
            </div>
          )}
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
            <Button
              type="submit"
              loading={
                actions.save.isPending ||
                actions.createRecurring.isPending ||
                actions.uploadReceipt.isPending
              }
            >
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

/** Budget commun du mois : jauge et reste (ou dépassement), en texte comme en couleur. */
function BudgetMeter({
  spentCents,
  budgetCents,
  onEdit,
}: {
  spentCents: number;
  budgetCents: number | null;
  onEdit: () => void;
}) {
  const t = useTranslations('expenses');
  const money = useMoney();
  const edit = (
    <button
      type="button"
      onClick={onEdit}
      className="inline-flex min-h-11 items-center gap-1.5 text-sm text-accent underline-offset-4 hover:underline"
    >
      <Target aria-hidden className="size-4" />
      {budgetCents ? t('budgetEdit') : t('budgetSet')}
    </button>
  );
  if (!budgetCents) return <div>{edit}</div>;
  const level = budgetLevel(spentCents, budgetCents);
  const percent = Math.round((spentCents / budgetCents) * 100);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center justify-between gap-x-3">
        <span className="text-[0.9375rem] tabular-nums">
          {t('budgetLine', { spent: money(spentCents), budget: money(budgetCents) })}
        </span>
        {edit}
      </div>
      <div
        role="meter"
        aria-label={t('budgetMeter')}
        aria-valuemin={0}
        aria-valuemax={budgetCents}
        aria-valuenow={Math.min(spentCents, budgetCents)}
        aria-valuetext={t('budgetPercent', { percent })}
        className="h-2 overflow-hidden rounded-full bg-surface-muted"
      >
        <div
          className={cn('h-full rounded-full', level === 100 ? 'bg-warning' : 'bg-accent')}
          style={{ width: `${Math.min(100, percent)}%` }}
        />
      </div>
      <p
        className={cn(
          'text-[0.8125rem] tabular-nums',
          level === 100 ? 'text-warning' : 'text-text-muted',
        )}
      >
        {spentCents > budgetCents
          ? t('budgetOver', { amount: money(spentCents - budgetCents), percent })
          : t('budgetLeft', { amount: money(budgetCents - spentCents), percent })}
      </p>
    </div>
  );
}

/** Dépenses communes des derniers mois : une barre par mois, le budget en repère. */
function TrendCard({
  months,
  budgetCents,
  current,
}: {
  months: { month: string; commonCents: number }[];
  budgetCents: number | null;
  current: string;
}) {
  const t = useTranslations('expenses');
  const format = useFormatter();
  const money = useMoney();
  const max = Math.max(budgetCents ?? 0, ...months.map((m) => m.commonCents), 1);
  const label = (m: string) =>
    format.dateTime(new Date(`${m}-15T12:00:00`), { month: 'short', year: '2-digit' });
  return (
    <Card className="flex flex-col gap-3 p-4" aria-labelledby="trend-title">
      <div>
        <h2 id="trend-title" className="font-semibold">
          {t('trendTitle', { count: months.length })}
        </h2>
        <p className="text-[0.8125rem] text-text-muted">{t('trendHint')}</p>
      </div>
      <ul className="flex flex-col gap-2">
        {months.map((m) => (
          <li
            key={m.month}
            className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-3 text-[0.9375rem]"
          >
            <span className={cn(m.month === current && 'font-semibold')}>{label(m.month)}</span>
            <span aria-hidden className="relative h-3 rounded-sm bg-surface-muted">
              {m.commonCents > 0 && (
                <span
                  className="absolute inset-y-0 left-0 rounded-sm bg-accent"
                  style={{ width: `${(m.commonCents / max) * 100}%` }}
                />
              )}
              {budgetCents && (
                <span
                  className="absolute -inset-y-1 w-0.5 bg-text"
                  style={{ left: `calc(${(budgetCents / max) * 100}% - 1px)` }}
                />
              )}
            </span>
            <span className="text-right tabular-nums">{money(m.commonCents)}</span>
          </li>
        ))}
      </ul>
      {budgetCents && (
        <p className="flex items-center gap-2 text-[0.8125rem] text-text-muted">
          <span aria-hidden className="h-3 w-0.5 bg-text" />
          {t('trendBudget', { budget: money(budgetCents) })}
        </p>
      )}
    </Card>
  );
}

function BudgetDialog({ initial, onClose }: { initial: number | null; onClose: () => void }) {
  const t = useTranslations('expenses');
  const tc = useTranslations('common');
  const te = useTranslations('errors');
  const { household } = useSession();
  const actions = useExpenseActions(household.id);
  const [amount, setAmount] = useState(
    initial ? (initial / 100).toFixed(2).replace('.', ',').replace(',00', '') : '',
  );
  const [error, setError] = useState<string | null>(null);

  const save = (budgetCents: number | null) =>
    actions.budget.mutate(
      { budgetCents },
      { onSuccess: onClose, onError: (err) => setError(te(errorKey(err) as 'generic')) },
    );
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const cents = parseAmountToCents(amount);
    if (!cents) return setError(t('amountInvalid'));
    save(cents);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={t('budgetTitle')} closeLabel={tc('close')}>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <p className="text-[0.9375rem] text-text-muted">{t('budgetHint')}</p>
          <Field
            label={t('budgetAmount')}
            inputMode="decimal"
            autoComplete="off"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            error={error ?? undefined}
          />
          <div className="flex flex-wrap justify-end gap-2">
            {initial && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => save(null)}
                disabled={actions.budget.isPending}
              >
                {t('budgetRemove')}
              </Button>
            )}
            <Button type="submit" loading={actions.budget.isPending}>
              {t('save')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Budgets par catégorie : une jauge par budget (dépenses communes du mois). */
function CategoryBudgets({
  budgets,
  spent,
  onEdit,
}: {
  budgets: { category: ExpenseCategory; budgetCents: number }[];
  spent: { category: ExpenseCategory; amountCents: number }[];
  onEdit: () => void;
}) {
  const t = useTranslations('expenses');
  const money = useMoney();
  return (
    <div className="flex flex-col gap-2">
      {budgets.length > 0 && (
        <ul className="flex flex-col gap-3" aria-label={t('categoryBudgetsTitle')}>
          {budgets.map((b) => {
            const used = spent.find((c) => c.category === b.category)?.amountCents ?? 0;
            const level = budgetLevel(used, b.budgetCents);
            const percent = Math.round((used / b.budgetCents) * 100);
            const name = t(`categories.${b.category}`);
            return (
              <li key={b.category} className="flex flex-col gap-1">
                <span className="flex flex-wrap justify-between gap-x-3 text-[0.9375rem]">
                  <span>
                    <span aria-hidden>{CATEGORY_EMOJI[b.category]} </span>
                    {name}
                  </span>
                  <span className={cn('tabular-nums', level === 100 && 'text-warning')}>
                    {t('categoryBudgetLine', { spent: money(used), budget: money(b.budgetCents) })}
                  </span>
                </span>
                <div
                  role="meter"
                  aria-label={t('categoryBudgetMeter', { category: name })}
                  aria-valuemin={0}
                  aria-valuemax={b.budgetCents}
                  aria-valuenow={Math.min(used, b.budgetCents)}
                  aria-valuetext={t('budgetPercent', { percent })}
                  className="h-1.5 overflow-hidden rounded-full bg-surface-muted"
                >
                  <div
                    className={cn(
                      'h-full rounded-full',
                      level === 100 ? 'bg-warning' : 'bg-accent',
                    )}
                    style={{ width: `${Math.min(100, percent)}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <button
        type="button"
        onClick={onEdit}
        className="inline-flex min-h-11 items-center gap-1.5 self-start text-sm text-accent underline-offset-4 hover:underline"
      >
        <Target aria-hidden className="size-4" />
        {t(budgets.length ? 'categoryBudgetsEdit' : 'categoryBudgetsSet')}
      </button>
    </div>
  );
}

/** Un champ par catégorie ; vide = pas de budget pour cette catégorie. */
function CategoryBudgetsDialog({
  initial,
  onClose,
}: {
  initial: { category: ExpenseCategory; budgetCents: number }[];
  onClose: () => void;
}) {
  const t = useTranslations('expenses');
  const tc = useTranslations('common');
  const te = useTranslations('errors');
  const { household } = useSession();
  const actions = useExpenseActions(household.id);
  const asText = (cents: number) => (cents / 100).toFixed(2).replace('.', ',').replace(',00', '');
  const [amounts, setAmounts] = useState<Record<string, string>>(
    Object.fromEntries(initial.map((b) => [b.category, asText(b.budgetCents)])),
  );
  const [invalid, setInvalid] = useState<ExpenseCategory | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const budgets: { category: ExpenseCategory; budgetCents: number }[] = [];
    for (const category of Categories.options) {
      const text = amounts[category]?.trim();
      if (!text) continue;
      const cents = parseAmountToCents(text);
      if (!cents) {
        setInvalid(category);
        document.getElementById(`budget-${category}`)?.focus();
        return;
      }
      budgets.push({ category, budgetCents: cents });
    }
    actions.categoryBudgets.mutate(
      { budgets },
      { onSuccess: onClose, onError: (err) => setError(te(errorKey(err) as 'generic')) },
    );
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={t('categoryBudgetsTitle')} closeLabel={tc('close')}>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <p className="text-[0.9375rem] text-text-muted">{t('categoryBudgetsHint')}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {Categories.options.map((c) => (
              <Field
                key={c}
                id={`budget-${c}`}
                label={`${CATEGORY_EMOJI[c]} ${t(`categories.${c}`)}`}
                inputMode="decimal"
                autoComplete="off"
                placeholder={t('categoryBudgetNone')}
                value={amounts[c] ?? ''}
                error={invalid === c ? t('amountInvalid') : undefined}
                onChange={(e) => {
                  setInvalid(null);
                  setAmounts({ ...amounts, [c]: e.target.value });
                }}
              />
            ))}
          </div>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <div className="flex justify-end">
            <Button type="submit" loading={actions.categoryBudgets.isPending}>
              {t('save')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Export tableur : de janvier au mois affiché par défaut. */
function ExportDialog({ month, onClose }: { month: string; onClose: () => void }) {
  const t = useTranslations('expenses');
  const tc = useTranslations('common');
  const { household } = useSession();
  const [from, setFrom] = useState(`${month.slice(0, 4)}-01`);
  const [to, setTo] = useState(month);
  const [error, setError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const valid = /^\d{4}-\d{2}$/;
    const span = monthSpan(from, to);
    if (!valid.test(from) || !valid.test(to) || span < 1 || span > 60) {
      return setError(t('exportInvalid'));
    }
    // Réponse « attachment » : le navigateur télécharge sans quitter la page.
    window.location.assign(exportUrl(household.id, from, to));
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={t('exportTitle')} closeLabel={tc('close')}>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <p className="text-[0.9375rem] text-text-muted">{t('exportHint')}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={t('exportFrom')}
              type="month"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
            <Field
              label={t('exportTo')}
              type="month"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          {error && (
            <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}
          <div className="flex justify-end">
            <Button type="submit">
              <Download aria-hidden className="size-4" />
              {t('exportDownload')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
