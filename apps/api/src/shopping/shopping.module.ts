import { Module } from '@nestjs/common';
import { HouseholdsModule } from '../households/households.module';
import { ShoppingController } from './shopping.controller';
import { ShoppingService } from './shopping.service';

@Module({
  imports: [HouseholdsModule],
  controllers: [ShoppingController],
  providers: [ShoppingService],
})
export class ShoppingModule {}
