import { Controller, Get, Header, HttpStatus, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { StatusPageDto } from '@agenda/contracts';
import type { Request } from 'express';
import { AppException } from '../common/app-exception';
import { safeEqual } from '../common/crypto';
import { Public } from '../common/request-context';
import { env } from '../config/env';
import { MonitoringService } from './monitoring.service';

/** Page publique /status : état des composants, disponibilité sur 90 jours, incidents. */
@ApiTags('monitoring')
@Public()
@Controller({ path: 'status', version: '1' })
export class StatusController {
  constructor(private readonly monitoring: MonitoringService) {}

  /** État public du service (page /status). */
  @Get()
  @Header('cache-control', 'public, max-age=30')
  status(): Promise<StatusPageDto> {
    return this.monitoring.statusPage();
  }
}

/** Prometheus / Grafana : `Authorization: Bearer <METRICS_TOKEN>`. Sans jeton configuré : 404. */
@ApiTags('monitoring')
@Public()
@SkipThrottle()
@Controller('metrics')
export class MetricsController {
  constructor(private readonly monitoring: MonitoringService) {}

  /** Métriques Prometheus (jeton `METRICS_TOKEN`). */
  @Get()
  @Header('content-type', 'text/plain; version=0.0.4; charset=utf-8')
  metrics(@Req() req: Request): Promise<string> {
    const token = env().METRICS_TOKEN;
    const given = req.headers.authorization?.replace(/^Bearer /, '') ?? '';
    if (!token) throw new AppException('NOT_FOUND', HttpStatus.NOT_FOUND, 'Not found');
    if (!safeEqual(given, token))
      throw new AppException('UNAUTHENTICATED', HttpStatus.UNAUTHORIZED, 'Invalid token');
    return this.monitoring.prometheus();
  }
}
