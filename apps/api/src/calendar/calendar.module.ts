import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { HouseholdsModule } from '../households/households.module';
import { TasksModule } from '../tasks/tasks.module';
import { CalendarConnectionService } from './calendar-connection.service';
import { CalendarQueueService } from './calendar-queue.service';
import { GoogleCalendarSyncService } from './calendar-sync.service';
import { CalendarController } from './calendar.controller';
import { IcalFeedController, IcalFeedSettingsController } from './ical-feed.controller';
import { IcalFeedService } from './ical-feed.service';
import { env } from '../config/env';
import { FakeGoogleCalendar } from './fake-google-calendar';
import { GoogleCalendarClient, HttpGoogleCalendarClient } from './google-calendar.client';
import { GoogleTokensService } from './google-tokens.service';

@Module({
  imports: [HouseholdsModule, TasksModule, NotificationsModule],
  controllers: [CalendarController, IcalFeedSettingsController, IcalFeedController],
  providers: [
    {
      provide: GoogleCalendarClient,
      useFactory: () => {
        if (!env().GOOGLE_CALENDAR_FAKE) return new HttpGoogleCalendarClient();
        if (env().NODE_ENV === 'production')
          throw new Error('GOOGLE_CALENDAR_FAKE is not allowed in production');
        return FakeGoogleCalendar.demo();
      },
    },
    GoogleTokensService,
    GoogleCalendarSyncService,
    CalendarQueueService,
    CalendarConnectionService,
    IcalFeedService,
  ],
  exports: [CalendarConnectionService, GoogleCalendarSyncService, CalendarQueueService],
})
export class CalendarModule {}
