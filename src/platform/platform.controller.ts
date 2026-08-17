import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { CurrentUser } from '../iam/current-user.decorator';
import type { CurrentUserPayload } from '../iam/current-user.decorator';
import { JwtAuthGuard } from '../iam/jwt-auth.guard';
import { Roles } from '../iam/roles.decorator';
import { RolesGuard } from '../iam/roles.guard';
import { ListPatientsQueryDto } from '../patients/dto/list-patients-query.dto';
import { PatientsService } from '../patients/patients.service';
import { UpdateScheduleDto } from '../settings/dto/update-schedule.dto';
import { RouteTenantContextInterceptor } from '../tenancy/route-tenant-context.interceptor';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { ResetPasswordDto } from '../users/dto/reset-password.dto';
import { UpdateUserDto } from '../users/dto/update-user.dto';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { PlatformService } from './platform.service';

// No TenantContextInterceptor here, deliberately — a superadmin's JWT
// carries no tenant_id (see User entity comment), and this controller's
// whole purpose is to operate across every tenant, not inside one.
@Controller('platform/tenants')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('superadmin')
export class PlatformController {
  constructor(
    private readonly platform: PlatformService,
    private readonly patients: PatientsService,
  ) {}

  @Get()
  findAll() {
    return this.platform.listTenants();
  }

  @Post()
  create(@Body() dto: CreateTenantDto) {
    return this.platform.createTenant(dto);
  }

  // Backs the clinic overview page's header (name + creation date).
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.platform.getTenant(id);
  }

  // Unlike SettingsController (admin, own clinic only), :id here can be
  // any clinic — superadmin has no tenant of its own to default to.
  @Get(':id/schedule')
  getSchedule(@Param('id', ParseUUIDPipe) id: string) {
    return this.platform.getSchedule(id);
  }

  @Patch(':id/schedule')
  updateSchedule(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateScheduleDto,
  ) {
    return this.platform.updateSchedule(id, dto);
  }

  // Read-only, view-only on the frontend — reuses PatientsService.findAll()
  // completely unmodified. RouteTenantContextInterceptor opens the same
  // RLS-scoped transaction TenantContextInterceptor would, just pointed at
  // :id (the clinic superadmin is browsing) instead of the caller's own
  // tenant. Passing the superadmin's own CurrentUserPayload through is
  // harmless: findAll() only special-cases role === 'profesional', which
  // superadmin never is.
  @Get(':id/patients')
  @UseInterceptors(RouteTenantContextInterceptor)
  findPatients(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: ListPatientsQueryDto,
  ) {
    return this.patients.findAll(
      user,
      query.page,
      query.pageSize,
      query.search,
    );
  }

  @Get(':id/users')
  listUsers(@Param('id', ParseUUIDPipe) id: string) {
    return this.platform.listUsers(id);
  }

  @Post(':id/users')
  createUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateUserDto,
  ) {
    return this.platform.createUser(id, dto);
  }

  @Patch(':id/users/:userId')
  updateUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.platform.updateUser(id, userId, dto);
  }

  @Patch(':id/users/:userId/password')
  resetUserPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: ResetPasswordDto,
  ) {
    return this.platform.resetPassword(id, userId, dto);
  }
}
