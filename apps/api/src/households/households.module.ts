import { Module } from '@nestjs/common';
import { HouseholdMemberGuard } from './household-member.guard';
import { HouseholdsController } from './households.controller';
import { HouseholdsService } from './households.service';

@Module({
  controllers: [HouseholdsController],
  providers: [HouseholdsService, HouseholdMemberGuard],
  exports: [HouseholdMemberGuard],
})
export class HouseholdsModule {}
