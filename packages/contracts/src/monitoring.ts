import { z } from 'zod';

/** Surveillance : page publique /status et onglet « Surveillance » de l'administration. */

export const MonitoredComponent = z.enum([
  'api',
  'database',
  'redis',
  'calendar',
  'email',
  'backups',
]);
export type MonitoredComponent = z.infer<typeof MonitoredComponent>;

export const ComponentStatus = z.enum(['operational', 'degraded', 'down', 'unknown']);
export type ComponentStatus = z.infer<typeof ComponentStatus>;

export const StatusPageDto = z.object({
  /** Pire état parmi les composants. */
  status: ComponentStatus,
  updatedAt: z.string(),
  components: z.array(
    z.object({
      key: MonitoredComponent,
      status: ComponentStatus,
      latencyMs: z.number().int().nullable(),
      /** Disponibilité sur 90 jours (%), null sans mesure. */
      uptime90: z.number().nullable(),
      /** 90 jours, du plus ancien au plus récent : disponibilité du jour (%) ou null. */
      days: z.array(z.object({ date: z.string(), uptime: z.number().nullable() })),
    }),
  ),
  /** Incidents des 90 derniers jours (sans détail technique). */
  incidents: z.array(
    z.object({
      id: z.uuid(),
      component: MonitoredComponent,
      startedAt: z.string(),
      resolvedAt: z.string().nullable(),
    }),
  ),
});
export type StatusPageDto = z.infer<typeof StatusPageDto>;

export const AdminMonitoringDto = z.object({
  /** 24 h par tranches de 15 minutes. */
  buckets: z.array(
    z.object({
      at: z.string(),
      requests: z.number().int(),
      errors4xx: z.number().int(),
      errors5xx: z.number().int(),
      avgMs: z.number().int(),
      maxMs: z.number().int(),
      slow: z.number().int(),
    }),
  ),
  totals: z.object({
    requests: z.number().int(),
    errors5xx: z.number().int(),
    avgMs: z.number().int(),
    slow: z.number().int(),
  }),
  /** Depuis le démarrage de l'API : routes les plus sollicitées / lentes. */
  routes: z.array(
    z.object({
      route: z.string(),
      count: z.number().int(),
      avgMs: z.number().int(),
      maxMs: z.number().int(),
      errors: z.number().int(),
    }),
  ),
  process: z.object({
    uptimeSeconds: z.number().int(),
    rssBytes: z.number(),
    heapUsedBytes: z.number(),
    eventLoopLagMs: z.number(),
    node: z.string(),
  }),
  /** Dernière sonde de chaque composant. */
  checks: z.array(
    z.object({
      component: MonitoredComponent,
      ok: z.boolean(),
      latencyMs: z.number().int().nullable(),
      detail: z.string().nullable(),
      checkedAt: z.string(),
    }),
  ),
  incidents: z.array(
    z.object({
      id: z.uuid(),
      component: MonitoredComponent,
      detail: z.string().nullable(),
      startedAt: z.string(),
      resolvedAt: z.string().nullable(),
    }),
  ),
});
export type AdminMonitoringDto = z.infer<typeof AdminMonitoringDto>;
