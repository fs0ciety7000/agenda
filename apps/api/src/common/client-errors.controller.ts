import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ClientErrorInput } from '@agenda/contracts';
import { reportClientError } from './error-reporter';
import { Public } from './request-context';
import { ZodPipe } from './zod.pipe';

/** Erreurs du site et de l'app Android (y compris avant connexion) : logs + Sentry. */
@ApiTags('monitoring')
@Public()
@Controller({ path: 'client-errors', version: '1' })
export class ClientErrorsController {
  @Post()
  @HttpCode(204)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  report(@Body(new ZodPipe(ClientErrorInput)) body: ClientErrorInput): void {
    reportClientError(body);
  }
}
