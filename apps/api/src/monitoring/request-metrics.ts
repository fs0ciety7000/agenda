import type { NextFunction, Request, Response } from 'express';

interface MinuteBucket {
  requests: number;
  errors4xx: number;
  errors5xx: number;
  latencySum: number;
  latencyMax: number;
  slow: number;
}

interface RouteStats {
  count: number;
  totalMs: number;
  maxMs: number;
  errors: number;
}

const SLOW_MS = 1000;
/** Pas de mesure : sondes, flux temps réel (connexion longue par nature), Prometheus. */
const IGNORED = [/^\/health/, /\/events$/, /^\/metrics/];

/**
 * Requêtes HTTP de l'API : agrégées par minute en mémoire, puis écrites en base par la
 * surveillance (MonitoringService.flush). Une seule instance d'API (cf. ThrottlerModule).
 */
export class RequestMetrics {
  private minutes = new Map<number, MinuteBucket>();
  private routes = new Map<string, RouteStats>();

  record(route: string, status: number, ms: number): void {
    const minute = Math.floor(Date.now() / 60_000) * 60_000;
    let b = this.minutes.get(minute);
    if (!b) {
      b = { requests: 0, errors4xx: 0, errors5xx: 0, latencySum: 0, latencyMax: 0, slow: 0 };
      this.minutes.set(minute, b);
    }
    const rounded = Math.round(ms);
    b.requests += 1;
    if (status >= 500) b.errors5xx += 1;
    else if (status >= 400) b.errors4xx += 1;
    b.latencySum += rounded;
    b.latencyMax = Math.max(b.latencyMax, rounded);
    if (ms >= SLOW_MS) b.slow += 1;

    const r = this.routes.get(route) ?? { count: 0, totalMs: 0, maxMs: 0, errors: 0 };
    r.count += 1;
    r.totalMs += rounded;
    r.maxMs = Math.max(r.maxMs, rounded);
    if (status >= 500) r.errors += 1;
    this.routes.set(route, r);
  }

  /** Minutes terminées (la minute en cours reste en mémoire), retirées du tampon. */
  drainCompleted(now = Date.now()): { minute: Date; bucket: MinuteBucket }[] {
    const current = Math.floor(now / 60_000) * 60_000;
    const done: { minute: Date; bucket: MinuteBucket }[] = [];
    for (const [minute, bucket] of this.minutes) {
      if (minute < current) {
        done.push({ minute: new Date(minute), bucket });
        this.minutes.delete(minute);
      }
    }
    return done;
  }

  routeStats() {
    return [...this.routes.entries()].map(([route, r]) => ({
      route,
      count: r.count,
      avgMs: Math.round(r.totalMs / r.count),
      maxMs: r.maxMs,
      errors: r.errors,
    }));
  }

  totals() {
    let requests = 0;
    let errors5xx = 0;
    for (const r of this.routes.values()) {
      requests += r.count;
      errors5xx += r.errors;
    }
    return { requests, errors5xx };
  }
}

export const requestMetrics = new RequestMetrics();

/** Middleware Express : durée et code de chaque réponse, par route (« GET /v1/households/:householdId/occurrences »). */
export function requestMetricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (IGNORED.some((re) => re.test(req.path))) return next();
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    const path = (req.route as { path?: string } | undefined)?.path;
    const route = path ? `${req.method} ${req.baseUrl}${path}` : `${req.method} (route inconnue)`;
    requestMetrics.record(route, res.statusCode, ms);
  });
  next();
}
