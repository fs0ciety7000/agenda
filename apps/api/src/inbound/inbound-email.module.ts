import { Module } from '@nestjs/common';
import { HouseholdsModule } from '../households/households.module';
import { MailModule } from '../mail/mail.module';
import { TasksModule } from '../tasks/tasks.module';
import {
  InboundEmailSettingsController,
  ResendWebhookController,
} from './inbound-email.controller';
import { ResendReceivingClient } from './resend-receiving.client';
import { InboundEmailService } from './inbound-email.service';

@Module({
  imports: [HouseholdsModule, TasksModule, MailModule],
  controllers: [InboundEmailSettingsController, ResendWebhookController],
  providers: [InboundEmailService, ResendReceivingClient],
})
export class InboundEmailModule {}
