import { Module } from '@nestjs/common';
import { HouseholdsModule } from '../households/households.module';
import { TasksModule } from '../tasks/tasks.module';
import {
  InboundEmailSettingsController,
  ResendWebhookController,
} from './inbound-email.controller';
import { ResendReceivingClient } from './resend-receiving.client';
import { InboundEmailService } from './inbound-email.service';

@Module({
  imports: [HouseholdsModule, TasksModule],
  controllers: [InboundEmailSettingsController, ResendWebhookController],
  providers: [InboundEmailService, ResendReceivingClient],
})
export class InboundEmailModule {}
