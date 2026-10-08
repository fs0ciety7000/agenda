import type { Expense, ExpenseShare } from '@prisma/client';
import type { ExpenseCategory, ExpenseSplit } from '@agenda/contracts';
import { fromDbDate } from '../common/dates';
import type { Locale } from '../mail/templates';

const TEXT: Record<
  Locale,
  {
    file: string;
    headers: [string, string, string, string, string, string, string, string];
    share: (name: string) => string;
    settlement: string;
    categories: Record<ExpenseCategory, string>;
    splits: Record<ExpenseSplit, string>;
  }
> = {
  fr: {
    file: 'depenses',
    headers: ['Date', 'Titre', 'Catégorie', 'Montant (EUR)', 'Payé par', 'Partage', 'Pour', 'Note'],
    share: (name) => `Part ${name}`,
    settlement: 'Remboursement',
    categories: {
      GROCERIES: 'Courses',
      HOUSING: 'Logement',
      UTILITIES: 'Énergie et abonnements',
      TRANSPORT: 'Transport',
      LEISURE: 'Loisirs et sorties',
      HEALTH: 'Santé',
      KIDS: 'Enfants',
      GIFTS: 'Cadeaux',
      OTHER: 'Autre',
    },
    splits: {
      SHARED: 'Commune',
      CUSTOM: 'Commune, à la main',
      FOR_OTHER: 'Pour quelqu’un',
      PERSONAL: 'Perso',
    },
  },
  en: {
    file: 'expenses',
    headers: ['Date', 'Title', 'Category', 'Amount (EUR)', 'Paid by', 'Split', 'For', 'Note'],
    share: (name) => `${name}'s share`,
    settlement: 'Settlement',
    categories: {
      GROCERIES: 'Groceries',
      HOUSING: 'Housing',
      UTILITIES: 'Utilities and subscriptions',
      TRANSPORT: 'Transport',
      LEISURE: 'Leisure and outings',
      HEALTH: 'Health',
      KIDS: 'Kids',
      GIFTS: 'Gifts',
      OTHER: 'Other',
    },
    splits: {
      SHARED: 'Shared',
      CUSTOM: 'Shared, custom',
      FOR_OTHER: 'For someone',
      PERSONAL: 'Personal',
    },
  },
  nl: {
    file: 'uitgaven',
    headers: [
      'Datum',
      'Titel',
      'Categorie',
      'Bedrag (EUR)',
      'Betaald door',
      'Verdeling',
      'Voor',
      'Notitie',
    ],
    share: (name) => `Deel ${name}`,
    settlement: 'Terugbetaling',
    categories: {
      GROCERIES: 'Boodschappen',
      HOUSING: 'Wonen',
      UTILITIES: 'Energie en abonnementen',
      TRANSPORT: 'Vervoer',
      LEISURE: 'Vrije tijd en uitstappen',
      HEALTH: 'Gezondheid',
      KIDS: 'Kinderen',
      GIFTS: 'Cadeaus',
      OTHER: 'Overige',
    },
    splits: {
      SHARED: 'Gedeeld',
      CUSTOM: 'Gedeeld, zelf verdeeld',
      FOR_OTHER: 'Voor iemand',
      PERSONAL: 'Persoonlijk',
    },
  },
};

/** Nom d'une catégorie dans la langue de la personne (« Courses », « Groceries »…). */
export const categoryLabel = (locale: Locale, category: ExpenseCategory): string =>
  TEXT[locale].categories[category];

/**
 * Cellule CSV : entre guillemets si besoin. Un texte qui commence par = + - @ (ou une
 * tabulation) est préfixé d'une apostrophe : le tableur ne l'exécute pas comme une formule.
 */
export function csvCell(value: string, separator: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /["\r\n]/.test(safe) || safe.includes(separator) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/**
 * Export des dépenses : séparateur « ; » et virgule décimale en français et en néerlandais (ce
 * qu'attend Excel dans ces langues), « , » et point en anglais. BOM UTF-8 pour les accents.
 */
export function expensesCsv(
  locale: Locale,
  from: string,
  to: string,
  rows: (Expense & { shares: ExpenseShare[] })[],
  members: { id: string; displayName: string }[],
): { filename: string; body: string } {
  const t = TEXT[locale];
  const sep = locale === 'en' ? ',' : ';';
  const amount = (cents: number) => {
    const s = (cents / 100).toFixed(2);
    return locale === 'en' ? s : s.replace('.', ',');
  };
  const name = (id: string | null) => members.find((m) => m.id === id)?.displayName ?? '';
  // Une colonne de part par membre concerné par au moins une ligne.
  const sharers = members.filter((m) =>
    rows.some((e) => e.kind === 'EXPENSE' && e.shares.some((s) => s.memberId === m.id)),
  );
  const header = [
    ...t.headers.slice(0, 7),
    ...sharers.map((m) => t.share(m.displayName)),
    t.headers[7],
  ];
  const lines = rows.map((e) => {
    const settlement = e.kind === 'SETTLEMENT';
    const cells = [
      fromDbDate(e.date)!,
      settlement ? t.settlement : e.title,
      settlement ? '' : t.categories[e.category],
      amount(e.amountCents),
      name(e.paidById),
      settlement ? t.settlement : t.splits[e.split],
      settlement || e.split === 'FOR_OTHER' ? name(e.forMemberId) : '',
      ...sharers.map((m) => {
        const share = settlement ? undefined : e.shares.find((s) => s.memberId === m.id);
        return share ? amount(share.amountCents) : '';
      }),
      e.note ?? '',
    ];
    return cells.map((c) => csvCell(c, sep)).join(sep);
  });
  return {
    filename: from === to ? `tandem-${t.file}-${from}.csv` : `tandem-${t.file}-${from}-${to}.csv`,
    body: `\ufeff${[header.map((c) => csvCell(c, sep)).join(sep), ...lines].join('\r\n')}\r\n`,
  };
}
