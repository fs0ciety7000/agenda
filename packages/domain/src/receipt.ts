/**
 * Lecture d'un ticket de caisse : à partir du texte reconnu (OCR), propose le montant payé, la
 * date et le commerçant. Le texte d'OCR est bruité : chaque champ vaut `null` quand rien de sûr
 * n'est trouvé, et l'utilisateur corrige toujours avant d'enregistrer.
 */
export interface ReceiptReading {
  /** Montant total en centimes. */
  amountCents: number | null;
  /** Date du ticket, AAAA-MM-JJ. */
  date: string | null;
  /** Nom du commerçant (première ligne lisible du ticket). */
  merchant: string | null;
}

/** Montant : 12,34 · 12.34 · 1 234,56 · 1.234,56 · 1,234.56 (deux décimales obligatoires). */
// Pas suivi d'un chiffre ni d'un séparateur et d'un chiffre : « 12.10.2026 » est une date.
const AMOUNT = /(?<![\d.,])(\d{1,3}(?:[ .,\u00a0]\d{3})+|\d{1,6})\s?[.,]\s?(\d{2})(?!\d|[.,/-]\d)/g;

/** Lignes qui annoncent le total à payer (français, néerlandais, anglais). */
const TOTAL =
  /\b(total|totaal|te betalen|a payer|à payer|net a payer|net à payer|montant|amount due|grand total|bedrag|cb|carte|bancontact|pin|visa|mastercard)\b/i;

/** Lignes à écarter : sous-total, taxes, rendu de monnaie, remises. */
const EXCLUDED =
  /(sous[- ]?total|subtotal|subtotaal|total\s*ht\b|\bht\b|\btva\b|\bbtw\b|\bvat\b|\btax\b|rendu|wisselgeld|\bchange\b|remise|korting|discount|reduction|réduction|terug|monnaie)/i;

/** Au-delà, ce n'est pas un ticket de courses : sans doute un numéro mal lu. */
const MAX_CENTS = 100_000_00;

const MONTHS: Record<string, number> = {
  janv: 1,
  jan: 1,
  january: 1,
  janvier: 1,
  januari: 1,
  fevr: 2,
  févr: 2,
  feb: 2,
  fev: 2,
  fév: 2,
  february: 2,
  fevrier: 2,
  février: 2,
  februari: 2,
  mars: 3,
  mar: 3,
  march: 3,
  maart: 3,
  mrt: 3,
  avr: 4,
  apr: 4,
  april: 4,
  avril: 4,
  mai: 5,
  may: 5,
  mei: 5,
  juin: 6,
  jun: 6,
  june: 6,
  juni: 6,
  juil: 7,
  jul: 7,
  july: 7,
  juillet: 7,
  juli: 7,
  aout: 8,
  août: 8,
  aug: 8,
  august: 8,
  augustus: 8,
  sept: 9,
  sep: 9,
  september: 9,
  septembre: 9,
  oct: 10,
  october: 10,
  octobre: 10,
  okt: 10,
  oktober: 10,
  nov: 11,
  november: 11,
  novembre: 11,
  dec: 12,
  déc: 12,
  december: 12,
  décembre: 12,
  decembre: 12,
};

function amounts(line: string): number[] {
  const out: number[] = [];
  for (const m of line.matchAll(AMOUNT)) {
    const units = Number(m[1]!.replace(/[ .,\u00a0]/g, ''));
    const cents = units * 100 + Number(m[2]);
    if (cents > 0 && cents <= MAX_CENTS) out.push(cents);
  }
  return out;
}

function readAmount(lines: string[]): number | null {
  const totals: number[] = [];
  lines.forEach((line, i) => {
    if (!TOTAL.test(line) || EXCLUDED.test(line)) return;
    // Montant sur la même ligne (le dernier), sinon sur la ligne suivante.
    const here = amounts(line);
    const next = here.length ? here : amounts(lines[i + 1] ?? '');
    const value = here.length ? here[here.length - 1] : next[0];
    if (value != null) totals.push(value);
  });
  if (totals.length) return Math.max(...totals);
  // Sans mot-clé : le plus grand montant du ticket, hors taxes et monnaie rendue.
  const all = lines.filter((l) => !EXCLUDED.test(l)).flatMap(amounts);
  return all.length ? Math.max(...all) : null;
}

function iso(y: number, m: number, d: number): string | null {
  if (y < 100) y += 2000;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

function readDate(text: string, today: string): string | null {
  const candidates: string[] = [];
  const add = (v: string | null) => v && candidates.push(v);
  for (const m of text.matchAll(/(?<!\d)(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?!\d)/g)) {
    add(iso(+m[1]!, +m[2]!, +m[3]!));
  }
  for (const m of text.matchAll(/(?<!\d)(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})(?!\d)/g)) {
    add(iso(+m[3]!, +m[2]!, +m[1]!));
  }
  for (const m of text.matchAll(/(?<!\d)(\d{1,2})\s+([a-zéèûô]{3,9})\.?\s+(\d{4})(?!\d)/gi)) {
    const month = MONTHS[m[2]!.toLowerCase()];
    if (month) add(iso(+m[3]!, month, +m[1]!));
  }
  // Une date plausible : pas dans le futur (un jour de marge), pas de plus de deux ans.
  const max = new Date(`${today}T00:00:00Z`);
  max.setUTCDate(max.getUTCDate() + 1);
  const min = new Date(`${today}T00:00:00Z`);
  min.setUTCFullYear(min.getUTCFullYear() - 2);
  return (
    candidates.find((c) => {
      const t = new Date(`${c}T00:00:00Z`);
      return t >= min && t <= max;
    }) ?? null
  );
}

/** Premières lignes du ticket : la première qui ressemble à un nom (surtout des lettres). */
function readMerchant(lines: string[]): string | null {
  for (const raw of lines.slice(0, 6)) {
    const line = raw
      .replace(/[^\p{L}\p{N}&'’ .-]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const letters = line.replace(/[^\p{L}]/gu, '').length;
    if (letters < 3 || letters / line.replace(/\s/g, '').length < 0.7) continue;
    if (
      /\b(ticket|bienvenue|welkom|welcome|bonjour|merci|kassabon|receipt|facture)\b/i.test(line)
    ) {
      continue;
    }
    const name = line === line.toUpperCase() ? titleCase(line) : line;
    return name.slice(0, 60);
  }
  return null;
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/(^|[\s-])(\p{L})/gu, (_, sep: string, c: string) => sep + c.toUpperCase());
}

/** Lit un ticket ; `today` (AAAA-MM-JJ, fuseau du foyer) écarte les dates impossibles. */
export function readReceipt(text: string, today: string): ReceiptReading {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  return {
    amountCents: readAmount(lines),
    date: readDate(text, today),
    merchant: readMerchant(lines),
  };
}
