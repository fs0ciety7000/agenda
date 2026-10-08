/**
 * Calculs d'argent du foyer, en centimes entiers : partager un montant selon des proportions,
 * et proposer les remboursements qui remettent tous les soldes à zéro.
 */

/**
 * Partage `total` centimes selon des poids (méthode du plus fort reste) : la somme des parts
 * vaut exactement `total`, et les centimes restants vont aux plus forts restes, puis dans
 * l'ordre donné (déterministe).
 */
export function splitCents(total: number, weights: number[]): number[] {
  if (!Number.isInteger(total) || total < 0)
    throw new Error('total must be a non-negative integer');
  const sum = weights.reduce((a, w) => a + Math.max(0, w), 0);
  if (weights.length === 0 || sum === 0)
    throw new Error('at least one positive weight is required');
  const exact = weights.map((w) => (total * Math.max(0, w)) / sum);
  const parts = exact.map(Math.floor);
  let left = total - parts.reduce((a, p) => a + p, 0);
  const order = exact
    .map((x, i) => ({ i, rest: x - Math.floor(x) }))
    .sort((a, b) => b.rest - a.rest || a.i - b.i);
  for (const { i } of order) {
    if (left === 0) break;
    parts[i]! += 1;
    left -= 1;
  }
  return parts;
}

export interface Transfer {
  from: string;
  to: string;
  amount: number;
}

/**
 * Remboursements proposés à partir des soldes (> 0 : on lui doit ; < 0 : il doit). Le plus
 * gros débiteur rembourse le plus gros créancier, jusqu'à zéro : au plus n − 1 virements.
 * Les soldes dont la somme n'est pas nulle sont refusés (erreur de calcul en amont).
 */
export function settleTransfers(balances: { id: string; balance: number }[]): Transfer[] {
  if (balances.reduce((a, b) => a + b.balance, 0) !== 0)
    throw new Error('balances must sum to zero');
  const debtors = balances.filter((b) => b.balance < 0).map((b) => ({ ...b, left: -b.balance }));
  const creditors = balances.filter((b) => b.balance > 0).map((b) => ({ ...b, left: b.balance }));
  const byLeft = (a: { left: number; id: string }, b: { left: number; id: string }) =>
    b.left - a.left || a.id.localeCompare(b.id);
  const out: Transfer[] = [];
  while (debtors.length && creditors.length) {
    debtors.sort(byLeft);
    creditors.sort(byLeft);
    const d = debtors[0]!;
    const c = creditors[0]!;
    const amount = Math.min(d.left, c.left);
    out.push({ from: d.id, to: c.id, amount });
    d.left -= amount;
    c.left -= amount;
    if (d.left === 0) debtors.shift();
    if (c.left === 0) creditors.shift();
  }
  return out;
}

/** « 12,50 », « 12.5 », « 1 234,56 € » → 1250, 1250, 123456 ; null si illisible ou ≤ 0. */
export function parseAmountToCents(text: string): number | null {
  const cleaned = text.replace(/[€\s  ]/g, '');
  if (!/^\d+([.,]\d{1,2})?$/.test(cleaned)) return null;
  const [euros, cents = ''] = cleaned.split(/[.,]/);
  const value = Number(euros) * 100 + Number(cents.padEnd(2, '0'));
  return value > 0 && Number.isSafeInteger(value) ? value : null;
}
