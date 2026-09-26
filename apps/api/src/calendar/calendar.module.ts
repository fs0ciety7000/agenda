import { Module } from '@nestjs/common';
import { HouseholdsModule } from '../households/households.module';
import { TasksModule } from '../tasks/tasks.module';
import { CalendarConnectionService } from './calendar-connection.service';
import { CalendarQueueService } from './calendar-queue.service';
import { GoogleCalendarSyncService } from './calendar-sync.service';
import { CalendarController } from './calendar.controller';
import { GoogleCalendarClient, HttpGoogleCalendarClient } from './google-calendar.client';
import { GoogleTokensService } from './google-tokens.service';

@Module({
  imports: [HouseholdsModule, TasksModule],
  controllers: [CalendarController],
  providers: [
    { provide: GoogleCalendarClient, useClass: HttpGoogleCalendarClient },
    GoogleTokensService,
    GoogleCalendarSyncService,
    CalendarQueueService,
    CalendarConnectionService,
  ],
  exports: [CalendarConnectionService, GoogleCalendarSyncService],
})
export class CalendarModule {}
