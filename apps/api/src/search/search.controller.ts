import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SearchQuery, type SearchResultsDto } from '@agenda/contracts';
import { CurrentHousehold, HouseholdContext } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { HouseholdMemberGuard } from '../households/household-member.guard';
import { SearchService } from './search.service';

@ApiTags('search')
@UseGuards(HouseholdMemberGuard)
@Controller({ path: 'households/:householdId/search', version: '1' })
export class SearchController {
  constructor(private readonly search: SearchService) {}

  /** Recherche globale : tâches, notes, dates, dépenses et courses du foyer. */
  @Get()
  find(
    @CurrentHousehold() ctx: HouseholdContext,
    @Query(new ZodPipe(SearchQuery)) query: SearchQuery,
  ): Promise<SearchResultsDto> {
    return this.search.search(ctx, query.q);
  }
}
