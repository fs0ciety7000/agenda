import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  type ExpenseDto,
  ExpenseInput,
  ExpensesQuery,
  type ExpenseSummaryDto,
  ExpenseWeightsInput,
  SettleInput,
  UpdateExpenseInput,
} from '@agenda/contracts';
import { CurrentHousehold, HouseholdContext } from '../common/request-context';
import { assertUuid } from '../common/uuid';
import { ZodPipe } from '../common/zod.pipe';
import { HouseholdMemberGuard } from '../households/household-member.guard';
import { ExpensesService } from './expenses.service';

@ApiTags('expenses')
@UseGuards(HouseholdMemberGuard)
@Controller({ path: 'households/:householdId/expenses', version: '1' })
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

  /** Dépenses et remboursements d'un mois (les dépenses personnelles des autres sont exclues). */
  @Get()
  list(
    @CurrentHousehold() ctx: HouseholdContext,
    @Query(new ZodPipe(ExpensesQuery)) query: ExpensesQuery,
  ): Promise<ExpenseDto[]> {
    return this.expenses.list(ctx, query.month);
  }

  /** Soldes (qui doit combien à qui), totaux du mois et par catégorie. */
  @Get('summary')
  summary(
    @CurrentHousehold() ctx: HouseholdContext,
    @Query(new ZodPipe(ExpensesQuery)) query: ExpensesQuery,
  ): Promise<ExpenseSummaryDto> {
    return this.expenses.summary(ctx, query.month);
  }

  /** Enregistrer une dépense (identifiant facultatif : un renvoi ne crée pas de doublon). */
  @Post()
  create(
    @CurrentHousehold() ctx: HouseholdContext,
    @Body(new ZodPipe(ExpenseInput)) body: ExpenseInput,
  ): Promise<ExpenseDto> {
    return this.expenses.create(ctx, body);
  }

  /** Enregistrer un remboursement d'un membre à un autre. */
  @Post('settle')
  settle(
    @CurrentHousehold() ctx: HouseholdContext,
    @Body(new ZodPipe(SettleInput)) body: SettleInput,
  ): Promise<ExpenseDto> {
    return this.expenses.settle(ctx, body);
  }

  /** Proportions de partage des dépenses communes (1 et 1 = moitié-moitié). */
  @Put('weights')
  @HttpCode(204)
  weights(
    @CurrentHousehold() ctx: HouseholdContext,
    @Body(new ZodPipe(ExpenseWeightsInput)) body: ExpenseWeightsInput,
  ): Promise<void> {
    return this.expenses.setWeights(ctx, body);
  }

  /** Modifier une dépense (les parts sont recalculées si le montant ou le partage change). */
  @Patch(':expenseId')
  update(
    @CurrentHousehold() ctx: HouseholdContext,
    @Param('expenseId') id: string,
    @Body(new ZodPipe(UpdateExpenseInput)) body: UpdateExpenseInput,
  ): Promise<ExpenseDto> {
    return this.expenses.update(ctx, assertUuid(id), body);
  }

  /** Supprimer une dépense ou un remboursement. */
  @Delete(':expenseId')
  @HttpCode(204)
  remove(@CurrentHousehold() ctx: HouseholdContext, @Param('expenseId') id: string): Promise<void> {
    return this.expenses.remove(ctx, assertUuid(id));
  }
}
