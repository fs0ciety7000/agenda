/**
 * Codes-barres produits (GTIN : EAN-8, UPC-A, EAN-13, GTIN-14). Un code se termine par une clé
 * de contrôle : la vérifier écarte une saisie erronée ou une lecture partielle.
 */

/** Chiffres seulement, espaces et tirets retirés (« 5 400000 000003 » → « 5400000000003 »). */
export function normalizeBarcode(input: string): string {
  return input.replace(/[\s-]/g, '');
}

/** Vrai pour un GTIN de 8, 12, 13 ou 14 chiffres dont la clé de contrôle est juste. */
export function isValidBarcode(code: string): boolean {
  if (!/^(\d{8}|\d{12,14})$/.test(code)) return false;
  const digits = [...code].map(Number);
  const check = digits.pop()!;
  // Poids 3 puis 1 en partant de la droite (hors clé).
  const sum = digits.reverse().reduce((s, d, i) => s + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}
