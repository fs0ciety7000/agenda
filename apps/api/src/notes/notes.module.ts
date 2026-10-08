import { Module } from '@nestjs/common';
import { HouseholdsModule } from '../households/households.module';
import { NotesController } from './notes.controller';
import { NotesService } from './notes.service';

@Module({
  imports: [HouseholdsModule],
  controllers: [NotesController],
  providers: [NotesService],
})
export class NotesModule {}
