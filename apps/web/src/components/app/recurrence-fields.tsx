'use client';

import type { RecurrencePreviewItem } from '@agenda/contracts';
import { Minus, Plus, Repeat } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/cn';
import { useDayLabel } from '@/lib/format';
import {
  type RecurrenceState,
  type RepeatPreset,
  type RotationKind,
  ruleWeekdays,
  type StepValue,
  toRecurrenceInput,
  WEEKDAYS,
} from '@/lib/recurrence';
import { previewRecurrence } from '@/lib/tasks';
import { useAssigneeLabel } from './assignees';
import { useSession } from './household-context';
import { useWeekdayName } from './recurrence-text';

const PRESETS: RepeatPreset[] = [
  'none',
  'daily',
  'weekdays',
  'weekly',
  'biweekly',
  'monthly',
  'quarterly',
  'yearly',
  'after',
  'custom',
];

const inputClass =
  'h-11 rounded-md border border-border bg-surface px-3 text-[0.9375rem] focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent';

/**
 * Répétition + rotation. Les valeurs par défaut couvrent 90 % des cas (« Chaque semaine »,
 * responsable fixe) ; les réglages avancés n'apparaissent que si on les choisit.
 */
export function RecurrenceFields({
  state,
  onChange,
  date,
  assignee,
  personal,
  allowNone,
}: {
  state: RecurrenceState;
  onChange: (s: RecurrenceState) => void;
  date: string;
  assignee: StepValue;
  personal: boolean;
  allowNone: boolean;
}) {
  const t = useTranslations('recurrence');
  const { household } = useSession();
  const members = household.members;
  const dayName = useWeekdayName();
  const set = <K extends keyof RecurrenceState>(key: K, value: RecurrenceState[K]) =>
    onChange({ ...state, [key]: value });
  const repeating = state.preset !== 'none';
  const after = state.preset === 'after';
  const showWeekdays =
    ['weekly', 'biweekly'].includes(state.preset) ||
    (state.preset === 'custom' && state.unit === 'week');
  const showMonthDay =
    ['monthly', 'quarterly'].includes(state.preset) ||
    (state.preset === 'custom' && state.unit === 'month');
  const dayOfMonth = date ? Number(date.slice(8, 10)) : 1;
  const weekdayCount = ruleWeekdays(state, date).length;

  const memberOptions = (withAlternate = false) => (
    <>
      {members.map((m) => (
        <option key={m.id} value={m.id}>
          {m.displayName}
        </option>
      ))}
      {members.length > 1 && (
        <option value="together">{t(members.length === 2 ? 'bothOfUs' : 'everyone')}</option>
      )}
      {withAlternate && members.length > 1 && <option value="alternate">{t('eachInTurn')}</option>}
    </>
  );

  return (
    <fieldset className="flex flex-col gap-4 rounded-lg border border-border p-4">
      <legend className="flex items-center gap-2 px-1 text-sm font-medium">
        <Repeat aria-hidden className="size-4 text-text-muted" />
        {t('legend')}
      </legend>

      <Select
        label={t('repeat')}
        value={state.preset}
        onChange={(e) => {
          const preset = e.target.value as RepeatPreset;
          // « Après la dernière fois » : pas de nombre de fois.
          onChange({
            ...state,
            preset,
            end: preset === 'after' && state.end === 'count' ? 'never' : state.end,
          });
        }}
      >
        {PRESETS.filter((p) => allowNone || p !== 'none').map((p) => (
          <option key={p} value={p}>
            {t(`presets.${p}`)}
          </option>
        ))}
      </Select>
      {!date && repeating && <p className="text-sm text-warning">{t('needsDate')}</p>}

      {state.preset === 'custom' && (
        <div className="flex items-center gap-2">
          <label htmlFor="rec-interval" className="text-sm">
            {t('every')}
          </label>
          <input
            id="rec-interval"
            type="number"
            min={1}
            max={365}
            value={state.interval}
            onChange={(e) => set('interval', Math.max(1, Number(e.target.value) || 1))}
            className={cn(inputClass, 'w-20')}
          />
          <Select
            label={t('unit')}
            hideLabel
            value={state.unit}
            onChange={(e) => set('unit', e.target.value as RecurrenceState['unit'])}
          >
            {(['day', 'week', 'month', 'year'] as const).map((u) => (
              <option key={u} value={u}>
                {t(`units.${u}`, { n: state.interval })}
              </option>
            ))}
          </Select>
        </div>
      )}

      {after && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <label htmlFor="rec-after" className="text-sm">
              {t('every')}
            </label>
            <input
              id="rec-after"
              type="number"
              min={1}
              max={365}
              value={state.afterInterval}
              onChange={(e) =>
                set('afterInterval', Math.max(1, Math.min(365, Number(e.target.value) || 1)))
              }
              className={cn(inputClass, 'w-20')}
            />
            <Select
              label={t('unit')}
              hideLabel
              value={state.afterUnit}
              onChange={(e) => set('afterUnit', e.target.value as RecurrenceState['afterUnit'])}
            >
              {(['DAY', 'WEEK', 'MONTH'] as const).map((u) => (
                <option key={u} value={u}>
                  {t(`units.${u === 'DAY' ? 'day' : u === 'WEEK' ? 'week' : 'month'}`, {
                    n: state.afterInterval,
                  })}
                </option>
              ))}
            </Select>
          </div>
          <p className="text-sm text-text-muted">{t('afterHint')}</p>
        </div>
      )}

      {showWeekdays && (
        <div role="group" aria-label={t('days')} className="flex flex-wrap gap-1.5">
          {WEEKDAYS.map((w, i) => {
            const on = state.weekdays.includes(w);
            return (
              <button
                key={w}
                type="button"
                aria-pressed={on}
                aria-label={dayName(i)}
                onClick={() => {
                  const next = on ? state.weekdays.filter((x) => x !== w) : [...state.weekdays, w];
                  if (next.length) onChange({ ...state, weekdays: next, weekdaysAuto: false });
                }}
                className={cn(
                  'size-10 rounded-full border text-sm transition-colors',
                  on
                    ? 'border-accent bg-accent text-accent-fg'
                    : 'border-border text-text-muted hover:text-text',
                )}
              >
                {dayName(i, 'narrow')}
              </button>
            );
          })}
        </div>
      )}

      {showMonthDay && (
        <div role="radiogroup" aria-label={t('monthDay')} className="flex flex-col gap-1">
          {(['date', 'last'] as const).map((v) => (
            <label key={v} className="flex min-h-10 items-center gap-2 text-[0.9375rem]">
              <input
                type="radio"
                name="monthDay"
                checked={state.monthDay === v}
                onChange={() => set('monthDay', v)}
                className="size-4 accent-(--color-accent)"
              />
              {v === 'date' ? t('onDay', { day: dayOfMonth }) : t('lastDay')}
            </label>
          ))}
        </div>
      )}

      {repeating && (
        <div className="grid grid-cols-2 gap-3">
          <Select
            label={t('ends')}
            value={state.end}
            onChange={(e) => set('end', e.target.value as RecurrenceState['end'])}
          >
            <option value="never">{t('endNever')}</option>
            <option value="until">{t('endUntil')}</option>
            {!after && <option value="count">{t('endCount')}</option>}
          </Select>
          {state.end === 'until' && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="rec-until" className="text-sm font-medium">
                {t('untilDate')}
              </label>
              <input
                id="rec-until"
                type="date"
                min={date}
                value={state.until}
                onChange={(e) => set('until', e.target.value)}
                className={inputClass}
              />
            </div>
          )}
          {state.end === 'count' && !after && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="rec-count" className="text-sm font-medium">
                {t('times')}
              </label>
              <input
                id="rec-count"
                type="number"
                min={1}
                max={1000}
                value={state.count}
                onChange={(e) => set('count', Math.max(1, Number(e.target.value) || 1))}
                className={inputClass}
              />
            </div>
          )}
        </div>
      )}

      {repeating && !personal && members.length > 1 && (
        <div className="flex flex-col gap-3">
          <Select
            label={t('rotation')}
            value={state.rotation}
            onChange={(e) => set('rotation', e.target.value as RotationKind)}
          >
            <option value="fixed">{t('rotationKinds.fixed')}</option>
            <option value="alternate">{t('rotationKinds.alternate')}</option>
            <option value="sequence">{t('rotationKinds.sequence')}</option>
            {weekdayCount >= 2 && <option value="weekday">{t('rotationKinds.weekday')}</option>}
          </Select>

          {state.rotation === 'alternate' && (
            <Select
              label={t('startsWith')}
              value={state.order[0] ?? ''}
              onChange={(e) => {
                const first = e.target.value;
                set('order', [first, ...members.map((m) => m.id).filter((id) => id !== first)]);
              }}
            >
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.displayName}
                </option>
              ))}
            </Select>
          )}

          {state.rotation === 'sequence' && (
            <ol className="flex flex-col gap-2" aria-label={t('steps')}>
              {state.sequence.map((step, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="w-6 text-right text-sm tabular-nums text-text-muted">
                    {i + 1}.
                  </span>
                  <div className="flex-1">
                    <Select
                      label={t('step', { n: i + 1 })}
                      hideLabel
                      value={step}
                      onChange={(e) =>
                        set(
                          'sequence',
                          state.sequence.map((v, j) => (j === i ? e.target.value : v)),
                        )
                      }
                    >
                      {memberOptions()}
                    </Select>
                  </div>
                  <button
                    type="button"
                    aria-label={t('removeStep', { n: i + 1 })}
                    disabled={state.sequence.length <= 1}
                    onClick={() =>
                      set(
                        'sequence',
                        state.sequence.filter((_, j) => j !== i),
                      )
                    }
                    className="inline-flex size-11 items-center justify-center rounded-md text-text-muted hover:bg-surface-muted disabled:opacity-40"
                  >
                    <Minus aria-hidden className="size-4" />
                  </button>
                </li>
              ))}
              <li>
                <button
                  type="button"
                  disabled={state.sequence.length >= 14}
                  onClick={() =>
                    set('sequence', [
                      ...state.sequence,
                      members[state.sequence.length % members.length]!.id,
                    ])
                  }
                  className="inline-flex min-h-10 items-center gap-2 rounded-md px-2 text-sm text-accent hover:bg-surface-muted"
                >
                  <Plus aria-hidden className="size-4" />
                  {t('addStep')}
                </button>
              </li>
            </ol>
          )}

          {state.rotation === 'weekday' && (
            <ul className="flex flex-col gap-2">
              {ruleWeekdays(state, date).map((wd) => (
                <li key={wd} className="grid grid-cols-[6rem_1fr] items-center gap-2">
                  <span className="text-sm first-letter:uppercase">{dayName(wd)}</span>
                  <Select
                    label={dayName(wd)}
                    hideLabel
                    value={state.byDay[wd] ?? 'alternate'}
                    onChange={(e) => set('byDay', { ...state.byDay, [wd]: e.target.value })}
                  >
                    {memberOptions(true)}
                  </Select>
                </li>
              ))}
            </ul>
          )}

          {!after &&
            (state.rotation === 'alternate' ||
              state.rotation === 'sequence' ||
              state.rotation === 'weekday') && (
              <label className="flex min-h-10 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={state.perWeek}
                  onChange={(e) => set('perWeek', e.target.checked)}
                  className="size-4 accent-(--color-accent)"
                />
                {t('perWeek')}
              </label>
            )}
        </div>
      )}

      {repeating && !after && date && (
        <RecurrencePreview state={state} date={date} assignee={assignee} personal={personal} />
      )}
    </fieldset>
  );
}

/** Aperçu calculé par l'API (même moteur que la génération réelle). */
function RecurrencePreview({
  state,
  date,
  assignee,
  personal,
}: {
  state: RecurrenceState;
  date: string;
  assignee: StepValue;
  personal: boolean;
}) {
  const t = useTranslations('recurrence');
  const { household, me } = useSession();
  const dayLabel = useDayLabel();
  const assigneeLabel = useAssigneeLabel(household);
  const [items, setItems] = useState<RecurrencePreviewItem[] | null>(null);
  const myMemberId = household.members.find((m) => m.userId === me.id)?.id ?? '';
  const input = toRecurrenceInput(state, date, assignee, household.members, personal);
  const key = JSON.stringify(input);

  useEffect(() => {
    if (!input) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      previewRecurrence(
        household.id,
        { startDate: date, recurrence: input, limit: 5 },
        controller.signal,
      ).then(setItems, () => setItems(null));
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` résume `input`
  }, [key, date, household.id]);

  if (!items) return null;
  return (
    <div className="flex flex-col gap-1.5" aria-live="polite">
      <p className="text-sm font-medium">{t('next')}</p>
      {items.length === 0 ? (
        <p className="text-sm text-warning">{t('noOccurrence')}</p>
      ) : (
        <ul className="flex flex-col gap-1 text-sm text-text-muted">
          {items.map((it) => (
            <li key={it.date} className="flex justify-between gap-3">
              <span className="first-letter:uppercase">{dayLabel(it.date, 'long')}</span>
              <span>{assigneeLabel(personal ? [myMemberId] : it.assigneeIds)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
