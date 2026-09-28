import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AndroidReleaseService } from '../src/app-distribution/android-release.service';
import { resetEnvCache } from '../src/config/env';
import { createTestApp } from './app';

/** Faux GitHub : release `android-latest` avec version.json + APK ; jeton exigé si « privé ». */
function fakeGithub(opts: { private?: boolean; missing?: boolean } = {}) {
  const apk = Buffer.alloc(50_000, 7);
  const calls: { url: string; auth?: string }[] = [];
  const realFetch = globalThis.fetch;
  vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (!url.startsWith('https://api.github.com/')) return realFetch(input, init);
    const headers = new Headers(init?.headers);
    calls.push({ url, auth: headers.get('authorization') ?? undefined });
    if (opts.missing || (opts.private && headers.get('authorization') !== 'Bearer gh-token'))
      return new Response('{"message":"Not Found"}', { status: 404 });
    if (url.endsWith('/releases/tags/android-latest'))
      return Response.json({
        assets: [
          { name: 'version.json', url: 'https://api.github.com/assets/1' },
          { name: 'agenda-gn.apk', url: 'https://api.github.com/assets/2' },
        ],
      });
    if (url.endsWith('/assets/1'))
      return Response.json({
        versionCode: 42,
        versionName: '0.3.42',
        apkUrl: 'https://github.com/x/agenda-gn.apk',
        sha256: 'ab'.repeat(32),
      });
    if (url.endsWith('/assets/2'))
      return new Response(apk, { headers: { 'content-length': String(apk.length) } });
    return new Response('', { status: 404 });
  });
  return { calls, apk };
}

describe('Distribution Android (relais de la release GitHub)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const reset = () => {
    const service = app.get(AndroidReleaseService) as unknown as { cache?: unknown };
    service.cache = undefined;
  };
  const forget = () => {
    reset();
    (app.get(AndroidReleaseService) as unknown as { lastGood?: unknown }).lastGood = undefined;
  };

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GITHUB_RELEASES_TOKEN;
    resetEnvCache();
    forget();
  });
  afterAll(() => app.close());

  it('dépôt public : version.json pointe vers notre domaine, APK servi en flux', async () => {
    const gh = fakeGithub();
    const v = await http().get('/v1/app/android/version.json').expect(200);
    expect(v.body).toEqual({
      versionCode: 42,
      versionName: '0.3.42',
      sha256: 'ab'.repeat(32),
      apkUrl: 'http://localhost:3000/v1/app/android/tandem.apk?v=42',
    });
    const apk = await http()
      .get('/v1/app/android/tandem.apk')
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(apk.headers['content-type']).toBe('application/vnd.android.package-archive');
    expect(apk.headers['cache-control']).toBe('no-store, no-transform');
    expect(v.headers['cache-control']).toBe('no-store');
    expect(Buffer.compare(apk.body as Buffer, gh.apk)).toBe(0);
    expect(apk.headers['content-disposition']).toBe('attachment; filename="tandem.apk"');
    expect(gh.calls.every((c) => c.auth === undefined)).toBe(true);
    // Ancien nom (liens partagés, apps installées avant le renommage) : toujours servi.
    await http().get('/v1/app/android/agenda-gn.apk').expect(200);
  });

  it('dépôt privé : le jeton est utilisé ; sans jeton ou sans release → 404', async () => {
    fakeGithub({ private: true });
    await http().get('/v1/app/android/version.json').expect(404);
    reset();
    process.env.GITHUB_RELEASES_TOKEN = 'gh-token';
    resetEnvCache();
    const gh = fakeGithub({ private: true });
    await http().get('/v1/app/android/version.json').expect(200);
    expect(gh.calls[0]!.auth).toBe('Bearer gh-token');
  });

  it('republication : APK propre à la version, dernière version servie tant que la release manque', async () => {
    const apk46 = Buffer.alloc(1_000, 46);
    let state: 'v46' | 'republishing' = 'v46';
    vi.stubGlobal('fetch', async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/releases/tags/android-latest')) {
        if (state === 'republishing') return new Response('{}', { status: 404 });
        return Response.json({
          assets: [
            { name: 'version.json', url: 'https://api.github.com/assets/10' },
            { name: 'tandem.apk', url: 'https://api.github.com/assets/11' },
            { name: 'tandem-46.apk', url: 'https://api.github.com/assets/12' },
          ],
        });
      }
      if (url.endsWith('/assets/10'))
        return Response.json({
          versionCode: 46,
          versionName: '0.3.46',
          sha256: 'cd'.repeat(32),
          apkAsset: 'tandem-46.apk',
        });
      if (url.endsWith('/assets/12')) return new Response(apk46);
      return new Response('', { status: 404 });
    });
    const v = await http().get('/v1/app/android/version.json').expect(200);
    expect(v.body.versionCode).toBe(46);
    const apk = await http()
      .get('/v1/app/android/tandem.apk?v=46')
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    // L'APK nommé dans version.json, pas « tandem.apk ».
    expect(Buffer.compare(apk.body as Buffer, apk46)).toBe(0);

    // Release supprimée le temps de la republier : la dernière version reste annoncée.
    state = 'republishing';
    reset();
    const during = await http().get('/v1/app/android/version.json').expect(200);
    expect(during.body.versionCode).toBe(46);
  });
});
