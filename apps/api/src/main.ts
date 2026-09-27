import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import { initErrorReporting } from './common/error-reporter';
import { env } from './config/env';
import { buildOpenApi } from './openapi/openapi';

async function main(): Promise<void> {
  const config = env();
  initErrorReporting();
  const app = await NestFactory.create(AppModule, { bufferLogs: true, rawBody: true });
  app.useLogger(app.get(Logger));
  configureApp(app);
  if (config.NODE_ENV !== 'production') {
    SwaggerModule.setup('docs', app, buildOpenApi(app));
  }
  await app.listen(config.PORT);
}

void main();
