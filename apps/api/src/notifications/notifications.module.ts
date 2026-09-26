import { Module } from '@nestjs/common';
import { HouseholdsModule } from '../households/households.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { PushController } from './push.controller';
import { PushService } from './push.service';

@Module({
  imports: [HouseholdsModule],
  controllers: [NotificationsController, PushController],
  providers: [NotificationsService, PushService],
  exports: [NotificationsService, PushService],
})
export class NotificationsModule {}
