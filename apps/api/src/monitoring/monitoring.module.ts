import { Module } from '@nestjs/common';
import { CalendarModule } from '../calendar/calendar.module';
import { MailModule } from '../mail/mail.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MonitoringService } from './monitoring.service';
import { MetricsController, StatusController } from './status.controller';

@Module({
  imports: [CalendarModule, MailModule, NotificationsModule],
  controllers: [StatusController, MetricsController],
  providers: [MonitoringService],
  exports: [MonitoringService],
})
export class MonitoringModule {}
