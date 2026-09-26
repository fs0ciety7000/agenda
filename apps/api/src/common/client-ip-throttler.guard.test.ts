import type { Request } from 'express';
import { afterEach, describe, expect, it } from 'vitest';
import { resetEnvCache } from '../config/env';
import { clientIp } from './client-ip-throttler.guard';

const req = (headers: Record<string, string>, ip = '172.18.0.5') =>
  ({ headers, ip }) as unknown as Request;

describe('clientIp', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
    resetEnvCache();
  });

  function withHeader(header?: string) {
    process.env.DATABASE_URL = 'postgresql://x';
    process.env.JWT_SECRET = 'x'.repeat(32);
    if (header === undefined) delete process.env.CLIENT_IP_HEADER;
    else process.env.CLIENT_IP_HEADER = header;
    resetEnvCache();
  }

  it('sans configuration : IP de la connexion', () => {
    withHeader();
    expect(clientIp(req({ 'cf-connecting-ip': '203.0.113.9' }))).toBe('172.18.0.5');
  });

  it('derrière Cloudflare : IP réelle du client', () => {
    withHeader('CF-Connecting-IP');
    expect(clientIp(req({ 'cf-connecting-ip': '203.0.113.9' }))).toBe('203.0.113.9');
  });

  it('liste X-Forwarded-For : premier élément ; en-tête absent : repli sur la connexion', () => {
    withHeader('x-forwarded-for');
    expect(clientIp(req({ 'x-forwarded-for': '198.51.100.7, 10.0.0.2' }))).toBe('198.51.100.7');
    expect(clientIp(req({}))).toBe('172.18.0.5');
  });
});
