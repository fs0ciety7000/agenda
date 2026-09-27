import { Module } from '@nestjs/common';
import { HouseholdsModule } from '../households/households.module';
import { TasksModule } from '../tasks/tasks.module';
import { InboundEmailController, InboundEmailSettingsController } from './inbound-email.controller';
import { InboundEmailService } from './inbound-email.service';

@Module({
  imports: [HouseholdsModule, TasksModule],
  controllers: [InboundEmailSettingsController, InboundEmailController],
  providers: [InboundEmailService],
})
export class InboundEmailModule {}
