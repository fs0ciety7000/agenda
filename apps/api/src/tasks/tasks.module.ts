import { Module } from '@nestjs/common';
import { HouseholdsModule } from '../households/households.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AbsencesController } from './absences.controller';
import { AbsencesService } from './absences.service';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';
import { ActivityController } from './activity.controller';
import { AttachmentsController } from './attachments.controller';
import { AttachmentsService } from './attachments.service';
import { ActivityService } from './activity.service';
import { TasksController } from './tasks.controller';
import { SeriesService } from './series.service';
import { TasksService } from './tasks.service';
import { TemplatesController } from './templates.controller';
import { TemplatesService } from './templates.service';

@Module({
  imports: [HouseholdsModule, NotificationsModule],
  controllers: [
    TasksController,
    TemplatesController,
    ActivityController,
    AttachmentsController,
    AbsencesController,
    CommentsController,
  ],
  providers: [
    TasksService,
    SeriesService,
    TemplatesService,
    ActivityService,
    AttachmentsService,
    AbsencesService,
    CommentsService,
  ],
  exports: [SeriesService, TasksService, AttachmentsService],
})
export class TasksModule {}
