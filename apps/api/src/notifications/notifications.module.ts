import { Module } from '@nestjs/common';
import { HouseholdsModule } from '../households/households.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { PushController } from './push.controller';
import { PushService } from './push.service';
import { WebPushController } from './web-push.controller';
import { WebPushService } from './web-push.service';

@Module({
  imports: [HouseholdsModule],
  controllers: [NotificationsController, PushController, WebPushController],
  providers: [NotificationsService, PushService, WebPushService],
  exports: [NotificationsService, PushService, WebPushService],
})
export class NotificationsModule {}
