import {
  type CalendarListEntry,
  GoogleApiError,
  GoogleCalendarClient,
  type GoogleErrorKind,
  type GoogleEvent,
  type TokenSet,
} from '../src/calendar/google-calendar.client';

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');

/**
 * Faux Google Calendar en mémoire, fidèle aux points qui comptent pour la synchro :
 * identifiants d'événements imposés (409 si déjà pris, même supprimé), 404/410, droits
 * owner/writer/reader, jetons d'accès qui expirent, refresh tokens révocables, pannes injectables.
 */
export class FakeGoogleCalendar extends GoogleCalendarClient {
  calendars = new Map<string, { entry: CalendarListEntry; events: Map<string, GoogleEvent> }>();
  private access = new Set<string>();
  private refreshTokens = new Map<string, { sub: string; email: string; revoked: boolean }>();
  private failures: { op: string; kind: GoogleErrorKind; status: number }[] = [];
  calls: string[] = [];
  accessTtlSeconds = 3600;
  private counter = 0;

  addCalendar(id: string, summary: string, accessRole: CalendarListEntry['accessRole'] = 'owner') {
    this.calendars.set(id, { entry: { id, summary, accessRole }, events: new Map() });
  }

  /** Prochain appel `op` (ou `*`) en échec. */
  failNext(
    op: string,
    kind: GoogleErrorKind,
    status = kind === 'rate_limited' ? 429 : kind === 'server' ? 503 : 400,
    times = 1,
  ) {
    for (let i = 0; i < times; i++) this.failures.push({ op, kind, status });
  }

  /** Événements visibles (non supprimés) d'un calendrier. */
  events(calendarId: string): GoogleEvent[] {
    return [...(this.calendars.get(calendarId)?.events.values() ?? [])].filter(
      (e) => e.status !== 'cancelled',
    );
  }

  expireAccessTokens() {
    this.access.clear();
  }

  revokeUser(email: string) {
    for (const t of this.refreshTokens.values()) if (t.email === email) t.revoked = true;
  }

  private step(op: string, token?: string) {
    this.calls.push(op);
    const i = this.failures.findIndex((f) => f.op === op || f.op === '*');
    if (i >= 0) {
      const [f] = this.failures.splice(i, 1);
      throw new GoogleApiError(f!.kind, f!.status);
    }
    if (token !== undefined && !this.access.has(token))
      throw new GoogleApiError('unauthorized', 401);
  }

  private cal(calendarId: string, write: boolean) {
    const cal = this.calendars.get(calendarId);
    if (!cal) throw new GoogleApiError('not_found', 404);
    if (write && !['owner', 'writer'].includes(cal.entry.accessRole))
      throw new GoogleApiError('forbidden', 403, 'requiredAccessLevel');
    return cal;
  }

  async listCalendars(token: string) {
    this.step('calendarList.list', token);
    return [...this.calendars.values()].map((c) => c.entry);
  }

  async getCalendar(token: string, calendarId: string) {
    this.step('calendarList.get', token);
    return this.cal(calendarId, false).entry;
  }

  async insertEvent(token: string, calendarId: string, event: GoogleEvent) {
    this.step('events.insert', token);
    const cal = this.cal(calendarId, true);
    if (cal.events.has(event.id)) throw new GoogleApiError('conflict', 409, 'duplicate');
    const stored = { ...event, status: 'confirmed' as const, etag: `"${++this.counter}"` };
    cal.events.set(event.id, stored);
    return stored;
  }

  async patchEvent(
    token: string,
    calendarId: string,
    eventId: string,
    patch: Partial<GoogleEvent>,
  ) {
    this.step('events.patch', token);
    const cal = this.cal(calendarId, true);
    const current = cal.events.get(eventId);
    if (!current) throw new GoogleApiError('not_found', 404);
    const next = { ...current, ...patch, etag: `"${++this.counter}"` };
    cal.events.set(eventId, next);
    return next;
  }

  async deleteEvent(token: string, calendarId: string, eventId: string) {
    this.step('events.delete', token);
    const cal = this.cal(calendarId, true);
    const current = cal.events.get(eventId);
    if (!current) throw new GoogleApiError('not_found', 404);
    if (current.status === 'cancelled') throw new GoogleApiError('not_found', 410);
    cal.events.set(eventId, { ...current, status: 'cancelled' });
  }

  async listAppEvents(
    token: string,
    calendarId: string,
    q: { householdId: string; timeMin: string; timeMax: string },
  ) {
    this.step('events.list', token);
    const cal = this.cal(calendarId, false);
    return [...cal.events.values()].filter((e) => {
      if (e.extendedProperties?.private?.gnHouseholdId !== q.householdId) return false;
      const start = e.start?.dateTime ?? `${e.start?.date}T00:00:00Z`;
      return (
        new Date(start) < new Date(q.timeMax) &&
        new Date(start) >= new Date(new Date(q.timeMin).getTime() - 86_400_000)
      );
    });
  }

  authorizationUrl(p: { redirectUri: string; state: string }) {
    return `https://accounts.google.test/o/oauth2/v2/auth?state=${p.state}&redirect_uri=${encodeURIComponent(p.redirectUri)}`;
  }

  /** Le « code » encode le compte Google : `sub|email`. */
  async exchangeCode({ code }: { code: string }): Promise<TokenSet> {
    this.step('token.exchange');
    const [sub, email] = code.split('|');
    const refresh = `rt-${sub}-${++this.counter}`;
    this.refreshTokens.set(refresh, { sub: sub!, email: email!, revoked: false });
    const access = `at-${++this.counter}`;
    this.access.add(access);
    return {
      accessToken: access,
      expiresIn: this.accessTtlSeconds,
      refreshToken: refresh,
      idToken: `${b64({ alg: 'RS256' })}.${b64({ sub, email, email_verified: true })}.sig`,
    };
  }

  async refresh(refreshToken: string): Promise<TokenSet> {
    this.step('token.refresh');
    const rt = this.refreshTokens.get(refreshToken);
    if (!rt || rt.revoked) throw new GoogleApiError('invalid_grant', 400, 'invalid_grant');
    const access = `at-${++this.counter}`;
    this.access.add(access);
    return { accessToken: access, expiresIn: this.accessTtlSeconds };
  }

  async revoke(token: string) {
    this.calls.push('token.revoke');
    const rt = this.refreshTokens.get(token);
    if (rt) rt.revoked = true;
  }
}
