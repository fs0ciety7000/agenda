import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { reportClientError } from './error-reporter';

describe('reportClientError', () => {
  afterEach(() => vi.restoreAllMocks());

  it('écrit le début de la pile dans les logs (20 lignes au plus)', () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const stack = [
      'java.lang.IllegalStateException: boom',
      ...Array.from({ length: 30 }, (_, i) => `\tat a.b.c${i}(SourceFile:${i})`),
    ].join('\n');
    reportClientError({
      source: 'android',
      message: 'boom',
      stack,
      location: 'crash',
      release: '0.3.49',
    });
    const line = String(warn.mock.calls[0]![0]);
    expect(line).toContain('Client error [android 0.3.49] crash: boom');
    expect(line).toContain('at a.b.c0(SourceFile:0)');
    expect(line).toContain('at a.b.c18(SourceFile:18)');
    expect(line).not.toContain('a.b.c19(');
  });

  it('sans pile : une seule ligne', () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    reportClientError({ source: 'web', message: 'TypeError', location: '/tasks' });
    expect(String(warn.mock.calls[0]![0])).toBe('Client error [web] /tasks: TypeError');
  });
});
