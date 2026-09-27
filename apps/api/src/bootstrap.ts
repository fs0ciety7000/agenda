import { INestApplication, VersioningType } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { CSRF_HEADER } from './auth/csrf.guard';
import { env } from './config/env';
import { requestMetricsMiddleware } from './monitoring/request-metrics';

/** Configuration commune à main.ts et aux tests d'intégration. */
export function configureApp(app: INestApplication): void {
  app.use(requestMetricsMiddleware);
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: env().WEB_ORIGIN,
    credentials: true,
    allowedHeaders: [
      'content-type',
      'authorization',
      CSRF_HEADER,
      'x-client',
      'idempotency-key',
      'if-match',
    ],
  });
  app.enableVersioning({ type: VersioningType.URI });
  app.enableShutdownHooks();
}

export function buildOpenApi(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('Agenda G & N API')
    .setVersion('1')
    .addBearerAuth()
    .addCookieAuth('gn_at')
    .build();
  return SwaggerModule.createDocument(app, config);
}
