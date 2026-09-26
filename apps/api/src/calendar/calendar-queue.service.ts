import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue, Worker, type Job } from 'bullmq';
import { DomainEvents } from '../common/domain-events';
import { env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleCalendarSyncService } from './calendar-sync.service';

type JobData = { householdId?: string };
const QUEUE = 'calendar-sync';
/** Regroupe les modifications rapprochées (ex. plusieurs coches) en un seul balayage. */
const DEBOUNCE_MS = 2_000;
const SWEEP_ALL_EVERY_MS = 10 * 60_000;
const RECONCILE_ALL_EVERY_MS = 6 * 60 * 60_000;
/** Relève des modifications faites dans Google (sens Google → app). */
const PULL_ALL_EVERY_MS = 5 * 60_000;

export type SyncMode = 'queue' | 'inline' | 'off';

export function syncMode(): SyncMode {
  const e = env();
  if (e.CALENDAR_SYNC_MODE) return e.CALENDAR_SYNC_MODE;
  if (e.NODE_ENV === 'test') return 'off';
  return e.REDIS_URL ? 'queue' : 'inline';
}

/**
 * Déclenchement des synchronisations, sans jamais bloquer les requêtes utilisateur.
 * - `queue` (production) : BullMQ + Redis, un seul job à la fois (aucune course entre synchros),
 *   balayage de tous les foyers toutes les 10 min, réconciliation toutes les 6 h.
 * - `inline` (développement sans Redis) : minuterie en mémoire.
 * - `off` (tests) : rien d'automatique, les tests appellent le service directement.
 */
@Injectable()
export class CalendarQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CalendarQueueService.name);
  private queue?: Queue<JobData>;
  private worker?: Worker<JobData>;
  private timers = new Map<string, NodeJS.Timeout>();
  private intervals: NodeJS.Timeout[] = [];

  constructor(
    private readonly sync: GoogleCalendarSyncService,
    private readonly prisma: PrismaService,
    events: DomainEvents,
  ) {
    events.onHouseholdChanged((householdId) => void this.scheduleSweep(householdId));
  }

  async onModuleInit(): Promise<void> {
    const mode = syncMode();
    if (mode === 'queue') {
      const connection = { url: env().REDIS_URL!, maxRetriesPerRequest: null };
      this.queue = new Queue<JobData>(QUEUE, {
        connection,
        defaultJobOptions: {
          removeOnComplete: 100,
          removeOnFail: 500,
          attempts: 5,
          backoff: { type: 'exponential', delay: 5_000 },
        },
      });
      this.worker = new Worker<JobData>(QUEUE, (job) => this.process(job), {
        connection,
        concurrency: 1,
      });
      this.worker.on('failed', (job, err) =>
        this.logger.warn(`Job ${job?.name} failed: ${err.message}`),
      );
      await this.queue.upsertJobScheduler(
        'sweep-all',
        { every: SWEEP_ALL_EVERY_MS },
        { name: 'sweep-all' },
      );
      await this.queue.upsertJobScheduler(
        'reconcile-all',
        { every: RECONCILE_ALL_EVERY_MS },
        { name: 'reconcile-all' },
      );
      await this.queue.upsertJobScheduler(
        'pull-all',
        { every: PULL_ALL_EVERY_MS },
        { name: 'pull-all' },
      );
    } else if (mode === 'inline') {
      this.intervals.push(setInterval(() => void this.runAll('sweep'), SWEEP_ALL_EVERY_MS).unref());
      this.intervals.push(
        setInterval(() => void this.runAll('reconcile'), RECONCILE_ALL_EVERY_MS).unref(),
      );
      this.intervals.push(setInterval(() => void this.runAll('pull'), PULL_ALL_EVERY_MS).unref());
    }
    this.logger.log(`Calendar sync mode: ${mode}`);
  }

  async onModuleDestroy(): Promise<void> {
    this.timers.forEach((t) => clearTimeout(t));
    this.intervals.forEach((t) => clearInterval(t));
    await this.worker?.close();
    await this.queue?.close();
  }

  /** Planifie un balayage du foyer (regroupé sur une fenêtre de 2 s). */
  async scheduleSweep(householdId: string, delayMs = DEBOUNCE_MS): Promise<void> {
    const mode = syncMode();
    if (mode === 'queue' && this.queue) {
      const bucket = Math.floor((Date.now() + delayMs) / DEBOUNCE_MS);
      await this.queue
        .add('sweep', { householdId }, { jobId: `sweep:${householdId}:${bucket}`, delay: delayMs })
        .catch((e: Error) => this.logger.warn(`Could not enqueue sweep: ${e.message}`)); // rattrapé par le balayage périodique
    } else if (mode === 'inline') {
      if (this.timers.has(householdId)) return;
      this.timers.set(
        householdId,
        setTimeout(() => {
          this.timers.delete(householdId);
          void this.runSweep(householdId);
        }, delayMs).unref(),
      );
    }
  }

  /** Synchronisation complète à la demande (bouton « Synchroniser maintenant »). */
  async scheduleFull(householdId: string): Promise<void> {
    if (syncMode() === 'queue' && this.queue) {
      await this.queue
        .add('reconcile', { householdId }, { jobId: `reconcile:${householdId}:${Date.now()}` })
        .catch((e: Error) => this.logger.warn(`Could not enqueue reconcile: ${e.message}`));
    } else if (syncMode() === 'inline') {
      void this.sync
        .pull(householdId)
        .catch(() => undefined)
        .then(() => this.sync.reconcile(householdId))
        .catch(() => undefined)
        .then(() => this.runSweep(householdId));
    }
  }

  private async process(job: Job<JobData>): Promise<void> {
    switch (job.name) {
      case 'sweep':
        return this.runSweep(job.data.householdId!);
      case 'reconcile':
        // « Synchroniser maintenant » : d'abord ce qui a changé dans Google, puis la réconciliation.
        await this.sync
          .pull(job.data.householdId!)
          .catch((e: Error) => this.logger.warn(`Pull failed: ${e.message}`));
        await this.sync
          .reconcile(job.data.householdId!)
          .catch((e: Error) => this.logger.warn(`Reconcile failed: ${e.message}`));
        return this.runSweep(job.data.householdId!);
      case 'sweep-all':
        return this.runAll('sweep');
      case 'reconcile-all':
        return this.runAll('reconcile');
      case 'pull-all':
        return this.runAll('pull');
    }
  }

  private async runSweep(householdId: string): Promise<void> {
    const result = await this.sync.sweep(householdId);
    if (result.created || result.updated || result.deleted || result.failed || result.blocked) {
      this.logger.log(`Sweep ${householdId}: ${JSON.stringify(result)}`);
    }
    // Erreurs temporaires ou quota : nouvelle tentative planifiée.
    if (result.retryInMs && !result.blocked)
      await this.scheduleSweep(householdId, result.retryInMs);
  }

  private async runAll(kind: 'sweep' | 'reconcile' | 'pull'): Promise<void> {
    const links = await this.prisma.householdCalendarLink.findMany({
      where: { status: 'ACTIVE' },
      select: { householdId: true },
    });
    for (const { householdId } of links) {
      try {
        if (kind === 'pull') {
          const pulled = await this.sync.pull(householdId);
          if (pulled.updated || pulled.detached) {
            this.logger.log(`Pull ${householdId}: ${JSON.stringify(pulled)}`);
          }
          continue;
        }
        if (kind === 'reconcile') await this.sync.reconcile(householdId);
        await this.runSweep(householdId);
      } catch (e) {
        this.logger.warn(
          `${kind} ${householdId} failed: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
  }
}
