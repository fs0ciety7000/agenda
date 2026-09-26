import { HttpException, HttpStatus } from '@nestjs/common';
import type { ApiErrorBody, ErrorCode } from '@agenda/contracts';

/** Exception métier : un code stable + un statut HTTP. */
export class AppException extends HttpException {
  constructor(
    readonly code: ErrorCode,
    status: HttpStatus,
    message: string = code,
    readonly details?: unknown,
  ) {
    super({ error: { code, message, details } } satisfies ApiErrorBody, status);
  }
}

export const notFound = (code: ErrorCode = 'NOT_FOUND') =>
  new AppException(code, HttpStatus.NOT_FOUND, 'Resource not found');
