import { Module } from '@nestjs/common';
import { HouseholdsModule } from '../households/households.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ActivityController } from './activity.controller';
import { ActivityService } from './activity.service';
import { TasksController } from './tasks.controller';
import { SeriesService } from './series.service';
import { TasksService } from './tasks.service';
import { TemplatesController } from './templates.controller';
import { TemplatesService } from './templates.service';

@Module({
  imports: [HouseholdsModule, NotificationsModule],
  controllers: [TasksController, TemplatesController, ActivityController],
  providers: [TasksService, SeriesService, TemplatesService, ActivityService],
  exports: [SeriesService],
})
export class TasksModule {}
