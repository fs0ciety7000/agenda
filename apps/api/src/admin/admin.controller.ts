import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import {
  AdminCreateUserInput,
  type AdminReportDto,
  AdminReportsQuery,
  AdminUpdateReportInput,
  type AdminMonitoringDto,
  type AdminHouseholdDto,
  type AdminOverviewDto,
  type AdminTestResultDto,
  type AdminUserDto,
  type BackupRunDto,
} from '@agenda/contracts';
import { AuthUser, CurrentUser } from '../common/request-context';
import { assertUuid } from '../common/uuid';
import { ZodPipe } from '../common/zod.pipe';
import { AdminGuard } from './admin.guard';
import { MonitoringService } from '../monitoring/monitoring.service';
import { AdminService } from './admin.service';
import { ReportsService } from '../reports/reports.service';
import { sendScreenshot } from '../reports/reports.controller';

@ApiTags('admin')
@UseGuards(AdminGuard)
@Controller({ path: 'admin', version: '1' })
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly monitoring: MonitoringService,
    private readonly reports: ReportsService,
  ) {}

  /** Administration : signalements (par défaut, ceux à traiter). */
  @Get('reports')
  reportList(
    @Query(new ZodPipe(AdminReportsQuery)) query: AdminReportsQuery,
  ): Promise<AdminReportDto[]> {
    return this.reports.adminList(query);
  }

  /** Administration : changer l'état d'un signalement ou y répondre. */
  @Patch('reports/:id')
  updateReport(
    @Param('id') id: string,
    @Body(new ZodPipe(AdminUpdateReportInput)) body: AdminUpdateReportInput,
  ): Promise<AdminReportDto> {
    return this.reports.adminUpdate(assertUuid(id), body);
  }

  /** Administration : capture d'écran d'un signalement. */
  @Get('reports/:id/screenshot')
  async reportScreenshot(@Param('id') id: string, @Res() res: Response): Promise<void> {
    sendScreenshot(res, await this.reports.screenshot(assertUuid(id), { userId: '', admin: true }));
  }

  /** Administration : supprimer un signalement. */
  @Delete('reports/:id')
  @HttpCode(204)
  removeReport(@Param('id') id: string): Promise<void> {
    return this.reports.adminRemove(assertUuid(id));
  }

  /** Onglet « Surveillance » : requêtes, erreurs, temps de réponse, sondes, incidents. */
  @Get('monitoring')
  monitoringData(): Promise<AdminMonitoringDto> {
    return this.monitoring.adminMonitoring();
  }

  /** Administration : vue d'ensemble. */
  @Get('overview')
  overview(): Promise<AdminOverviewDto> {
    return this.admin.overview();
  }

  /** Administration : comptes. */
  @Get('users')
  users(): Promise<AdminUserDto[]> {
    return this.admin.users();
  }

  /** Administration : créer un compte. */
  @Post('users')
  createUser(
    @CurrentUser() me: AuthUser,
    @Body(new ZodPipe(AdminCreateUserInput)) body: AdminCreateUserInput,
  ): Promise<AdminUserDto> {
    return this.admin.createUser(me.userId, body);
  }

  /** Administration : désactiver un compte. */
  @Post('users/:id/disable')
  @HttpCode(204)
  disable(@CurrentUser() me: AuthUser, @Param('id') id: string): Promise<void> {
    return this.admin.setDisabled(me.userId, assertUuid(id), true);
  }

  /** Administration : réactiver un compte. */
  @Post('users/:id/enable')
  @HttpCode(204)
  enable(@CurrentUser() me: AuthUser, @Param('id') id: string): Promise<void> {
    return this.admin.setDisabled(me.userId, assertUuid(id), false);
  }

  /** Administration : déconnecter un compte partout. */
  @Post('users/:id/logout-all')
  @HttpCode(204)
  logoutAll(@CurrentUser() me: AuthUser, @Param('id') id: string): Promise<void> {
    return this.admin.logoutAll(me.userId, assertUuid(id));
  }

  /** Administration : lien de réinitialisation du mot de passe. */
  @Post('users/:id/password-link')
  @HttpCode(204)
  passwordLink(@CurrentUser() me: AuthUser, @Param('id') id: string): Promise<void> {
    return this.admin.sendPasswordReset(me.userId, assertUuid(id));
  }

  /** Administration : supprimer un compte. */
  @Delete('users/:id')
  @HttpCode(204)
  deleteUser(@CurrentUser() me: AuthUser, @Param('id') id: string): Promise<void> {
    return this.admin.deleteUser(me.userId, assertUuid(id));
  }

  /** Administration : foyers. */
  @Get('households')
  households(): Promise<AdminHouseholdDto[]> {
    return this.admin.households();
  }

  /** Administration : sauvegardes récentes. */
  @Get('backups')
  backups(): Promise<BackupRunDto[]> {
    return this.admin.backups();
  }

  /** Administration : lancer une sauvegarde. */
  @Post('backups')
  requestBackup(@CurrentUser() me: AuthUser): Promise<BackupRunDto> {
    return this.admin.requestBackup(me.userId);
  }

  /** Administration : envoyer un e-mail de test. */
  @Post('test-email')
  @HttpCode(200)
  testEmail(@CurrentUser() me: AuthUser): Promise<AdminTestResultDto> {
    return this.admin.testEmail(me.userId);
  }

  /** Administration : envoyer une notification de test. */
  @Post('test-push')
  @HttpCode(200)
  testPush(@CurrentUser() me: AuthUser): Promise<AdminTestResultDto> {
    return this.admin.testPush(me.userId);
  }
}
