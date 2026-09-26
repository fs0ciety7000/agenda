/**
 * Codes d'erreur stables renvoyés par l'API. Les clients traduisent le code ;
 * l'API ne renvoie jamais de message destiné à être affiché tel quel.
 */
export const ErrorCode = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  EMAIL_ALREADY_USED: 'EMAIL_ALREADY_USED',
  REGISTRATION_CLOSED: 'REGISTRATION_CLOSED',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  CSRF_REJECTED: 'CSRF_REJECTED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  HOUSEHOLD_NOT_FOUND: 'HOUSEHOLD_NOT_FOUND',
  INVITATION_INVALID: 'INVITATION_INVALID',
  ALREADY_MEMBER: 'ALREADY_MEMBER',
  VERSION_CONFLICT: 'VERSION_CONFLICT',
  CATEGORY_NAME_TAKEN: 'CATEGORY_NAME_TAKEN',
  TASK_TITLE_REQUIRED: 'TASK_TITLE_REQUIRED',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL: 'INTERNAL',
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    /** Message technique en anglais, pour les logs/développeurs uniquement. */
    message: string;
    details?: unknown;
  };
}
