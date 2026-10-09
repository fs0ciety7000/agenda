'use client';

import type { MealDto, MealSlot } from '@agenda/contracts';
import { addDays, startOfWeek } from '@agenda/domain';
import { ChevronLeft, ChevronRight, Plus, ShoppingCart } from 'lucide-react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { useSession } from '@/components/app/household-context';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Illustration } from '@/components/ui/illustration';
import { ErrorState, Skeleton } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { errorKey } from '@/lib/api';
import { useToday } from '@/lib/format';
import { splitIngredients, useMealActions, useMeals, useMealSuggestions } from '@/lib/meals';

const SLOTS: MealSlot[] = ['LUNCH', 'DINNER'];

type Editing = { meal?: MealDto; date: string; slot: MealSlot } | null;

/** Menus de la semaine : un repas par jour (midi, soir), ingrédients envoyés aux courses. */
export default function MealsPage() {
  const t = useTranslations('meals');
  const te = useTranslations('errors');
  const format = useFormatter();
  const toast = useToast();
  const { household } = useSession();
  const today = useToday();
  const [monday, setMonday] = useState(() => startOfWeek(today));
  const sunday = addDays(monday, 6);
  const meals = useMeals(household.id, monday, sunday);
  const actions = useMealActions(household.id);
  const [editing, setEditing] = useState<Editing>(null);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const dayLabel = (d: string) =>
    format.dateTime(new Date(`${d}T12:00:00`), { weekday: 'long', day: 'numeric', month: 'long' });
  const list = meals.data ?? [];
  const pending = list.filter((m) => !m.addedToShoppingAt && m.ingredients.length > 0);

  const sendToShopping = (ids: string[]) =>
    actions.toShopping.mutate(ids, {
      onSuccess: (r) =>
        toast({
          message:
            r.added === 0 ? t('nothingAdded') : t('added', { added: r.added, skipped: r.skipped }),
        }),
      onError: (e) => toast({ message: te(errorKey(e) as 'generic'), tone: 'error' }),
    });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[2rem] font-semibold leading-tight tracking-tight">{t('title')}</h1>
          <p className="text-[0.9375rem] text-text-muted">
            {t('week', { from: dayLabel(monday), to: dayLabel(sunday) })}
          </p>
        </div>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            aria-label={t('prev')}
            onClick={() => setMonday(addDays(monday, -7))}
          >
            <ChevronLeft aria-hidden className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label={t('next')}
            onClick={() => setMonday(addDays(monday, 7))}
          >
            <ChevronRight aria-hidden className="size-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="secondary"
          disabled={pending.length === 0}
          loading={actions.toShopping.isPending}
          onClick={() => sendToShopping(pending.map((m) => m.id))}
        >
          <ShoppingCart aria-hidden className="size-4" />
          {t('weekToShopping', { count: pending.length })}
        </Button>
        <Link href="/shopping" className="text-sm text-accent underline-offset-4 hover:underline">
          {t('openShopping')}
        </Link>
      </div>

      {meals.error ? (
        <ErrorState
          message={te(errorKey(meals.error) as 'generic')}
          retryLabel={te('retry')}
          onRetry={() => void meals.refetch()}
        />
      ) : !meals.data ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <>
          {list.length === 0 && (
            <div className="flex flex-col items-center gap-2 text-center">
              <Illustration name="meals" className="h-24 w-[7.5rem]" />
              <p className="text-[1.0625rem] font-medium">{t('emptyTitle')}</p>
              <p className="max-w-sm text-[0.9375rem] text-text-muted">{t('emptyBody')}</p>
            </div>
          )}
          <ol className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {days.map((d) => (
              <li key={d}>
                <Card className="flex h-full flex-col gap-3 p-4">
                  <h2 className={d === today ? 'font-semibold text-accent' : 'font-semibold'}>
                    {dayLabel(d)}
                  </h2>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {SLOTS.map((slot) => {
                      const meal = list.find((m) => m.date === d && m.slot === slot);
                      return meal ? (
                        <button
                          key={slot}
                          type="button"
                          onClick={() => setEditing({ meal, date: d, slot })}
                          className="flex flex-col gap-1 rounded-md border border-border px-3 py-2 text-left hover:bg-surface-muted"
                        >
                          <span className="text-[0.75rem] font-medium uppercase tracking-wide text-text-muted">
                            {t(`slot.${slot}`)}
                          </span>
                          <span className="font-medium">{meal.title}</span>
                          {meal.ingredients.length > 0 && (
                            <span className="line-clamp-2 text-[0.8125rem] text-text-muted">
                              {meal.ingredients.join(', ')}
                            </span>
                          )}
                          {meal.addedToShoppingAt && (
                            <span className="text-[0.75rem] text-success">✓ {t('inShopping')}</span>
                          )}
                        </button>
                      ) : (
                        <button
                          key={slot}
                          type="button"
                          onClick={() => setEditing({ date: d, slot })}
                          className="flex min-h-11 items-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-sm text-text-muted hover:bg-surface-muted"
                        >
                          <Plus aria-hidden className="size-4" />
                          {t('add', { slot: t(`slot.${slot}`) })}
                        </button>
                      );
                    })}
                  </div>
                </Card>
              </li>
            ))}
          </ol>
        </>
      )}

      {editing && (
        <MealDialog
          editing={editing}
          onClose={() => setEditing(null)}
          onSendToShopping={(id) => sendToShopping([id])}
        />
      )}
    </div>
  );
}

function MealDialog({
  editing,
  onClose,
  onSendToShopping,
}: {
  editing: NonNullable<Editing>;
  onClose: () => void;
  onSendToShopping: (id: string) => void;
}) {
  const t = useTranslations('meals');
  const tc = useTranslations('common');
  const te = useTranslations('errors');
  const { household } = useSession();
  const actions = useMealActions(household.id);
  const suggestions = useMealSuggestions(household.id);
  const meal = editing.meal;
  const [title, setTitle] = useState(meal?.title ?? '');
  const [ingredients, setIngredients] = useState(meal?.ingredients.join('\n') ?? '');
  const [error, setError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return setError(t('titleRequired'));
    actions.save.mutate(
      {
        id: meal?.id,
        date: editing.date,
        slot: editing.slot,
        title: title.trim(),
        ingredients: splitIngredients(ingredients),
      },
      { onSuccess: onClose, onError: (err) => setError(te(errorKey(err) as 'generic')) },
    );
  };

  const ideas = (suggestions.data ?? []).filter(
    (s) => !title.trim() || s.title.toLowerCase().includes(title.trim().toLowerCase()),
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={t(meal ? 'editTitle' : 'newTitle')} closeLabel={tc('close')}>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <Field
            label={t('mealTitle')}
            value={title}
            maxLength={120}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('mealPlaceholder')}
            required
            autoFocus
          />
          {!meal && ideas.length > 0 && (
            <div className="flex flex-wrap gap-2" aria-label={t('ideas')}>
              {ideas.slice(0, 8).map((s) => (
                <button
                  key={s.title}
                  type="button"
                  onClick={() => {
                    setTitle(s.title);
                    setIngredients(s.ingredients.join('\n'));
                  }}
                  className="rounded-full border border-border px-3 py-1.5 text-sm hover:bg-surface-muted"
                >
                  {s.title}
                </button>
              ))}
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="meal-ingredients" className="text-sm font-medium">
              {t('ingredients')}
            </label>
            <textarea
              id="meal-ingredients"
              rows={6}
              value={ingredients}
              onChange={(e) => setIngredients(e.target.value)}
              placeholder={t('ingredientsPlaceholder')}
              aria-describedby="meal-ingredients-hint"
              className="rounded-md border border-border-strong bg-surface px-3 py-2 text-[0.9375rem]"
            />
            <p id="meal-ingredients-hint" className="text-[0.8125rem] text-text-muted">
              {t('ingredientsHint')}
            </p>
          </div>
          {error && (
            <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}
          <div className="flex flex-wrap justify-between gap-2">
            <div className="flex gap-2">
              {meal && (
                <Button
                  type="button"
                  variant="ghost"
                  loading={actions.remove.isPending}
                  onClick={() => actions.remove.mutate(meal.id, { onSuccess: onClose })}
                >
                  {t('delete')}
                </Button>
              )}
              {meal && meal.ingredients.length > 0 && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    onSendToShopping(meal.id);
                    onClose();
                  }}
                >
                  <ShoppingCart aria-hidden className="size-4" />
                  {t('toShopping')}
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
