import { Module } from '@nestjs/common';
import { HouseholdsModule } from '../households/households.module';
import { MealsController } from './meals.controller';
import { MealsService } from './meals.service';
import { ShoppingController } from './shopping.controller';
import { ShoppingService } from './shopping.service';

@Module({
  imports: [HouseholdsModule],
  controllers: [ShoppingController, MealsController],
  providers: [ShoppingService, MealsService],
})
export class ShoppingModule {}
