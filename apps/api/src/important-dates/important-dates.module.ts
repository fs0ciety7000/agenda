import { Module } from '@nestjs/common';
import { HouseholdsModule } from '../households/households.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ImportantDatesController } from './important-dates.controller';
import { ImportantDatesService } from './important-dates.service';

@Module({
  imports: [HouseholdsModule, NotificationsModule],
  controllers: [ImportantDatesController],
  providers: [ImportantDatesService],
  exports: [ImportantDatesService],
})
export class ImportantDatesModule {}
