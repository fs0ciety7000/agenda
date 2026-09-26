import { Module } from '@nestjs/common';
import { HouseholdsModule } from '../households/households.module';
import { TasksController } from './tasks.controller';
import { SeriesService } from './series.service';
import { TasksService } from './tasks.service';

@Module({
  imports: [HouseholdsModule],
  controllers: [TasksController],
  providers: [TasksService, SeriesService],
})
export class TasksModule {}
