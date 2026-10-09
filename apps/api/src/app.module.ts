import { AdminModule } from './admin/admin.module';
import { MonitoringModule } from './monitoring/monitoring.module';
import { ReportsModule } from './reports/reports.module';
import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AppDistributionModule } from './app-distribution/app-distribution.module';
import { AuthModule } from './auth/auth.module';
import { ClientErrorsController } from './common/client-errors.controller';
import { ClientIpThrottlerGuard } from './common/client-ip-throttler.guard';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { env } from './config/env';
import { HealthController } from './health/health.controller';
import { CategoriesModule } from './categories/categories.module';
import { HouseholdsModule } from './households/households.module';
import { CalendarModule } from './calendar/calendar.module';
import { DomainEventsModule } from './common/domain-events';
import { MailModule } from './mail/mail.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PrismaModule } from './prisma/prisma.module';
import { PrivacyModule } from './privacy/privacy.module';
import { RealtimeModule } from './realtime/realtime.module';
import { ImportantDatesModule } from './important-dates/important-dates.module';
import { NotesModule } from './notes/notes.module';
import { SearchModule } from './search/search.module';
import { ShoppingModule } from './shopping/shopping.module';
import { ExpensesModule } from './expenses/expenses.module';
import { InboundEmailModule } from './inbound/inbound-email.module';
import { TasksModule } from './tasks/tasks.module';

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
    ThrottlerModule.forRoot([
      { name: 'default', ttl: 60_000, limit: () => env().GLOBAL_RATE_LIMIT },
    ]),
    PrismaModule,
    MailModule,
    DomainEventsModule,
    AuthModule,
    HouseholdsModule,
    CategoriesModule,
    TasksModule,
    InboundEmailModule,
    PrivacyModule,
    CalendarModule,
    AppDistributionModule,
    NotificationsModule,
    ShoppingModule,
    NotesModule,
    SearchModule,
    ImportantDatesModule,
    ExpensesModule,
    RealtimeModule,
    AdminModule,
    MonitoringModule,
    ReportsModule,
  ],
  controllers: [HealthController, ClientErrorsController],
  providers: [
    { provide: APP_GUARD, useClass: ClientIpThrottlerGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule {}
