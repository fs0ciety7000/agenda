import { Module } from '@nestjs/common';
import { HouseholdsModule } from '../households/households.module';
import {
  GuestShoppingController,
  GuestShoppingSettingsController,
} from './guest-shopping.controller';
import { BarcodeController } from './barcode.controller';
import { BarcodeService } from './barcode.service';
import { GuestShoppingService } from './guest-shopping.service';
import { MealsController } from './meals.controller';
import { MealsService } from './meals.service';
import { OpenFoodFactsClient } from './open-food-facts.client';
import { ShoppingController } from './shopping.controller';
import { ShoppingService } from './shopping.service';

@Module({
  imports: [HouseholdsModule],
  controllers: [
    ShoppingController,
    MealsController,
    GuestShoppingSettingsController,
    GuestShoppingController,
    BarcodeController,
  ],
  providers: [
    ShoppingService,
    MealsService,
    GuestShoppingService,
    BarcodeService,
    OpenFoodFactsClient,
  ],
})
export class ShoppingModule {}
