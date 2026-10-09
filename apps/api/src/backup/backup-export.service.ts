import { Injectable } from '@nestjs/common';
import { BACKUP_FORMAT_VERSION } from '@agenda/contracts';
import { Zip, ZipDeflate, ZipPassThrough } from 'fflate';
import type { Writable } from 'node:stream';
import type { HouseholdContext } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { BACKUP_TABLES, columns, encodeRow } from './backup-spec';

export const BACKUP_JSON = 'tandem-backup.json';
export const BACKUP_KIND = 'tandem-household-backup';

/** Fichiers déjà compressés (photos, PDF) : rangés tels quels, les recompresser ne gagne rien. */
const STORED = /^(image\/(jpeg|png|webp|heic|heif|gif)|application\/pdf)$/i;

/**
 * Sauvegarde du foyer : une archive .zip avec les données (`tandem-backup.json`) et les fichiers
 * joints (`files/attachments/<id>`, `files/expenseReceipts/<id>`). Ce que le membre ne voit pas
 * reste dehors : les tâches, dépenses et charges fixes personnelles de l'autre.
 */
@Injectable()
export class BackupExportService {
  constructor(private readonly prisma: PrismaService) {}

  /** Données du foyer, prêtes à écrire (sans les fichiers). */
  async snapshot(ctx: HouseholdContext): Promise<{
    json: Record<string, unknown>;
    files: { key: string; id: string; contentType: string }[];
  }> {
    const householdId = ctx.householdId;
    const h = await this.prisma.household.findUniqueOrThrow({
      where: { id: householdId },
      include: {
        members: { include: { user: { select: { email: true, deletedAt: true } } } },
      },
    });
    const mine = ctx.memberId;
    const db = this.prisma as unknown as Record<
      string,
      { findMany: (a: unknown) => Promise<Record<string, unknown>[]> }
    >;
    const delegate = (model: string) => db[model[0]!.toLowerCase() + model.slice(1)]!;

    const data: Record<string, Record<string, unknown>[]> = {};
    const files: { key: string; id: string; contentType: string }[] = [];
    for (const t of BACKUP_TABLES) {
      const select = Object.fromEntries(columns(t.model).map((f) => [f.name, true]));
      const rows = await delegate(t.model).findMany({
        where: visibleRows(t.model, householdId, mine),
        select,
      });
      data[t.key] = rows.map((r) => encodeRow(t.model, r));
      if (t.file) {
        for (const r of rows) {
          files.push({
            key: t.key,
            id: r[t.file.idField] as string,
            contentType: r.contentType as string,
          });
        }
      }
    }

    return {
      json: {
        kind: BACKUP_KIND,
        version: BACKUP_FORMAT_VERSION,
        exportedAt: new Date().toISOString(),
        exportedByMemberId: mine,
        household: {
          name: h.name,
          timezone: h.timezone,
          expenseBudgetCents: h.expenseBudgetCents,
        },
        members: h.members.map((m) => ({
          id: m.id,
          displayName: m.displayName,
          role: m.role,
          color: m.color,
          joinedAt: m.joinedAt.toISOString(),
          leftAt: m.leftAt?.toISOString() ?? null,
          expenseWeight: m.expenseWeight,
          // Adresse du compte, pour retrouver chacun sur l'autre instance (jamais d'autre donnée
          // de compte : ni mot de passe, ni sessions).
          email: m.user && !m.user.deletedAt ? m.user.email : (m.pendingEmail ?? null),
        })),
        data,
      },
      files,
    };
  }

  /** Écrit l'archive dans `out` (la réponse HTTP), fichier par fichier, sans tout charger. */
  async write(ctx: HouseholdContext, out: Writable): Promise<void> {
    const { json, files } = await this.snapshot(ctx);
    await new Promise<void>((resolve, reject) => {
      const zip = new Zip((err, chunk, final) => {
        if (err) return reject(err);
        out.write(Buffer.from(chunk));
        if (final) {
          out.end();
          resolve();
        }
      });
      const run = async () => {
        const main = new ZipDeflate(BACKUP_JSON, { level: 6 });
        zip.add(main);
        main.push(new TextEncoder().encode(JSON.stringify(json)), true);
        for (const f of files) {
          const row =
            f.key === 'attachments'
              ? await this.prisma.taskAttachment.findUnique({
                  where: { id: f.id },
                  select: { data: true },
                })
              : await this.prisma.expenseReceipt.findUnique({
                  where: { expenseId: f.id },
                  select: { data: true },
                });
          if (!row) continue;
          const name = `files/${f.key}/${f.id}`;
          const entry = STORED.test(f.contentType)
            ? new ZipPassThrough(name)
            : new ZipDeflate(name, { level: 6 });
          zip.add(entry);
          entry.push(new Uint8Array(row.data), true);
        }
        zip.end();
      };
      run().catch(reject);
    });
  }
}

/**
 * Lignes du foyer que le membre voit : ni les tâches personnelles de l'autre (avec tout ce qui en
 * dépend), ni ses dépenses et charges fixes personnelles. Filtres par relation : pas de longue
 * liste d'identifiants dans la requête.
 */
function visibleRows(model: string, householdId: string, mine: string): Record<string, unknown> {
  const task = { householdId, NOT: [{ visibility: 'PERSONAL', createdById: { not: mine } }] };
  const expense = { householdId, NOT: [{ split: 'PERSONAL', paidById: { not: mine } }] };
  switch (model) {
    case 'Task':
      return task;
    case 'TaskSeries':
      return { task };
    case 'RotationSlot':
      return { series: { task } };
    case 'TaskOccurrence':
    case 'TaskComment':
    case 'TaskAttachment':
      return { householdId, task };
    case 'OccurrenceAssignee':
    case 'OccurrenceThanks':
      return { occurrence: { householdId, task } };
    case 'ChecklistItem':
      return { householdId, occurrence: { task } };
    case 'NoteRevision':
      return { note: { householdId } };
    case 'Expense':
    case 'RecurringExpense':
      return expense;
    case 'ExpenseShare':
      return { expense };
    case 'ExpenseReceipt':
      return { householdId, expense };
    default:
      return { householdId };
  }
}
