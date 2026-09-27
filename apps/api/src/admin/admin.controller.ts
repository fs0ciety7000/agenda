import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  AdminCreateUserInput,
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

@ApiTags('admin')
@UseGuards(AdminGuard)
@Controller({ path: 'admin', version: '1' })
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly monitoring: MonitoringService,
  ) {}

  /** Onglet « Surveillance » : requêtes, erreurs, temps de réponse, sondes, incidents. */
  @Get('monitoring')
  monitoringData(): Promise<AdminMonitoringDto> {
    return this.monitoring.adminMonitoring();
  }

  @Get('overview')
  overview(): Promise<AdminOverviewDto> {
    return this.admin.overview();
  }

  @Get('users')
  users(): Promise<AdminUserDto[]> {
    return this.admin.users();
  }

  @Post('users')
  createUser(
    @CurrentUser() me: AuthUser,
    @Body(new ZodPipe(AdminCreateUserInput)) body: AdminCreateUserInput,
  ): Promise<AdminUserDto> {
    return this.admin.createUser(me.userId, body);
  }

  @Post('users/:id/disable')
  @HttpCode(204)
  disable(@CurrentUser() me: AuthUser, @Param('id') id: string): Promise<void> {
    return this.admin.setDisabled(me.userId, assertUuid(id), true);
  }

  @Post('users/:id/enable')
  @HttpCode(204)
  enable(@CurrentUser() me: AuthUser, @Param('id') id: string): Promise<void> {
    return this.admin.setDisabled(me.userId, assertUuid(id), false);
  }

  @Post('users/:id/logout-all')
  @HttpCode(204)
  logoutAll(@CurrentUser() me: AuthUser, @Param('id') id: string): Promise<void> {
    return this.admin.logoutAll(me.userId, assertUuid(id));
  }

  @Post('users/:id/password-link')
  @HttpCode(204)
  passwordLink(@CurrentUser() me: AuthUser, @Param('id') id: string): Promise<void> {
    return this.admin.sendPasswordReset(me.userId, assertUuid(id));
  }

  @Delete('users/:id')
  @HttpCode(204)
  deleteUser(@CurrentUser() me: AuthUser, @Param('id') id: string): Promise<void> {
    return this.admin.deleteUser(me.userId, assertUuid(id));
  }

  @Get('households')
  households(): Promise<AdminHouseholdDto[]> {
    return this.admin.households();
  }

  @Get('backups')
  backups(): Promise<BackupRunDto[]> {
    return this.admin.backups();
  }

  @Post('backups')
  requestBackup(@CurrentUser() me: AuthUser): Promise<BackupRunDto> {
    return this.admin.requestBackup(me.userId);
  }

  @Post('test-email')
  @HttpCode(200)
  testEmail(@CurrentUser() me: AuthUser): Promise<AdminTestResultDto> {
    return this.admin.testEmail(me.userId);
  }

  @Post('test-push')
  @HttpCode(200)
  testPush(@CurrentUser() me: AuthUser): Promise<AdminTestResultDto> {
    return this.admin.testPush(me.userId);
  }
}
