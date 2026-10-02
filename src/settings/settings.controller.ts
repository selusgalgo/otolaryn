import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../iam/current-user.decorator';
import type { CurrentUserPayload } from '../iam/current-user.decorator';
import { JwtAuthGuard } from '../iam/jwt-auth.guard';
import { Roles } from '../iam/roles.decorator';
import { RolesGuard } from '../iam/roles.guard';
import { UpdateAppointmentDefaultsDto } from './dto/update-appointment-defaults.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';
import { SettingsService } from './settings.service';

// Own clinic only — superadmin manages any clinic's schedule/appointment
// defaults from PlatformController instead (it has no tenantId of its own
// to scope by).
@Controller('settings')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  // Read access is for every tenant role, not just admin: the Agenda page's
  // occupancy calendar needs the clinic's hours for profesional/recepcion
  // too, to know what counts as a "full" day. Writing stays admin-only,
  // below.
  @Get('schedule')
  @Roles('admin', 'profesional', 'recepcion')
  getSchedule(@CurrentUser() user: CurrentUserPayload) {
    // tenantId is guaranteed non-null here: users_tenant_superadmin_check
    // requires every non-superadmin row to have one, and @Roles(...)
    // already excludes superadmin.
    return this.settings.getSchedule(user.tenantId as string);
  }

  @Patch('schedule')
  @Roles('admin')
  updateSchedule(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UpdateScheduleDto,
  ) {
    return this.settings.updateSchedule(user.tenantId as string, dto);
  }

  // Read access for every role that can create an appointment — the "Nueva
  // cita" form pre-fills Duración from this, the same way it already reads
  // /settings/schedule for its free-slot suggestions. Writing stays
  // admin-only, below.
  @Get('appointment-defaults')
  @Roles('admin', 'profesional', 'recepcion')
  getAppointmentDefaults(@CurrentUser() user: CurrentUserPayload) {
    return this.settings.getAppointmentDefaults(user.tenantId as string);
  }

  @Patch('appointment-defaults')
  @Roles('admin')
  updateAppointmentDefaults(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UpdateAppointmentDefaultsDto,
  ) {
    return this.settings.updateAppointmentDefaults(
      user.tenantId as string,
      dto,
    );
  }
}
