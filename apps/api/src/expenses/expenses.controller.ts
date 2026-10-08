import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { AppException } from '../common/app-exception';
import {
  ATTACHMENT_MAX_BYTES,
  ExpenseBudgetInput,
  type ExpenseDto,
  ExpenseExportQuery,
  ExpenseInput,
  ExpensesQuery,
  ExpenseStatsQuery,
  type ExpenseStatsDto,
  type ExpenseSummaryDto,
  ExpenseWeightsInput,
  type RecurringExpenseDto,
  RecurringExpenseInput,
  SettleInput,
  UpdateExpenseInput,
} from '@agenda/contracts';
import { CurrentHousehold, HouseholdContext } from '../common/request-context';
import { assertUuid } from '../common/uuid';
import { ZodPipe } from '../common/zod.pipe';
import { HouseholdMemberGuard } from '../households/household-member.guard';
import { ExpensesService } from './expenses.service';

interface UploadedMulterFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

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

  /** Évolution sur plusieurs mois : dépenses communes, les miennes, par catégorie. */
  @Get('stats')
  stats(
    @CurrentHousehold() ctx: HouseholdContext,
    @Query(new ZodPipe(ExpenseStatsQuery)) query: ExpenseStatsQuery,
  ): Promise<ExpenseStatsDto> {
    return this.expenses.stats(ctx, query.month, query.months);
  }

  /** Exporter les dépenses en tableur (CSV, dans la langue du compte), de `from` à `to` inclus. */
  @Get('export')
  async export(
    @CurrentHousehold() ctx: HouseholdContext,
    @Query(new ZodPipe(ExpenseExportQuery)) query: ExpenseExportQuery,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.expenses.exportCsv(ctx, query.from, query.to);
    res.setHeader('content-type', 'text/csv; charset=utf-8');
    res.setHeader('content-disposition', `attachment; filename="${file.filename}"`);
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('cache-control', 'private, no-store');
    res.end(file.body);
  }

  /** Budget mensuel des dépenses communes (alerte à 80 % et à 100 %) ; null pour l'enlever. */
  @Put('budget')
  @HttpCode(204)
  budget(
    @CurrentHousehold() ctx: HouseholdContext,
    @Body(new ZodPipe(ExpenseBudgetInput)) body: ExpenseBudgetInput,
  ): Promise<void> {
    return this.expenses.setBudget(ctx, body.budgetCents);
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

  /** Charges fixes en cours (une dépense créée chaque mois, le même jour). */
  @Get('recurring')
  recurring(@CurrentHousehold() ctx: HouseholdContext): Promise<RecurringExpenseDto[]> {
    return this.expenses.listRecurring(ctx);
  }

  /** Créer une charge fixe (l'échéance du mois, si passée, est créée tout de suite). */
  @Post('recurring')
  createRecurring(
    @CurrentHousehold() ctx: HouseholdContext,
    @Body(new ZodPipe(RecurringExpenseInput)) body: RecurringExpenseInput,
  ): Promise<RecurringExpenseDto> {
    return this.expenses.createRecurring(ctx, body);
  }

  /** Arrêter une charge fixe (les dépenses déjà créées restent). */
  @Delete('recurring/:recurringId')
  @HttpCode(204)
  stopRecurring(
    @CurrentHousehold() ctx: HouseholdContext,
    @Param('recurringId') id: string,
  ): Promise<void> {
    return this.expenses.stopRecurring(ctx, assertUuid(id));
  }

  /** Joindre le ticket d'une dépense (image ou PDF, multipart, champ `file`, 10 Mo au plus). */
  @Post(':expenseId/receipt')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: ATTACHMENT_MAX_BYTES + 1, files: 1 } }),
  )
  addReceipt(
    @CurrentHousehold() ctx: HouseholdContext,
    @Param('expenseId') id: string,
    @UploadedFile() file: UploadedMulterFile | undefined,
  ): Promise<ExpenseDto> {
    if (!file) {
      throw new AppException('VALIDATION_FAILED', HttpStatus.BAD_REQUEST, 'Missing file', {
        fieldErrors: { file: ['Required'] },
      });
    }
    return this.expenses.addReceipt(ctx, assertUuid(id), {
      filename: Buffer.from(file.originalname, 'latin1').toString('utf8'),
      contentType: file.mimetype,
      data: file.buffer,
    });
  }

  /** Afficher le ticket d'une dépense. */
  @Get(':expenseId/receipt')
  async receipt(
    @CurrentHousehold() ctx: HouseholdContext,
    @Param('expenseId') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.expenses.getReceipt(ctx, assertUuid(id));
    res.setHeader('content-type', file.contentType);
    res.setHeader(
      'content-disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
    );
    res.setHeader('content-length', String(file.size));
    res.setHeader('x-content-type-options', 'nosniff');
    // Ouvert dans le navigateur, le fichier ne peut rien exécuter sur l'origine de l'app.
    res.setHeader(
      'content-security-policy',
      "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
    );
    res.setHeader('cache-control', 'private, max-age=3600');
    res.end(Buffer.from(file.data));
  }

  /** Retirer le ticket d'une dépense. */
  @Delete(':expenseId/receipt')
  @HttpCode(204)
  removeReceipt(
    @CurrentHousehold() ctx: HouseholdContext,
    @Param('expenseId') id: string,
  ): Promise<void> {
    return this.expenses.removeReceipt(ctx, assertUuid(id));
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
