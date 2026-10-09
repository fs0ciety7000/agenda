import { Module } from '@nestjs/common';
import { HouseholdsModule } from '../households/households.module';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

@Module({
  imports: [HouseholdsModule],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
