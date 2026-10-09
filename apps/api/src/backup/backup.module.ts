import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { HouseholdsModule } from '../households/households.module';
import { BackupExportController, BackupRestoreController } from './backup.controller';
import { BackupExportService } from './backup-export.service';
import { BackupRestoreService } from './backup-restore.service';

@Module({
  imports: [HouseholdsModule, AuthModule],
  controllers: [BackupExportController, BackupRestoreController],
  providers: [BackupExportService, BackupRestoreService],
})
export class BackupModule {}
