import { Injectable } from '@nestjs/common';
import { env } from '../config/env';

/**
 * Classification des erreurs Google : c'est elle qui décide du comportement (réessayer, bloquer,
 * recréer…) et du message montré à l'utilisateur. Cf. docs/google-calendar.md §6.
 */
export type GoogleErrorKind =
  | 'unauthorized' // 401 : jeton d'accès expiré
  | 'invalid_grant' // autorisation révoquée / refresh token invalide
  | 'forbidden' // 403 : pas de droit d'écriture
  | 'rate_limited' // 403 rateLimitExceeded, 429
  | 'not_found' // 404 / 410
  | 'conflict' // 409 : l'identifiant existe déjà
  | 'precondition' // 412 : etag périmé
  | 'server' // 5xx
  | 'network' // pas de réponse
  | 'bad_request';

export class GoogleApiError extends Error {
  constructor(
    readonly kind: GoogleErrorKind,
    readonly status: number,
    readonly reason?: string,
  ) {
    super(`Google API ${status} ${kind}${reason ? ` (${reason})` : ''}`);
  }

  get retryable(): boolean {
    return this.kind === 'rate_limited' || this.kind === 'server' || this.kind === 'network';
  }
}

export interface CalendarListEntry {
  id: string;
  summary: string;
  accessRole: 'owner' | 'writer' | 'reader' | 'freeBusyReader';
  primary?: boolean;
  backgroundColor?: string;
  timeZone?: string;
}

export interface EventTime {
  dateTime?: string;
  date?: string;
  timeZone?: string;
}

export interface GoogleEvent {
  id: string;
  status?: 'confirmed' | 'tentative' | 'cancelled';
  summary?: string;
  description?: string;
  start?: EventTime;
  end?: EventTime;
  transparency?: 'opaque' | 'transparent';
  reminders?: { useDefault: boolean; overrides?: unknown[] };
  extendedProperties?: { private?: Record<string, string> };
  etag?: string;
}

export interface TokenSet {
  accessToken: string;
  expiresIn: number;
  refreshToken?: string;
  idToken?: string;
  scope?: string;
}

/** Scopes minimaux : lister les calendriers, écrire des événements (cf. google-calendar.md §1). */
export const CALENDAR_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'https://www.googleapis.com/auth/calendar.events',
];

/** Contrat du client (remplacé par un faux fidèle dans les tests). */
export abstract class GoogleCalendarClient {
  abstract listCalendars(token: string): Promise<CalendarListEntry[]>;
  abstract getCalendar(token: string, calendarId: string): Promise<CalendarListEntry>;
  abstract insertEvent(token: string, calendarId: string, event: GoogleEvent): Promise<GoogleEvent>;
  abstract patchEvent(
    token: string,
    calendarId: string,
    eventId: string,
    event: Partial<GoogleEvent>,
  ): Promise<GoogleEvent>;
  abstract deleteEvent(token: string, calendarId: string, eventId: string): Promise<void>;
  /** Nos événements (filtre extendedProperties), y compris supprimés, sur une fenêtre. */
  abstract listAppEvents(
    token: string,
    calendarId: string,
    q: { householdId: string; timeMin: string; timeMax: string },
  ): Promise<GoogleEvent[]>;
  abstract authorizationUrl(p: {
    redirectUri: string;
    state: string;
    codeChallenge: string;
    loginHint?: string;
  }): string;
  abstract exchangeCode(p: {
    code: string;
    redirectUri: string;
    codeVerifier: string;
  }): Promise<TokenSet>;
  abstract refresh(refreshToken: string): Promise<TokenSet>;
  abstract revoke(token: string): Promise<void>;
}

const API = 'https://www.googleapis.com/calendar/v3';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const TIMEOUT_MS = 15_000;

async function toError(res: Response): Promise<GoogleApiError> {
  const body = (await res.json().catch(() => null)) as {
    error?: string | { errors?: { reason?: string }[]; status?: string };
  } | null;
  const oauthError = typeof body?.error === 'string' ? body.error : undefined;
  const reason = typeof body?.error === 'object' ? body.error.errors?.[0]?.reason : oauthError;
  if (oauthError === 'invalid_grant')
    return new GoogleApiError('invalid_grant', res.status, reason);
  switch (true) {
    case res.status === 401:
      return new GoogleApiError('unauthorized', 401, reason);
    case res.status === 403 &&
      ['rateLimitExceeded', 'userRateLimitExceeded', 'quotaExceeded'].includes(reason ?? ''):
    case res.status === 429:
      return new GoogleApiError('rate_limited', res.status, reason);
    case res.status === 403:
      return new GoogleApiError('forbidden', 403, reason);
    case res.status === 404 || res.status === 410:
      return new GoogleApiError('not_found', res.status, reason);
    case res.status === 409:
      return new GoogleApiError('conflict', 409, reason);
    case res.status === 412:
      return new GoogleApiError('precondition', 412, reason);
    case res.status >= 500:
      return new GoogleApiError('server', res.status, reason);
    default:
      return new GoogleApiError('bad_request', res.status, reason);
  }
}

/** Implémentation HTTP (REST Calendar v3) : une dizaine d'appels, pas besoin du SDK complet. */
@Injectable()
export class HttpGoogleCalendarClient extends GoogleCalendarClient {
  private async call<T>(url: string, init: RequestInit & { token?: string } = {}): Promise<T> {
    const { token, headers, ...rest } = init;
    let res: Response;
    try {
      res = await fetch(url, {
        ...rest,
        headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new GoogleApiError('network', 0);
    }
    if (!res.ok) throw await toError(res);
    return (res.status === 204 ? undefined : await res.json()) as T;
  }

  private json(body: unknown) {
    return { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } };
  }

  async listCalendars(token: string): Promise<CalendarListEntry[]> {
    const items: CalendarListEntry[] = [];
    let pageToken: string | undefined;
    do {
      const url = new URL(`${API}/users/me/calendarList`);
      url.searchParams.set('maxResults', '250');
      if (pageToken) url.searchParams.set('pageToken', pageToken);
      const page = await this.call<{ items?: CalendarListEntry[]; nextPageToken?: string }>(
        url.toString(),
        { token },
      );
      items.push(...(page.items ?? []));
      pageToken = page.nextPageToken;
    } while (pageToken);
    return items;
  }

  getCalendar(token: string, calendarId: string): Promise<CalendarListEntry> {
    return this.call(`${API}/users/me/calendarList/${encodeURIComponent(calendarId)}`, { token });
  }

  insertEvent(token: string, calendarId: string, event: GoogleEvent): Promise<GoogleEvent> {
    return this.call(`${API}/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=none`, {
      method: 'POST',
      token,
      ...this.json(event),
    });
  }

  patchEvent(
    token: string,
    calendarId: string,
    eventId: string,
    event: Partial<GoogleEvent>,
  ): Promise<GoogleEvent> {
    return this.call(
      `${API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=none`,
      {
        method: 'PATCH',
        token,
        ...this.json(event),
      },
    );
  }

  async deleteEvent(token: string, calendarId: string, eventId: string): Promise<void> {
    await this.call(
      `${API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=none`,
      {
        method: 'DELETE',
        token,
      },
    );
  }

  async listAppEvents(
    token: string,
    calendarId: string,
    q: { householdId: string; timeMin: string; timeMax: string },
  ): Promise<GoogleEvent[]> {
    const items: GoogleEvent[] = [];
    let pageToken: string | undefined;
    do {
      const url = new URL(`${API}/calendars/${encodeURIComponent(calendarId)}/events`);
      url.searchParams.set('privateExtendedProperty', `gnHouseholdId=${q.householdId}`);
      url.searchParams.set('timeMin', q.timeMin);
      url.searchParams.set('timeMax', q.timeMax);
      url.searchParams.set('showDeleted', 'true');
      url.searchParams.set('singleEvents', 'true');
      url.searchParams.set('maxResults', '2500');
      if (pageToken) url.searchParams.set('pageToken', pageToken);
      const page = await this.call<{ items?: GoogleEvent[]; nextPageToken?: string }>(
        url.toString(),
        { token },
      );
      items.push(...(page.items ?? []));
      pageToken = page.nextPageToken;
    } while (pageToken);
    return items;
  }

  authorizationUrl(p: {
    redirectUri: string;
    state: string;
    codeChallenge: string;
    loginHint?: string;
  }): string {
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search = new URLSearchParams({
      client_id: env().GOOGLE_CLIENT_ID!,
      redirect_uri: p.redirectUri,
      response_type: 'code',
      scope: CALENDAR_SCOPES.join(' '),
      access_type: 'offline',
      // `consent` garantit un refresh token, même si l'utilisateur a déjà autorisé l'application.
      prompt: 'consent',
      include_granted_scopes: 'true',
      state: p.state,
      code_challenge: p.codeChallenge,
      code_challenge_method: 'S256',
      ...(p.loginHint ? { login_hint: p.loginHint } : {}),
    }).toString();
    return url.toString();
  }

  private async token(params: Record<string, string>): Promise<TokenSet> {
    const res = await this.call<{
      access_token: string;
      expires_in: number;
      refresh_token?: string;
      id_token?: string;
      scope?: string;
    }>(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env().GOOGLE_CLIENT_ID!,
        client_secret: env().GOOGLE_CLIENT_SECRET!,
        ...params,
      }),
    });
    return {
      accessToken: res.access_token,
      expiresIn: res.expires_in,
      refreshToken: res.refresh_token,
      idToken: res.id_token,
      scope: res.scope,
    };
  }

  exchangeCode(p: { code: string; redirectUri: string; codeVerifier: string }): Promise<TokenSet> {
    return this.token({
      code: p.code,
      redirect_uri: p.redirectUri,
      code_verifier: p.codeVerifier,
      grant_type: 'authorization_code',
    });
  }

  refresh(refreshToken: string): Promise<TokenSet> {
    return this.token({ refresh_token: refreshToken, grant_type: 'refresh_token' });
  }

  async revoke(token: string): Promise<void> {
    await this.call(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    }).catch(() => undefined); // déjà révoqué : sans importance
  }
}
