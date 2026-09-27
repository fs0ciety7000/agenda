import {
  addDays,
  daysInMonth,
  endOfMonth,
  endOfWeek,
  formatIsoDate,
  type IsoDate,
  parseIsoDate,
  weekdayOf,
} from './dates';

/**
 * Quick add déterministe (FR + EN), sans IA.
 *   « Sortir les poubelles demain 19h @nicolas #maison » → titre, date, heure, responsable, catégorie.
 *
 * Syntaxe reconnue :
 *   dates     aujourd'hui, ce soir, demain, après-demain, lundi…dimanche [prochain], dans N jours/semaines,
 *             le 12, le 12/10[/2027], 12 octobre, today, tomorrow, monday, next monday, in N days
 *   heures    19h, 19h30, 19:30, à 7h, midi, minuit, 7pm
 *   durées    30 min, pendant 1h30, pour 2h, for 45 min
 *   personnes @grace, @nicolas, @nous / @tous / @ensemble (à deux) ; sans @, un prénom seul
 *             APRÈS une date / heure / durée reconnue (« …21h Grace », « …demain Grace et Nicolas »,
 *             « …20h à deux ») — avant, il reste dans le titre (« Appeler Grace demain »)
 *   catégorie #courses
 *   priorité  !  (haute)   !! (urgente)
 * Tout ce qui n'est pas reconnu reste dans le titre.
 */

export interface QuickAddContext {
  today: IsoDate;
  members: { id: string; displayName: string }[];
  categories: { id: string; name: string }[];
}

export type QuickAddTokenKind =
  'date' | 'due' | 'time' | 'duration' | 'assignee' | 'category' | 'priority';

export interface QuickAddResult {
  title: string;
  date?: IsoDate;
  /** Échéance souple sans date (« cette semaine », « ce mois-ci ») ; jamais avec `date`. */
  dueDate?: IsoDate;
  startMinute?: number;
  durationMinutes?: number;
  /** Membres responsables ; plusieurs = « à deux ». */
  assigneeIds?: string[];
  categoryId?: string;
  priority?: 'HIGH' | 'URGENT';
  /** Fragments reconnus (pour afficher des puces de prévisualisation). */
  tokens: { kind: QuickAddTokenKind; text: string }[];
}

interface Match {
  start: number;
  end: number;
  kind: QuickAddTokenKind;
  apply: (r: QuickAddResult) => boolean; // false = ne pas consommer le fragment
}

/** Minuscules sans accents, en conservant la longueur (indices alignés sur le texte d'origine). */
function normalize(text: string): string {
  return Array.from(text)
    .map((c) => {
      const n = c.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
      return n.length === c.length ? n : c.toLowerCase().length === c.length ? c.toLowerCase() : c;
    })
    .join('')
    .replace(/[’`]/g, "'");
}

const B = '(?<![\\p{L}\\p{N}])'; // début de mot
const E = '(?![\\p{L}\\p{N}])'; // fin de mot
const re = (src: string) => new RegExp(`${B}(?:${src})${E}`, 'gu');

const WEEKDAYS_FR = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const WEEKDAYS_EN = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const MONTHS_FR = [
  'janvier',
  'fevrier',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'aout',
  'septembre',
  'octobre',
  'novembre',
  'decembre',
];
const MONTHS_EN = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

const TOGETHER = new Set(['nous', 'tous', 'ensemble', 'deux', 'both', 'us', 'all', 'together']);

function nextWeekday(today: IsoDate, weekday: number, strictlyAfter: boolean): IsoDate {
  let delta = (weekday - weekdayOf(today) + 7) % 7;
  if (delta === 0 && strictlyAfter) delta = 7;
  return addDays(today, delta);
}

/** Prochaine date (≥ aujourd'hui) pour un jour/mois sans année. */
function nextDayMonth(
  today: IsoDate,
  day: number,
  month: number,
  year?: number,
): IsoDate | undefined {
  const t = parseIsoDate(today);
  const fix = (y: number) =>
    day <= daysInMonth(y, month) ? formatIsoDate(y, month, day) : undefined;
  if (year !== undefined) return fix(year < 100 ? 2000 + year : year);
  const thisYear = fix(t.year);
  return thisYear && thisYear >= today ? thisYear : fix(t.year + 1);
}

function nextDayOfMonth(today: IsoDate, day: number): IsoDate | undefined {
  const t = parseIsoDate(today);
  for (let i = 0; i < 12; i++) {
    const month = ((t.month - 1 + i) % 12) + 1;
    const year = t.year + Math.floor((t.month - 1 + i) / 12);
    if (day <= daysInMonth(year, month)) {
      const d = formatIsoDate(year, month, day);
      if (d >= today) return d;
    }
  }
  return undefined;
}

const validTime = (h: number, m: number) => h >= 0 && h <= 23 && m >= 0 && m <= 59;

const TOGETHER_BARE = new Set([
  'a deux',
  'tous les deux',
  'toutes les deux',
  'nous deux',
  'ensemble',
  'together',
  'both of us',
]);

/** « Grace », « Grace et Nicolas », « à deux »… → membres ; null si ce n'est pas que ça. */
function bareAssignees(gap: string, members: { id: string; key: string }[]): string[] | null {
  if (!gap || members.length === 0) return null;
  if (TOGETHER_BARE.has(gap)) return members.map((m) => m.id);
  const parts = gap.split(/\s*(?:,|&|\bet\b|\band\b)\s*/u).filter(Boolean);
  const ids: string[] = [];
  for (const part of parts) {
    const found =
      members.find((m) => m.key === part) ?? members.find((m) => m.key.split(' ')[0] === part);
    if (!found) return null;
    ids.push(found.id);
  }
  return ids.length ? [...new Set(ids)] : null;
}

export function parseQuickAdd(input: string, ctx: QuickAddContext): QuickAddResult {
  const text = input.replace(/\s+/g, ' ').trim();
  const norm = normalize(text);
  const matches: Match[] = [];
  const add = (
    regex: RegExp,
    kind: QuickAddTokenKind,
    apply: (m: RegExpExecArray, r: QuickAddResult) => boolean,
    keep: (m: RegExpExecArray) => boolean = () => true,
  ) => {
    for (const m of norm.matchAll(regex)) {
      if (!keep(m)) continue;
      matches.push({ start: m.index, end: m.index + m[0].length, kind, apply: (r) => apply(m, r) });
    }
  };
  const setDate = (r: QuickAddResult, date: IsoDate | undefined) => {
    if (!date || r.date || r.dueDate) return false;
    r.date = date;
    return true;
  };

  // ── Échéances souples (avant « semaine » de « dans 2 semaines ») ──
  const setDue = (r: QuickAddResult, due: IsoDate) => {
    if (r.date || r.dueDate) return false;
    r.dueDate = due;
    return true;
  };
  add(re('cette semaine|this week'), 'due', (_, r) => setDue(r, endOfWeek(ctx.today)));
  add(re('ce mois(?:-ci| ci)?|this month'), 'due', (_, r) => setDue(r, endOfMonth(ctx.today)));
  add(re('ce week[- ]?end|this weekend'), 'date', (_, r) => {
    // Le week-end en cours (aujourd'hui si on y est déjà), sinon le samedi qui vient.
    const wd = weekdayOf(ctx.today);
    return setDate(r, wd >= 5 ? ctx.today : addDays(ctx.today, 5 - wd));
  });

  // ── Dates ──
  add(re("aujourd'hui|aujourdhui|auj|today"), 'date', (_, r) => setDate(r, ctx.today));
  add(re('ce soir|tonight'), 'date', (_, r) => {
    if (!setDate(r, ctx.today)) return false;
    r.startMinute ??= 19 * 60; // « ce soir » sans heure : 19:00 (l'heure explicite, traitée après, gagne)
    return true;
  });
  add(re('apres[- ]demain|day after tomorrow'), 'date', (_, r) =>
    setDate(r, addDays(ctx.today, 2)),
  );
  add(re('demain|tomorrow'), 'date', (_, r) => setDate(r, addDays(ctx.today, 1)));
  add(
    re(`(?:(next) )?(${[...WEEKDAYS_FR, ...WEEKDAYS_EN].join('|')})(?: (prochain))?`),
    'date',
    (m, r) => {
      const idx =
        WEEKDAYS_FR.indexOf(m[2]!) >= 0 ? WEEKDAYS_FR.indexOf(m[2]!) : WEEKDAYS_EN.indexOf(m[2]!);
      return setDate(r, nextWeekday(ctx.today, idx, Boolean(m[1] || m[3])));
    },
  );
  add(re('(?:dans|in) (\\d{1,3}) (jours?|semaines?|days?|weeks?)'), 'date', (m, r) => {
    const n = Number(m[1]);
    return setDate(r, addDays(ctx.today, /^(semaine|week)/.test(m[2]!) ? n * 7 : n));
  });
  add(
    re(`(?:le )?(\\d{1,2})(?:er)? (${[...MONTHS_FR, ...MONTHS_EN].join('|')})(?: (\\d{4}))?`),
    'date',
    (m, r) => {
      const month =
        (MONTHS_FR.indexOf(m[2]!) >= 0 ? MONTHS_FR.indexOf(m[2]!) : MONTHS_EN.indexOf(m[2]!)) + 1;
      return setDate(
        r,
        nextDayMonth(ctx.today, Number(m[1]), month, m[3] ? Number(m[3]) : undefined),
      );
    },
  );
  add(re('(?:le )?(\\d{1,2})/(\\d{1,2})(?:/(\\d{2}|\\d{4}))?'), 'date', (m, r) => {
    const day = Number(m[1]);
    const month = Number(m[2]);
    if (month < 1 || month > 12) return false;
    return setDate(r, nextDayMonth(ctx.today, day, month, m[3] ? Number(m[3]) : undefined));
  });
  add(re('le (\\d{1,2})(?:er)?'), 'date', (m, r) =>
    setDate(r, nextDayOfMonth(ctx.today, Number(m[1]))),
  );

  // ── Durées (avant les heures : « pendant 1h30 » n'est pas une heure) ──
  const toMinutes = (value: number, unit: string, extra?: string) =>
    /^(h|heure|hour)/.test(unit) ? value * 60 + (extra ? Number(extra) : 0) : value;
  add(
    re('(?:pendant|pour|durant|for) (\\d{1,3}) ?(min|mins|minutes?|h|heures?|hours?)(\\d{2})?'),
    'duration',
    (m, r) => {
      if (r.durationMinutes !== undefined) return false;
      const d = toMinutes(Number(m[1]), m[2]!, m[3]);
      if (d < 1 || d > 1440) return false;
      r.durationMinutes = d;
      return true;
    },
  );
  add(re('(\\d{1,3}) ?(?:min|mins|minutes)'), 'duration', (m, r) => {
    const d = Number(m[1]);
    if (r.durationMinutes !== undefined || d < 1 || d > 1440) return false;
    r.durationMinutes = d;
    return true;
  });

  // ── Heures ──
  const setTime = (r: QuickAddResult, h: number, min: number, force = true) => {
    if (!validTime(h, min)) return false;
    if (r.startMinute !== undefined && !force) return false;
    r.startMinute = h * 60 + min;
    return true;
  };
  add(re('(?:a |vers |at |@ )?(\\d{1,2}) ?(am|pm)'), 'time', (m, r) => {
    let h = Number(m[1]);
    if (h < 1 || h > 12) return false;
    if (m[2] === 'pm' && h !== 12) h += 12;
    if (m[2] === 'am' && h === 12) h = 0;
    return setTime(r, h, 0);
  });
  add(re('(?:a |vers |at |@ ?)?(\\d{1,2})h(\\d{2})?'), 'time', (m, r) =>
    setTime(r, Number(m[1]), Number(m[2] ?? 0)),
  );
  add(re('(?:a |vers |at |@ ?)?(\\d{1,2}):(\\d{2})'), 'time', (m, r) =>
    setTime(r, Number(m[1]), Number(m[2])),
  );
  add(re('(?:a |at )?(midi|noon|minuit|midnight)'), 'time', (m, r) =>
    setTime(r, /midi|noon/.test(m[1]!) ? 12 : 0, 0),
  );

  // ── Responsables, catégorie, priorité ──
  const members = ctx.members.map((mb) => ({ ...mb, key: normalize(mb.displayName) }));
  // « @21h » n'est pas une personne : le fragment n'est retenu que s'il désigne un membre, sinon
  // il masquerait l'heure qu'il contient.
  const resolvesMember = (key: string) =>
    TOGETHER.has(key) || members.some((mb) => mb.key === key || mb.key.startsWith(key));
  add(
    /(?<!\S)@(\p{L}[\p{L}\p{N}_-]*)/gu,
    'assignee',
    (m, r) => {
      const key = m[1]!;
      if (TOGETHER.has(key)) {
        r.assigneeIds = members.map((mb) => mb.id);
        return members.length > 0;
      }
      const found =
        members.find((mb) => mb.key === key) ?? members.find((mb) => mb.key.startsWith(key));
      if (!found) return false;
      r.assigneeIds = [...new Set([...(r.assigneeIds ?? []), found.id])];
      return true;
    },
    (m) => resolvesMember(m[1]!),
  );
  const categories = ctx.categories.map((c) => ({ ...c, key: normalize(c.name) }));
  add(/(?<!\S)#([\p{L}\p{N}_-]+)/gu, 'category', (m, r) => {
    if (r.categoryId) return false;
    const key = m[1]!;
    const found =
      categories.find((c) => c.key === key) ?? categories.find((c) => c.key.startsWith(key));
    if (!found) return false;
    r.categoryId = found.id;
    return true;
  });
  add(/(?<!\S)(!{1,2})(?!\S)/gu, 'priority', (m, r) => {
    r.priority = m[1] === '!!' ? 'URGENT' : 'HIGH';
    return true;
  });

  // Fragments qui se chevauchent : le plus à gauche, puis le plus long, l'emporte.
  matches.sort((a, b) => a.start - b.start || b.end - a.end);
  const result: QuickAddResult = { title: '', tokens: [] };
  const consumed: Match[] = [];
  let cursor = -1;
  // Les heures explicites passent après « ce soir » pour pouvoir remplacer son heure par défaut.
  const ordered = [
    ...matches.filter((m) => m.kind !== 'time'),
    ...matches.filter((m) => m.kind === 'time'),
  ];
  const taken = new Set<Match>();
  for (const m of matches) {
    if (m.start < cursor) continue;
    taken.add(m);
    cursor = m.end;
  }
  for (const m of ordered) {
    if (taken.has(m) && m.apply(result)) consumed.push(m);
  }
  consumed.sort((a, b) => a.start - b.start);

  // Prénoms sans @ : seulement dans les intervalles APRÈS le premier fragment reconnu, et si
  // l'intervalle entier désigne des membres (« chez Grace » reste dans le titre).
  if (!result.assigneeIds && consumed.length > 0) {
    for (let i = 0; i < consumed.length; i++) {
      const from = consumed[i]!.end;
      const to = consumed[i + 1]?.start ?? norm.length;
      const gap = norm.slice(from, to);
      const ids = bareAssignees(gap.trim(), members);
      if (!ids) continue;
      const lead = gap.length - gap.trimStart().length;
      const start = from + lead;
      const end = from + gap.trimEnd().length;
      result.assigneeIds = ids;
      consumed.splice(i + 1, 0, { start, end, kind: 'assignee', apply: () => true });
      break;
    }
  }
  result.tokens = consumed.map((m) => ({ kind: m.kind, text: text.slice(m.start, m.end) }));

  let title = '';
  let last = 0;
  for (const m of consumed) {
    title += `${text.slice(last, m.start)} `;
    last = m.end;
  }
  title += text.slice(last);
  result.title = title
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/(?:\s+(?:à|a|le|pour|vers|at|on|by|for|,))+\s*$/i, '')
    .replace(/^[\s,;:-]+|[\s,;:-]+$/g, '')
    .trim();
  return result;
}
