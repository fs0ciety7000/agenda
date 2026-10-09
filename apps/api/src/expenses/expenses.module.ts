import { Module } from '@nestjs/common';
import { HouseholdsModule } from '../households/households.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ExpensesController } from './expenses.controller';
import { ExpensesService } from './expenses.service';
import { ReceiptScannerService } from './receipt-scanner.service';

@Module({
  imports: [HouseholdsModule, NotificationsModule],
  controllers: [ExpensesController],
  providers: [ExpensesService, ReceiptScannerService],
})
export class ExpensesModule {}
