import { Prisma } from '@prisma/client';

/**
 * Contenu d'une sauvegarde du foyer, table par table, dans l'ordre de restauration (une table
 * ne dépend que des précédentes). `refs` : champs qui désignent une autre ligne de la sauvegarde
 * (« member » = un membre du foyer) ; ils sont renumérotés à la restauration, comme les `id`.
 *
 * Volontairement absents : invitations, liens secrets (invité, iCal, e-mail), Google Agenda,
 * notifications, journal d'activité, échanges de tour en cours, sessions et appareils.
 */
export interface TableSpec {
  /** Clé dans `tandem-backup.json` (`data.<key>`). */
  key: string;
  /** Modèle Prisma. */
  model: Prisma.ModelName;
  /** Champ → table (modèle) ou « member ». `?` : référence facultative, oubliée si inconnue. */
  refs?: Record<string, string>;
  /** Fichier joint (`files/<key>/<id>`) : la colonne `data` n'est pas dans le JSON. */
  file?: { idField: string };
}

export const BACKUP_TABLES: TableSpec[] = [
  { key: 'categories', model: 'Category' },
  { key: 'tasks', model: 'Task', refs: { createdById: 'member', categoryId: 'Category?' } },
  { key: 'taskSeries', model: 'TaskSeries', refs: { taskId: 'Task' } },
  {
    key: 'rotationSlots',
    model: 'RotationSlot',
    refs: { seriesId: 'TaskSeries', memberId: 'member' },
  },
  {
    key: 'occurrences',
    model: 'TaskOccurrence',
    refs: { taskId: 'Task', seriesId: 'TaskSeries?', completedById: 'member?' },
  },
  {
    key: 'occurrenceAssignees',
    model: 'OccurrenceAssignee',
    refs: { occurrenceId: 'TaskOccurrence', memberId: 'member' },
  },
  {
    key: 'occurrenceThanks',
    model: 'OccurrenceThanks',
    refs: { occurrenceId: 'TaskOccurrence', memberId: 'member' },
  },
  {
    key: 'checklistItems',
    model: 'ChecklistItem',
    refs: { occurrenceId: 'TaskOccurrence', doneById: 'member?' },
  },
  { key: 'comments', model: 'TaskComment', refs: { taskId: 'Task', authorId: 'member?' } },
  {
    key: 'attachments',
    model: 'TaskAttachment',
    refs: { taskId: 'Task', createdById: 'member?' },
    file: { idField: 'id' },
  },
  { key: 'templates', model: 'TaskTemplate', refs: { createdById: 'member?' } },
  {
    key: 'shoppingItems',
    model: 'ShoppingItem',
    refs: { createdById: 'member?', doneById: 'member?' },
  },
  { key: 'shoppingProducts', model: 'ShoppingProduct' },
  { key: 'shoppingBarcodes', model: 'ShoppingBarcode' },
  { key: 'meals', model: 'Meal', refs: { createdById: 'member?' } },
  { key: 'notes', model: 'Note', refs: { createdById: 'member?', updatedById: 'member?' } },
  { key: 'noteRevisions', model: 'NoteRevision', refs: { noteId: 'Note', editedById: 'member?' } },
  { key: 'importantDates', model: 'ImportantDate', refs: { createdById: 'member?' } },
  {
    key: 'recurringExpenses',
    model: 'RecurringExpense',
    refs: { paidById: 'member', forMemberId: 'member?', createdById: 'member?' },
  },
  {
    key: 'expenses',
    model: 'Expense',
    refs: {
      paidById: 'member',
      forMemberId: 'member?',
      createdById: 'member?',
      recurringId: 'RecurringExpense?',
    },
  },
  {
    key: 'expenseShares',
    model: 'ExpenseShare',
    refs: { expenseId: 'Expense', memberId: 'member' },
  },
  {
    key: 'expenseReceipts',
    model: 'ExpenseReceipt',
    refs: { expenseId: 'Expense', createdById: 'member?' },
    file: { idField: 'expenseId' },
  },
  { key: 'categoryBudgets', model: 'ExpenseCategoryBudget' },
  { key: 'absences', model: 'MemberAbsence', refs: { memberId: 'member' } },
];

type Field = Prisma.DMMF.Field;

const models = new Map(Prisma.dmmf.datamodel.models.map((m) => [m.name, m]));
const enums = new Map(
  Prisma.dmmf.datamodel.enums.map((e) => [e.name, new Set(e.values.map((v) => v.name))]),
);

/** Colonnes d'un modèle gardées dans le JSON (ni relations, ni fichiers, ni householdId). */
export function columns(model: string): Field[] {
  const m = models.get(model);
  if (!m) throw new Error(`Unknown model ${model}`);
  return m.fields.filter(
    (f) =>
      (f.kind === 'scalar' || f.kind === 'enum') && f.type !== 'Bytes' && f.name !== 'householdId',
  );
}

/** Le modèle a-t-il une clé `id` propre (renumérotée à la restauration) ? */
export function hasOwnId(model: string): boolean {
  return columns(model).some((f) => f.name === 'id' && f.isId);
}

/** Ligne de la base → objet JSON (dates en ISO, colonnes connues seulement). */
export function encodeRow(model: string, row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of columns(model)) {
    const v = row[f.name];
    out[f.name] = v instanceof Date ? v.toISOString() : v;
  }
  return out;
}

export class BackupFormatError extends Error {}

/**
 * Objet JSON → données Prisma, chaque colonne vérifiée selon son type (une archive peut avoir été
 * modifiée à la main). Les colonnes inconnues sont ignorées ; une colonne obligatoire absente,
 * ou d'un mauvais type, rend l'archive invalide.
 */
export function decodeRow(model: string, raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new BackupFormatError(`${model}: row is not an object`);
  }
  const src = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const f of columns(model)) {
    const v = src[f.name];
    if (v === undefined || v === null) {
      if (f.isRequired && !f.hasDefaultValue && !f.isUpdatedAt) {
        throw new BackupFormatError(`${model}.${f.name}: required`);
      }
      if (v === null && !f.isRequired) out[f.name] = null;
      continue;
    }
    out[f.name] = f.isList
      ? (Array.isArray(v) ? v : fail(model, f)).map((x) => scalar(model, f, x))
      : scalar(model, f, v);
  }
  return out;
}

function scalar(model: string, f: Field, v: unknown): unknown {
  if (f.kind === 'enum') {
    return typeof v === 'string' && enums.get(f.type)?.has(v) ? v : fail(model, f);
  }
  switch (f.type) {
    case 'String':
      return typeof v === 'string' ? v : fail(model, f);
    case 'Int':
      return Number.isSafeInteger(v) ? v : fail(model, f);
    case 'Boolean':
      return typeof v === 'boolean' ? v : fail(model, f);
    case 'DateTime': {
      const d = typeof v === 'string' ? new Date(v) : null;
      return d && !Number.isNaN(d.getTime()) ? d : fail(model, f);
    }
    case 'Json':
      return v;
    default:
      return fail(model, f);
  }
}

function fail(model: string, f: Field): never {
  throw new BackupFormatError(`${model}.${f.name}: invalid value`);
}
