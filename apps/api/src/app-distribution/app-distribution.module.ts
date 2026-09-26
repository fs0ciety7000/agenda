import { Module } from '@nestjs/common';
import { AndroidReleaseController } from './android-release.controller';
import { AndroidReleaseService } from './android-release.service';

@Module({
  controllers: [AndroidReleaseController],
  providers: [AndroidReleaseService],
})
export class AppDistributionModule {}
