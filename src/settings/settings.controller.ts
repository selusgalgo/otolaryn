import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../iam/current-user.decorator';
import type { CurrentUserPayload } from '../iam/current-user.decorator';
import { JwtAuthGuard } from '../iam/jwt-auth.guard';
import { Roles } from '../iam/roles.decorator';
import { RolesGuard } from '../iam/roles.guard';
import { UpdateScheduleDto } from './dto/update-schedule.dto';
import { SettingsService } from './settings.service';

// admin-only, own clinic — superadmin manages any clinic's schedule from
// PlatformController instead (it has no tenantId of its own to scope by).
@Controller('settings')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get('schedule')
  getSchedule(@CurrentUser() user: CurrentUserPayload) {
    // tenantId is guaranteed non-null here: users_tenant_superadmin_check
    // requires every non-superadmin row to have one, and @Roles('admin')
    // already excludes superadmin.
    return this.settings.getSchedule(user.tenantId as string);
  }

  @Patch('schedule')
  updateSchedule(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UpdateScheduleDto,
  ) {
    return this.settings.updateSchedule(user.tenantId as string, dto);
  }
}
