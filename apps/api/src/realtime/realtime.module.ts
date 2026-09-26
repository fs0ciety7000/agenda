import { Module } from '@nestjs/common';
import { HouseholdsModule } from '../households/households.module';
import { RealtimeController } from './realtime.controller';

@Module({ imports: [HouseholdsModule], controllers: [RealtimeController] })
export class RealtimeModule {}
