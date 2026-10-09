import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  ATTACHMENT_MAX_BYTES,
  BACKUP_FORMAT_VERSION,
  HOUSEHOLD_ATTACHMENTS_MAX_BYTES,
  MemberColor,
  type RestoreResultDto,
} from '@agenda/contracts';
import { Unzip, UnzipInflate } from 'fflate';
import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { AppException } from '../common/app-exception';
import { randomToken, sha256Hex } from '../common/crypto';
import { HouseholdsService } from '../households/households.service';
import { PrismaService } from '../prisma/prisma.service';
import { BACKUP_JSON, BACKUP_KIND } from './backup-export.service';
import { BACKUP_TABLES, BackupFormatError, decodeRow, hasOwnId } from './backup-spec';

/** Le JSON d'un foyer fait quelques Mo ; au-delà, ce n'est pas une sauvegarde de Tandem. */
const JSON_MAX_BYTES = 64 * 1024 * 1024;
/** Fichiers joints : le quota du foyer, plus une marge (tickets et pièces jointes ensemble). */
const FILES_MAX_BYTES = HOUSEHOLD_ATTACHMENTS_MAX_BYTES + 16 * 1024 * 1024;
const MAX_ENTRIES = 20_000;
/** Invitations des membres restaurés : le temps de prévenir l'autre. */
const RESTORED_INVITATION_TTL_MS = 30 * 86_400_000;

const invalid = (why: string) =>
  new AppException('BACKUP_INVALID', HttpStatus.UNPROCESSABLE_ENTITY, `Invalid backup: ${why}`);

interface Archive {
  json: unknown;
  files: Map<string, Buffer>;
}

interface BackupMember {
  id: string;
  displayName: string;
  role: 'OWNER' | 'MEMBER';
  color: string;
  joinedAt: string;
  leftAt: string | null;
  expenseWeight: number;
  email: string | null;
}

/**
 * Restauration d'une sauvegarde sur cette instance : un **nouveau** foyer, dont tous les
 * identifiants sont refaits (aucune collision, rien qui désigne une ligne existante). La personne
 * qui restaure reprend son membre (même adresse, sinon celui qui a exporté) ; chaque autre membre
 * reçoit une invitation à son adresse et retrouve son historique en l'acceptant.
 */
@Injectable()
export class BackupRestoreService {
  private readonly logger = new Logger(BackupRestoreService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly households: HouseholdsService,
  ) {}

  async restore(userId: string, path: string): Promise<RestoreResultDto> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const already = await this.prisma.householdMember.count({
      where: { userId, leftAt: null, household: { deletedAt: null } },
    });
    // L'app suit un seul foyer : restaurer se fait depuis un compte encore sans foyer.
    if (already) {
      throw new AppException('ALREADY_MEMBER', HttpStatus.CONFLICT, 'Already in a household');
    }
    const archive = await readArchive(path);
    const backup = archive.json as Record<string, unknown>;
    if (backup?.kind !== BACKUP_KIND) throw invalid('not a Tandem backup');
    if (backup.version !== BACKUP_FORMAT_VERSION) throw invalid('unsupported version');
    const members = parseMembers(backup.members);
    const household = parseHousehold(backup.household);
    const data = (backup.data ?? {}) as Record<string, unknown>;

    // Qui est qui : même adresse, sinon la personne qui a exporté.
    const me =
      members.find((m) => m.email?.toLowerCase() === user.email.toLowerCase() && !m.leftAt) ??
      members.find((m) => m.id === backup.exportedByMemberId);
    if (!me) throw invalid('no member for the restoring user');

    const newHouseholdId = randomUUID();
    const ids = new Map<string, Map<string, string>>();
    const map = (table: string) => ids.get(table) ?? ids.set(table, new Map()).get(table)!;
    for (const m of members) map('member').set(m.id, randomUUID());

    // Chaque table : lignes vérifiées, identifiants refaits, références traduites.
    const rows: { model: Prisma.ModelName; rows: Record<string, unknown>[] }[] = [];
    const counts: Record<string, number> = {};
    let fileBytes = 0;
    try {
      for (const t of BACKUP_TABLES) {
        const raw = data[t.key] ?? [];
        if (!Array.isArray(raw)) throw new BackupFormatError(`${t.key}: not a list`);
        const out: Record<string, unknown>[] = [];
        for (const r of raw) {
          const row = decodeRow(t.model, r);
          if (hasOwnId(t.model)) {
            const old = row.id as string;
            if (map(t.model).has(old)) throw new BackupFormatError(`${t.model}: duplicate id`);
            row.id = randomUUID();
            map(t.model).set(old, row.id as string);
          }
          for (const [field, target] of Object.entries(t.refs ?? {})) {
            const optional = target.endsWith('?');
            const table = optional ? target.slice(0, -1) : target;
            const old = row[field];
            if (old === undefined || old === null) continue;
            const next = map(table).get(old as string);
            if (next) row[field] = next;
            else if (optional) row[field] = null;
            else throw new BackupFormatError(`${t.model}.${field}: unknown reference`);
          }
          if (t.model === 'TaskTemplate') row.items = remapTemplate(row.items, map);
          if (t.file) {
            const old = (r as Record<string, unknown>)[t.file.idField] as string;
            const file = archive.files.get(`files/${t.key}/${old}`);
            if (!file) throw new BackupFormatError(`${t.key}: missing file`);
            if (file.length > ATTACHMENT_MAX_BYTES) throw new BackupFormatError('file too large');
            fileBytes += file.length;
            row.data = file;
            row.size = file.length;
          }
          // Les tables sans householdId (rattachées à un parent) n'en reçoivent pas.
          if (
            t.model !== 'TaskSeries' &&
            t.model !== 'RotationSlot' &&
            t.model !== 'NoteRevision' &&
            t.model !== 'OccurrenceAssignee' &&
            t.model !== 'OccurrenceThanks' &&
            t.model !== 'ExpenseShare'
          ) {
            row.householdId = newHouseholdId;
          }
          out.push(row);
        }
        rows.push({ model: t.model, rows: out });
        counts[t.key] = out.length;
      }
    } catch (e) {
      if (e instanceof BackupFormatError) throw invalid(e.message);
      throw e;
    }
    if (fileBytes > HOUSEHOLD_ATTACHMENTS_MAX_BYTES)
      throw invalid('files over the household quota');

    const db = (tx: Prisma.TransactionClient) =>
      tx as unknown as Record<
        string,
        { createMany: (a: unknown) => Promise<unknown>; create: (a: unknown) => Promise<unknown> }
      >;
    const delegateName = (model: string) => model[0]!.toLowerCase() + model.slice(1);
    const invitations: RestoreResultDto['invitations'] = [];

    try {
      await this.prisma.$transaction(
        async (tx) => {
          await tx.household.create({
            data: { id: newHouseholdId, ...household },
          });
          const used = new Set<string>();
          for (const m of members) {
            const isMe = m.id === me.id;
            // Une adresse active, et un compte qui n'existe pas encore ici : on l'attendra.
            const pending = !isMe && !m.leftAt && m.email ? m.email : null;
            const color = MemberColor.safeParse(m.color).success ? m.color : 'slate';
            used.add(color);
            await tx.householdMember.create({
              data: {
                id: map('member').get(m.id)!,
                householdId: newHouseholdId,
                userId: isMe ? userId : null,
                role: isMe ? 'OWNER' : 'MEMBER',
                displayName: m.displayName,
                color,
                joinedAt: new Date(m.joinedAt),
                leftAt: m.leftAt ? new Date(m.leftAt) : null,
                expenseWeight: m.expenseWeight,
                pendingEmail: pending,
              },
            });
          }
          for (const { model, rows: list } of rows) {
            if (!list.length) continue;
            const d = db(tx)[delegateName(model)]!;
            if (model === 'TaskAttachment' || model === 'ExpenseReceipt') {
              // Un fichier à la fois : une seule requête de 200 Mo n'aurait aucun intérêt.
              for (const row of list) await d.create({ data: row });
            } else {
              for (let i = 0; i < list.length; i += 1000) {
                await d.createMany({ data: list.slice(i, i + 1000) });
              }
            }
          }
          const meId = map('member').get(me.id)!;
          for (const m of members) {
            if (m.id === me.id || m.leftAt || !m.email) continue;
            const token = randomToken();
            const expiresAt = new Date(Date.now() + RESTORED_INVITATION_TTL_MS);
            await tx.householdInvitation.create({
              data: {
                householdId: newHouseholdId,
                invitedById: meId,
                email: m.email,
                tokenHash: sha256Hex(token),
                expiresAt,
              },
            });
            invitations.push({
              memberId: map('member').get(m.id)!,
              displayName: m.displayName,
              email: m.email,
              token,
              expiresAt: expiresAt.toISOString(),
            });
          }
        },
        { timeout: 120_000, maxWait: 10_000 },
      );
    } catch (e) {
      if (e instanceof AppException) throw e;
      // Contrainte refusée par la base (texte trop long, doublon…) : archive incohérente.
      if (
        e instanceof Prisma.PrismaClientKnownRequestError ||
        e instanceof Prisma.PrismaClientValidationError
      ) {
        this.logger.warn(`Backup restore rejected: ${(e as Error).message.slice(0, 300)}`);
        throw invalid('rejected by the database');
      }
      throw e;
    }

    const restored = await this.households.get({
      householdId: newHouseholdId,
      memberId: map('member').get(me.id)!,
      role: 'OWNER',
    });
    return { household: restored, invitations, counts };
  }
}

function parseHousehold(raw: unknown): {
  name: string;
  timezone: string;
  expenseBudgetCents: number | null;
} {
  const h = raw as Record<string, unknown> | null;
  if (!h || typeof h.name !== 'string' || !h.name.trim() || typeof h.timezone !== 'string') {
    throw invalid('household');
  }
  const budget = h.expenseBudgetCents;
  return {
    name: h.name.slice(0, 80),
    timezone: h.timezone,
    expenseBudgetCents: Number.isSafeInteger(budget) ? (budget as number) : null,
  };
}

function parseMembers(raw: unknown): BackupMember[] {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 20) throw invalid('members');
  const seen = new Set<string>();
  return raw.map((r) => {
    const m = r as Record<string, unknown>;
    const ok =
      typeof m.id === 'string' &&
      !seen.has(m.id) &&
      typeof m.displayName === 'string' &&
      (m.role === 'OWNER' || m.role === 'MEMBER') &&
      typeof m.color === 'string' &&
      typeof m.joinedAt === 'string' &&
      !Number.isNaN(new Date(m.joinedAt).getTime()) &&
      (m.leftAt === null ||
        (typeof m.leftAt === 'string' && !Number.isNaN(new Date(m.leftAt).getTime()))) &&
      Number.isSafeInteger(m.expenseWeight) &&
      (m.email === null || (typeof m.email === 'string' && m.email.includes('@')));
    if (!ok) throw invalid('member');
    seen.add(m.id as string);
    return {
      id: m.id as string,
      displayName: (m.displayName as string).slice(0, 40),
      role: m.role as 'OWNER' | 'MEMBER',
      color: m.color as string,
      joinedAt: m.joinedAt as string,
      leftAt: m.leftAt as string | null,
      expenseWeight: Math.min(Math.max(m.expenseWeight as number, 1), 100),
      email: (m.email as string | null)?.slice(0, 254) ?? null,
    };
  });
}

/** Modèles : catégorie et responsables renumérotés ; un responsable inconnu est oublié. */
function remapTemplate(items: unknown, map: (table: string) => Map<string, string>): unknown {
  if (!Array.isArray(items)) throw new BackupFormatError('TaskTemplate.items: not a list');
  return items.map((it) => {
    if (!it || typeof it !== 'object') throw new BackupFormatError('TaskTemplate.items');
    const item = { ...(it as Record<string, unknown>) };
    if (typeof item.categoryId === 'string')
      item.categoryId = map('Category').get(item.categoryId) ?? null;
    if (Array.isArray(item.assigneeIds)) {
      item.assigneeIds = item.assigneeIds
        .map((id) => (typeof id === 'string' ? map('member').get(id) : undefined))
        .filter(Boolean);
    }
    return item;
  });
}

/**
 * Lit l'archive en continu depuis le disque, avec des plafonds (taille du JSON, des fichiers,
 * nombre d'entrées) vérifiés pendant la décompression : une « bombe » zip est arrêtée tôt.
 */
function readArchive(path: string): Promise<Archive> {
  return new Promise((resolve, reject) => {
    const files = new Map<string, Buffer>();
    let json: Buffer | null = null;
    let entries = 0;
    let filesTotal = 0;
    let pending = 0;
    let ended = false;
    let failed = false;
    const fail = (why: string) => {
      if (failed) return;
      failed = true;
      stream.destroy();
      reject(invalid(why));
    };
    const done = () => {
      if (failed || !ended || pending) return;
      if (!json) return fail('missing tandem-backup.json');
      try {
        resolve({ json: JSON.parse(json.toString('utf8')), files });
      } catch {
        fail('unreadable tandem-backup.json');
      }
    };
    const unzip = new Unzip((file) => {
      if (failed) return;
      if (++entries > MAX_ENTRIES) return fail('too many entries');
      const isJson = file.name === BACKUP_JSON;
      const isFile = /^files\/(attachments|expenseReceipts)\/[0-9a-f-]{36}$/.test(file.name);
      if (!isJson && !isFile) return; // entrée inconnue : ignorée, jamais décompressée
      const limit = isJson ? JSON_MAX_BYTES : ATTACHMENT_MAX_BYTES;
      const chunks: Uint8Array[] = [];
      let size = 0;
      pending++;
      file.ondata = (err, chunk, final) => {
        if (failed) return;
        if (err) return fail('corrupted archive');
        size += chunk.length;
        if (!isJson) filesTotal += chunk.length;
        if (size > limit || filesTotal > FILES_MAX_BYTES) return fail('archive too large');
        chunks.push(chunk);
        if (final) {
          const buf = Buffer.concat(chunks);
          if (isJson) json = buf;
          else files.set(file.name, buf);
          pending--;
          done();
        }
      };
      file.start();
    });
    unzip.register(UnzipInflate);
    const stream = createReadStream(path);
    stream.on('data', (c) => {
      try {
        unzip.push(new Uint8Array(c as Buffer));
      } catch {
        fail('corrupted archive');
      }
    });
    stream.on('end', () => {
      try {
        unzip.push(new Uint8Array(0), true);
      } catch {
        return fail('corrupted archive');
      }
      ended = true;
      done();
    });
    stream.on('error', () => fail('unreadable upload'));
  });
}
