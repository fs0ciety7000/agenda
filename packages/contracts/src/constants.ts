/**
 * Constantes partagées, sans Zod : le site les importe par `@agenda/contracts/constants` sans
 * charger tous les schémas (et Zod) dans le navigateur.
 */

/** Devise des dépenses (montants en centimes entiers). */
export const EXPENSE_CURRENCY = 'EUR';

/** Limites des pièces jointes (octets). */
export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const HOUSEHOLD_ATTACHMENTS_MAX_BYTES = 200 * 1024 * 1024;
