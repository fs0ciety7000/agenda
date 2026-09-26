import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { buildOpenApi, configureApp } from './bootstrap';
import { env } from './config/env';

async function main(): Promise<void> {
  const config = env();
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  configureApp(app);
  if (config.NODE_ENV !== 'production') {
    SwaggerModule.setup('docs', app, buildOpenApi(app));
  }
  await app.listen(config.PORT);
}

void main();
