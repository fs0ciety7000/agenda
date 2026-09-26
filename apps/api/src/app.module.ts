import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AuthModule } from './auth/auth.module';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { env } from './config/env';
import { HealthController } from './health/health.controller';
import { HouseholdsModule } from './households/households.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: env().NODE_ENV === 'test' ? 'silent' : 'info',
        transport: env().NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
        // Jamais de tokens ni de mots de passe dans les logs.
        redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
      },
    }),
    // V1 : stockage en mémoire (une seule instance). Passage à Redis si mise à l'échelle horizontale.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 100 }]),
    PrismaModule,
    AuthModule,
    HouseholdsModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule {}
