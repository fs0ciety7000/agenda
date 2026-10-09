import { Module } from '@nestjs/common';
import { HouseholdsModule } from '../households/households.module';
import {
  GuestShoppingController,
  GuestShoppingSettingsController,
} from './guest-shopping.controller';
import { GuestShoppingService } from './guest-shopping.service';
import { MealsController } from './meals.controller';
import { MealsService } from './meals.service';
import { ShoppingController } from './shopping.controller';
import { ShoppingService } from './shopping.service';

@Module({
  imports: [HouseholdsModule],
  controllers: [
    ShoppingController,
    MealsController,
    GuestShoppingSettingsController,
    GuestShoppingController,
  ],
  providers: [ShoppingService, MealsService, GuestShoppingService],
})
export class ShoppingModule {}
