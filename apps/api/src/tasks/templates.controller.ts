import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  ApplyTemplateInput,
  type OccurrenceDto,
  type TaskTemplateDto,
  TemplateInput,
} from '@agenda/contracts';
import { CurrentHousehold, HouseholdContext } from '../common/request-context';
import { assertUuid } from '../common/uuid';
import { ZodPipe } from '../common/zod.pipe';
import { HouseholdMemberGuard } from '../households/household-member.guard';
import { TemplatesService } from './templates.service';

@ApiTags('templates')
@UseGuards(HouseholdMemberGuard)
@Controller({ path: 'households/:householdId/templates', version: '1' })
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  @Get()
  list(@CurrentHousehold() ctx: HouseholdContext): Promise<TaskTemplateDto[]> {
    return this.templates.list(ctx);
  }

  @Post()
  create(
    @CurrentHousehold() ctx: HouseholdContext,
    @Body(new ZodPipe(TemplateInput)) body: TemplateInput,
  ): Promise<TaskTemplateDto> {
    return this.templates.create(ctx, body);
  }

  @Put(':templateId')
  update(
    @CurrentHousehold() ctx: HouseholdContext,
    @Param('templateId') id: string,
    @Body(new ZodPipe(TemplateInput)) body: TemplateInput,
  ): Promise<TaskTemplateDto> {
    return this.templates.update(ctx, assertUuid(id), body);
  }

  @Delete(':templateId')
  @HttpCode(204)
  remove(
    @CurrentHousehold() ctx: HouseholdContext,
    @Param('templateId') id: string,
  ): Promise<void> {
    return this.templates.remove(ctx, assertUuid(id));
  }

  @Post(':templateId/apply')
  apply(
    @CurrentHousehold() ctx: HouseholdContext,
    @Param('templateId') id: string,
    @Body(new ZodPipe(ApplyTemplateInput)) body: ApplyTemplateInput,
  ): Promise<OccurrenceDto[]> {
    return this.templates.apply(ctx, assertUuid(id), body);
  }
}
