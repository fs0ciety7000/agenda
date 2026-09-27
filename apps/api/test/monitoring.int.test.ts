import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resetEnvCache } from '../src/config/env';
import { MailService } from '../src/mail/mail.service';
import { MonitoringService } from '../src/monitoring/monitoring.service';
import { createTestApp, registerUser } from './app';

describe('Surveillance : sondes, incidents, /status, /metrics (intégration)', () => {
  let app: INestApplication;
  const prisma = new PrismaClient();
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
    await prisma.$transaction([
      prisma.statusCheck.deleteMany(),
      prisma.statusDaily.deleteMany(),
      prisma.incident.deleteMany(),
      prisma.backupRun.deleteMany({ where: { status: { in: ['OK', 'FAILED'] } } }),
    ]);
  });
  afterAll(async () => {
    delete process.env.ADMIN_EMAILS;
    delete process.env.METRICS_TOKEN;
    resetEnvCache();
    await app.close();
    await prisma.$disconnect();
  });

  it('incident ouvert puis résolu (alerte aux admins), page publique et Prometheus', async () => {
    const admin = await registerUser(app, 'Nicolas');
    process.env.ADMIN_EMAILS = admin.email;
    resetEnvCache();
    const monitoring = app.get(MonitoringService);
    const outbox = app.get(MailService).outbox;

    // Sauvegarde réussie il y a 1 h : tout va bien.
    const hourAgo = new Date(Date.now() - 3600_000);
    await prisma.backupRun.create({
      data: {
        trigger: 'nightly',
        status: 'OK',
        startedAt: hourAgo,
        finishedAt: hourAgo,
        summary: 'ok',
      },
    });
    const first = await monitoring.runChecks();
    expect(first.database).toMatchObject({ ok: true });
    expect(first.backups).toMatchObject({ ok: true });

    // Sauvegarde en échec : incident immédiat + e-mail à l'admin.
    await prisma.backupRun.create({
      data: { trigger: 'manual', status: 'FAILED', finishedAt: new Date(), summary: 'pg_dump' },
    });
    const sent = outbox.length;
    await monitoring.runChecks();
    const open = await prisma.incident.findFirst({
      where: { component: 'backups', resolvedAt: null },
    });
    expect(open?.detail).toContain('pg_dump');
    expect(outbox.slice(sent).map((m) => [m.to, m.subject])).toEqual([
      [admin.email, '🔴 Incident : Sauvegardes'],
    ]);

    // Page publique : dégradée, incident listé sans détail technique.
    const degraded = (await http().get('/v1/status').expect(200)).body;
    expect(degraded.status).toBe('degraded');
    const backups = degraded.components.find((c: { key: string }) => c.key === 'backups');
    expect(backups).toMatchObject({ status: 'degraded' });
    expect(backups.days).toHaveLength(90);
    expect(degraded.incidents[0]).toMatchObject({ component: 'backups', resolvedAt: null });
    expect(degraded.incidents[0].detail).toBeUndefined();

    // Nouvelle sauvegarde réussie : incident résolu, e-mail de retour.
    await prisma.backupRun.create({
      data: {
        trigger: 'manual',
        status: 'OK',
        startedAt: new Date(),
        finishedAt: new Date(Date.now() + 1000),
        summary: 'ok',
      },
    });
    await monitoring.runChecks();
    expect(await prisma.incident.count({ where: { resolvedAt: null } })).toBe(0);
    expect(outbox.at(-1)?.subject).toBe('✅ Résolu : Sauvegardes');
    const ok = (await http().get('/v1/status').expect(200)).body;
    expect(ok.status).toBe('operational');
    expect(ok.components.map((c: { key: string }) => c.key)).toEqual([
      'api',
      'database',
      'backups',
    ]);
    const database = ok.components.find((c: { key: string }) => c.key === 'database');
    expect(database.uptime90).toBe(100);

    // Onglet admin : sondes et routes mesurées.
    const mon = (await http().get('/v1/admin/monitoring').set(admin.auth).expect(200)).body;
    expect(mon.buckets).toHaveLength(96);
    expect(mon.checks.map((c: { component: string }) => c.component).sort()).toEqual([
      'api',
      'backups',
      'database',
    ]);
    expect(mon.routes.map((r: { route: string }) => r.route)).toContain('GET /v1/status');
    expect(mon.incidents[0]).toMatchObject({
      component: 'backups',
      detail: expect.stringContaining('pg_dump'),
    });

    // Prometheus : désactivé sans jeton, protégé avec.
    await http().get('/metrics').expect(404);
    process.env.METRICS_TOKEN = 'metrics-token-for-tests';
    resetEnvCache();
    await http().get('/metrics').set('authorization', 'Bearer wrong-token-000000').expect(401);
    const metrics = await http()
      .get('/metrics')
      .set('authorization', 'Bearer metrics-token-for-tests')
      .expect(200);
    expect(metrics.text).toContain('agenda_component_up{component="database"} 1');
  });
});
