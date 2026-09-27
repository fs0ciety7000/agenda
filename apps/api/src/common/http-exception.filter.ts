import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { ApiErrorBody, ErrorCode } from '@agenda/contracts';
import type { Request, Response } from 'express';
import { reportServerError } from './error-reporter';

const STATUS_TO_CODE: Record<number, ErrorCode> = {
  400: 'VALIDATION_FAILED',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'VERSION_CONFLICT',
  413: 'ATTACHMENT_TOO_LARGE',
  429: 'RATE_LIMITED',
};

/**
 * Toutes les erreurs sortent au format { error: { code, message } }.
 * Les erreurs inattendues ne divulguent jamais de détail interne.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const status =
        exception instanceof ThrottlerException
          ? HttpStatus.TOO_MANY_REQUESTS
          : exception.getStatus();
      const body = exception.getResponse();
      // Déjà au format de l'API (AppException). Le format par défaut de Nest a aussi une clé
      // `error`, mais c'est une chaîne (« Payload Too Large ») : on le convertit.
      if (
        typeof body === 'object' &&
        body !== null &&
        'error' in body &&
        typeof body.error === 'object'
      ) {
        res.status(status).json(body);
        return;
      }
      const payload: ApiErrorBody = {
        error: { code: STATUS_TO_CODE[status] ?? 'INTERNAL', message: exception.message },
      };
      res.status(status).json(payload);
      return;
    }

    this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    reportServerError(exception, host.switchToHttp().getRequest<Request>().route?.path as string);
    const payload: ApiErrorBody = { error: { code: 'INTERNAL', message: 'Internal error' } };
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json(payload);
  }
}
