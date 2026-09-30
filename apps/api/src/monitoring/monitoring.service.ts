import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type {
  AdminMonitoringDto,
  ComponentStatus,
  MonitoredComponent,
  StatusPageDto,
} from '@agenda/contracts';
import { monitorEventLoopDelay, type IntervalHistogram } from 'node:perf_hooks';
import { isAdminEmail } from '../auth/auth.service';
import { CalendarQueueService } from '../calendar/calendar-queue.service';
import { env } from '../config/env';
import { MailService } from '../mail/mail.service';
import { incidentEmail, mailLocale } from '../mail/templates';
import { WebPushService } from '../notifications/web-push.service';
import { PrismaService } from '../prisma/prisma.service';
import { requestMetrics } from './request-metrics';

interface ProbeResult {
  ok: boolean;
  latencyMs: number | null;
  detail: string | null;
}

const DAY = 86_400_000;
const EVERY_MS = 60_000;
/** Sondes ratées d'affilée avant d'ouvrir un incident (les sauvegardes : tout de suite). */
const THRESHOLD: Partial<Record<MonitoredComponent, number>> = { backups: 1 };
/** Composants dont l'échec rend le service indisponible (les autres : dégradé). */
const CRITICAL: MonitoredComponent[] = ['database'];
const LOOP_RESOLUTION_MS = 20;
const BACKUP_MAX_AGE_MS = 26 * 3600_000;
const EMAIL_EVERY_MS = 15 * 60_000;

/**
 * Surveillance interne : une sonde par composant toutes les minutes (base, Redis et file de
 * synchronisation, SMTP, fraîcheur des sauvegardes), historique pour la page /status, incidents
 * ouverts et fermés automatiquement avec alerte aux administrateurs (ADMIN_EMAILS).
 * Complète une surveillance EXTERNE (Uptime Kuma, workflow GitHub) : si le serveur tombe, ces
 * sondes tombent avec lui.
 */
@Injectable()
export class MonitoringService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MonitoringService.name);
  private timer?: NodeJS.Timeout;
  private runs = 0;
  private failures = new Map<MonitoredComponent, number>();
  private emailCache?: { at: number; result: ProbeResult | null };
  private statusCache?: { at: number; dto: StatusPageDto };
  private readonly loop: IntervalHistogram = monitorEventLoopDelay({
    resolution: LOOP_RESOLUTION_MS,
  });

  constructor(
    private readonly prisma: PrismaService,
    private readonly calendar: CalendarQueueService,
    private readonly mail: MailService,
    private readonly webPush: WebPushService,
  ) {}

  onModuleInit(): void {
    this.loop.enable();
    const enabled = env().MONITORING_ENABLED ?? env().NODE_ENV !== 'test';
    if (!enabled) return;
    this.timer = setInterval(() => {
      void this.runChecks().catch((e: unknown) =>
        this.logger.warn(`Monitoring failed: ${(e as Error).message}`),
      );
    }, EVERY_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.loop.disable();
  }

  /** Une passe de sondes (appelée chaque minute ; les tests l'appellent directement). */
  async runChecks(): Promise<Partial<Record<MonitoredComponent, ProbeResult>>> {
    const results: Partial<Record<MonitoredComponent, ProbeResult>> = {
      api: { ok: true, latencyMs: 0, detail: null },
      database: await this.probe(async () => {
        await this.prisma.$queryRaw`SELECT 1`;
        return null;
      }),
    };
    const queue = await this.queueProbe();
    if (queue) {
      // La file de synchronisation vit dans Redis : si elle répond, Redis répond.
      results.redis = {
        ok: queue.reachable,
        latencyMs: queue.latencyMs,
        detail: queue.reachable ? null : queue.detail,
      };
      results.calendar = { ok: queue.ok, latencyMs: queue.latencyMs, detail: queue.detail };
    }
    const email = await this.emailProbe();
    if (email) results.email = email;
    const backups = await this.backupProbe();
    if (backups) results.backups = backups;

    await this.record(results);
    await this.flushRequests();
    if (++this.runs % 60 === 1) await this.purge();
    this.statusCache = undefined;
    return results;
  }

  /** Exécute une sonde avec délai maximal ; `detail` = message d'erreur éventuel. */
  private async probe(fn: () => Promise<string | null>): Promise<ProbeResult> {
    const start = Date.now();
    try {
      const detail = await withTimeout(fn());
      return { ok: true, latencyMs: Date.now() - start, detail };
    } catch (e) {
      return {
        ok: false,
        latencyMs: Date.now() - start,
        detail: (e as Error).message.slice(0, 200),
      };
    }
  }

  /** File Google Calendar (BullMQ sur Redis). null = pas de file (développement, tests). */
  private async queueProbe() {
    const start = Date.now();
    try {
      const counts = await withTimeout(this.calendar.health());
      if (!counts) return null;
      const latencyMs = Date.now() - start;
      // Plus de 200 tâches en attente : les modifications n'arrivent plus dans Google.
      return {
        reachable: true,
        ok: counts.waiting < 200,
        latencyMs,
        detail: `${counts.waiting} en attente, ${counts.failed} en échec`,
      };
    } catch (e) {
      return {
        reachable: false,
        ok: false,
        latencyMs: Date.now() - start,
        detail: (e as Error).message.slice(0, 200),
      };
    }
  }

  private async emailProbe(): Promise<ProbeResult | null> {
    if (this.emailCache && Date.now() - this.emailCache.at < EMAIL_EVERY_MS)
      return this.emailCache.result;
    const start = Date.now();
    let result: ProbeResult | null;
    try {
      const ok = await this.mail.verify();
      result = ok === null ? null : { ok: true, latencyMs: Date.now() - start, detail: null };
    } catch (e) {
      result = {
        ok: false,
        latencyMs: Date.now() - start,
        detail: (e as Error).message.slice(0, 200),
      };
    }
    this.emailCache = { at: Date.now(), result };
    return result;
  }

  private async backupProbe(): Promise<ProbeResult | null> {
    const last = await this.prisma.backupRun.findFirst({
      where: { status: { in: ['OK', 'FAILED'] } },
      orderBy: { finishedAt: 'desc' },
    });
    if (!last) return null; // service backup pas encore déployé : non surveillé
    const lastOk = await this.prisma.backupRun.findFirst({
      where: { status: 'OK' },
      orderBy: { finishedAt: 'desc' },
      select: { finishedAt: true },
    });
    const age = lastOk?.finishedAt ? Date.now() - lastOk.finishedAt.getTime() : Infinity;
    const ok = age <= BACKUP_MAX_AGE_MS && last.status === 'OK';
    return {
      ok,
      latencyMs: null,
      detail: ok
        ? null
        : last.status === 'FAILED'
          ? `dernière sauvegarde en échec : ${last.summary ?? '?'}`.slice(0, 200)
          : 'aucune sauvegarde réussie depuis plus de 26 h',
    };
  }

  private async record(results: Partial<Record<MonitoredComponent, ProbeResult>>) {
    const now = new Date();
    const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    for (const [component, r] of Object.entries(results) as [MonitoredComponent, ProbeResult][]) {
      await this.prisma.statusCheck.create({
        data: { component, ok: r.ok, latencyMs: r.latencyMs, detail: r.detail },
      });
      await this.prisma.statusDaily.upsert({
        where: { component_day: { component, day } },
        create: { component, day, checks: 1, failures: r.ok ? 0 : 1, latencySum: r.latencyMs ?? 0 },
        update: {
          checks: { increment: 1 },
          failures: { increment: r.ok ? 0 : 1 },
          latencySum: { increment: r.latencyMs ?? 0 },
        },
      });
      await this.track(component, r);
    }
  }

  /** Incidents : ouverts après N échecs d'affilée, fermés à la première sonde réussie. */
  private async track(component: MonitoredComponent, r: ProbeResult) {
    const open = await this.prisma.incident.findFirst({
      where: { component, resolvedAt: null },
    });
    if (r.ok) {
      this.failures.set(component, 0);
      if (open) {
        await this.prisma.incident.update({
          where: { id: open.id },
          data: { resolvedAt: new Date() },
        });
        this.logger.log(`Incident résolu : ${component}`);
        await this.alert('resolved', component, open.detail, open.startedAt);
      }
      return;
    }
    const count = (this.failures.get(component) ?? 0) + 1;
    this.failures.set(component, count);
    if (!open && count >= (THRESHOLD[component] ?? 2)) {
      await this.prisma.incident.create({ data: { component, detail: r.detail } });
      this.logger.error(`Incident ouvert : ${component} (${r.detail ?? 'échec'})`);
      await this.alert('opened', component, r.detail, new Date());
    }
  }

  /** Alerte aux administrateurs : e-mail et notification sur leurs navigateurs. */
  private async alert(
    kind: 'opened' | 'resolved',
    component: MonitoredComponent,
    detail: string | null,
    since: Date,
  ) {
    try {
      const admins = (
        await this.prisma.user.findMany({
          where: { deletedAt: null, disabledAt: null },
          select: { id: true, email: true, locale: true },
        })
      ).filter((u) => isAdminEmail(u.email));
      for (const a of admins) {
        const locale = mailLocale(a.locale);
        const mail = incidentEmail(
          locale,
          kind,
          component,
          detail,
          since,
          `${env().WEB_ORIGIN}/admin`,
        );
        await this.mail.send({ to: a.email, ...mail }).catch(() => {});
        await this.webPush
          .sendToUser(a.id, {
            title: mail.subject,
            body: mail.text.split('\n')[0]!,
            url: '/admin',
            tag: `incident-${component}`,
          })
          .catch(() => 0);
      }
    } catch (e) {
      this.logger.warn(`Alert failed: ${(e as Error).message}`);
    }
  }

  /** Minutes de requêtes terminées → base. */
  async flushRequests(): Promise<void> {
    for (const { minute, bucket } of requestMetrics.drainCompleted()) {
      await this.prisma.requestMetric.upsert({
        where: { minute },
        create: { minute, ...bucket },
        update: {
          requests: { increment: bucket.requests },
          errors4xx: { increment: bucket.errors4xx },
          errors5xx: { increment: bucket.errors5xx },
          latencySum: { increment: bucket.latencySum },
          latencyMax: bucket.latencyMax,
          slow: { increment: bucket.slow },
        },
      });
    }
  }

  private async purge() {
    const now = Date.now();
    await this.prisma.statusCheck.deleteMany({
      where: { checkedAt: { lt: new Date(now - 7 * DAY) } },
    });
    await this.prisma.requestMetric.deleteMany({
      where: { minute: { lt: new Date(now - 8 * DAY) } },
    });
    await this.prisma.statusDaily.deleteMany({ where: { day: { lt: new Date(now - 400 * DAY) } } });
  }

  // ───────────── Lecture ─────────────

  /** Page publique /status (mise en cache 30 s). */
  async statusPage(): Promise<StatusPageDto> {
    if (this.statusCache && Date.now() - this.statusCache.at < 30_000) return this.statusCache.dto;
    const since = new Date(Date.now() - 89 * DAY);
    const start = new Date(
      Date.UTC(since.getUTCFullYear(), since.getUTCMonth(), since.getUTCDate()),
    );
    const [daily, latest, incidents, open] = await Promise.all([
      this.prisma.statusDaily.findMany({ where: { day: { gte: start } } }),
      this.latestChecks(),
      this.prisma.incident.findMany({
        where: { startedAt: { gte: start } },
        orderBy: { startedAt: 'desc' },
        take: 30,
      }),
      this.prisma.incident.findMany({ where: { resolvedAt: null } }),
    ]);
    const days = Array.from({ length: 90 }, (_, i) =>
      new Date(start.getTime() + i * DAY).toISOString().slice(0, 10),
    );
    const keys = [...new Set([...latest.map((c) => c.component), ...daily.map((d) => d.component)])]
      .filter(isComponent)
      .sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
    const fresh = (at: Date) => Date.now() - at.getTime() < 5 * 60_000;
    const components = keys.map((key) => {
      const rows = daily.filter((d) => d.component === key);
      const byDay = new Map(rows.map((d) => [d.day.toISOString().slice(0, 10), d]));
      const checks = rows.reduce((n, d) => n + d.checks, 0);
      const failures = rows.reduce((n, d) => n + d.failures, 0);
      const last = latest.find((c) => c.component === key);
      const hasOpen = open.some((i) => i.component === key);
      const status: ComponentStatus =
        !last || !fresh(last.checkedAt)
          ? 'unknown'
          : last.ok && !hasOpen
            ? 'operational'
            : CRITICAL.includes(key)
              ? 'down'
              : 'degraded';
      return {
        key,
        status,
        latencyMs: last?.latencyMs ?? null,
        uptime90: checks ? round2(((checks - failures) / checks) * 100) : null,
        days: days.map((date) => {
          const d = byDay.get(date);
          return {
            date,
            uptime: d && d.checks ? round2(((d.checks - d.failures) / d.checks) * 100) : null,
          };
        }),
      };
    });
    // État global : le pire des composants mesurés ; « inconnu » seulement si rien n'est mesuré.
    const rank: ComponentStatus[] = ['operational', 'degraded', 'down'];
    const measured = components.filter((c) => c.status !== 'unknown');
    const worst = measured.reduce<ComponentStatus>(
      (w, c) => (rank.indexOf(c.status) > rank.indexOf(w) ? c.status : w),
      'operational',
    );
    const dto: StatusPageDto = {
      status: measured.length ? worst : 'unknown',
      updatedAt: new Date().toISOString(),
      components,
      incidents: incidents
        .filter((i) => isComponent(i.component))
        .map((i) => ({
          id: i.id,
          component: i.component as MonitoredComponent,
          startedAt: i.startedAt.toISOString(),
          resolvedAt: i.resolvedAt?.toISOString() ?? null,
        })),
    };
    this.statusCache = { at: Date.now(), dto };
    return dto;
  }

  /** Onglet « Surveillance » de l'administration. */
  async adminMonitoring(): Promise<AdminMonitoringDto> {
    await this.flushRequests();
    const from = new Date(Math.floor((Date.now() - DAY) / 900_000) * 900_000);
    const [rows, latest, incidents] = await Promise.all([
      this.prisma.requestMetric.findMany({
        where: { minute: { gte: from } },
        orderBy: { minute: 'asc' },
      }),
      this.latestChecks(),
      this.prisma.incident.findMany({ orderBy: { startedAt: 'desc' }, take: 20 }),
    ]);
    const buckets = Array.from({ length: 96 }, (_, i) => ({
      at: new Date(from.getTime() + i * 900_000),
      requests: 0,
      errors4xx: 0,
      errors5xx: 0,
      latencySum: 0,
      maxMs: 0,
      slow: 0,
    }));
    for (const r of rows) {
      const b = buckets[Math.floor((r.minute.getTime() - from.getTime()) / 900_000)];
      if (!b) continue;
      b.requests += r.requests;
      b.errors4xx += r.errors4xx;
      b.errors5xx += r.errors5xx;
      b.latencySum += r.latencySum;
      b.maxMs = Math.max(b.maxMs, r.latencyMax);
      b.slow += r.slow;
    }
    const sum = (k: 'requests' | 'errors5xx' | 'latencySum' | 'slow') =>
      buckets.reduce((n, b) => n + b[k], 0);
    const mem = process.memoryUsage();
    return {
      buckets: buckets.map((b) => ({
        at: b.at.toISOString(),
        requests: b.requests,
        errors4xx: b.errors4xx,
        errors5xx: b.errors5xx,
        avgMs: b.requests ? Math.round(b.latencySum / b.requests) : 0,
        maxMs: b.maxMs,
        slow: b.slow,
      })),
      totals: {
        requests: sum('requests'),
        errors5xx: sum('errors5xx'),
        avgMs: sum('requests') ? Math.round(sum('latencySum') / sum('requests')) : 0,
        slow: sum('slow'),
      },
      routes: requestMetrics
        .routeStats()
        .sort((a, b) => b.avgMs * Math.log2(b.count + 1) - a.avgMs * Math.log2(a.count + 1))
        .slice(0, 15),
      process: {
        uptimeSeconds: Math.round(process.uptime()),
        rssBytes: mem.rss,
        heapUsedBytes: mem.heapUsed,
        eventLoopLagMs: this.loopLagMs(),
        node: process.version,
      },
      checks: latest
        .filter((c) => isComponent(c.component))
        .map((c) => ({
          component: c.component as MonitoredComponent,
          ok: c.ok,
          latencyMs: c.latencyMs,
          detail: c.detail,
          checkedAt: c.checkedAt.toISOString(),
        })),
      incidents: incidents
        .filter((i) => isComponent(i.component))
        .map((i) => ({
          id: i.id,
          component: i.component as MonitoredComponent,
          detail: i.detail,
          startedAt: i.startedAt.toISOString(),
          resolvedAt: i.resolvedAt?.toISOString() ?? null,
        })),
    };
  }

  /** Format texte Prometheus (GET /metrics). */
  async prometheus(): Promise<string> {
    const status = await this.statusPage();
    const totals = requestMetrics.totals();
    const mem = process.memoryUsage();
    const lines = [
      '# HELP agenda_component_up Composant opérationnel (1) ou non (0).',
      '# TYPE agenda_component_up gauge',
      ...status.components.map(
        (c) => `agenda_component_up{component="${c.key}"} ${c.status === 'operational' ? 1 : 0}`,
      ),
      '# HELP agenda_component_latency_ms Latence de la dernière sonde.',
      '# TYPE agenda_component_latency_ms gauge',
      ...status.components
        .filter((c) => c.latencyMs !== null)
        .map((c) => `agenda_component_latency_ms{component="${c.key}"} ${c.latencyMs}`),
      '# HELP agenda_http_requests_total Requêtes HTTP depuis le démarrage.',
      '# TYPE agenda_http_requests_total counter',
      `agenda_http_requests_total ${totals.requests}`,
      '# HELP agenda_http_errors_total Réponses 5xx depuis le démarrage.',
      '# TYPE agenda_http_errors_total counter',
      `agenda_http_errors_total ${totals.errors5xx}`,
      '# TYPE agenda_process_resident_memory_bytes gauge',
      `agenda_process_resident_memory_bytes ${mem.rss}`,
      '# TYPE agenda_process_heap_used_bytes gauge',
      `agenda_process_heap_used_bytes ${mem.heapUsed}`,
      '# TYPE agenda_event_loop_lag_ms gauge',
      `agenda_event_loop_lag_ms ${this.loopLagMs()}`,
      '# TYPE agenda_process_uptime_seconds gauge',
      `agenda_process_uptime_seconds ${Math.round(process.uptime())}`,
    ];
    return `${lines.join('\n')}\n`;
  }

  /** Retard moyen de la boucle d'événements (la résolution d'échantillonnage, 20 ms, est retirée). */
  private loopLagMs(): number {
    const mean = this.loop.mean / 1e6;
    return Number.isFinite(mean) ? round2(Math.max(0, mean - LOOP_RESOLUTION_MS)) : 0;
  }

  private async latestChecks() {
    return this.prisma.$queryRaw<
      {
        component: string;
        ok: boolean;
        latencyMs: number | null;
        detail: string | null;
        checkedAt: Date;
      }[]
    >`SELECT DISTINCT ON (component) component, ok, "latencyMs", detail, "checkedAt"
      FROM "StatusCheck" ORDER BY component, "checkedAt" DESC`;
  }
}

const withTimeout = <T>(p: Promise<T>, ms = 10_000): Promise<T> =>
  Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`timeout (${ms / 1000} s)`)), ms),
    ),
  ]);

const ORDER: MonitoredComponent[] = ['api', 'database', 'redis', 'calendar', 'email', 'backups'];
const isComponent = (c: string): c is MonitoredComponent => (ORDER as string[]).includes(c);
const round2 = (n: number) => Math.round(n * 100) / 100;
