import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../iam/current-user.decorator';
import type { CurrentUserPayload } from '../iam/current-user.decorator';
import { JwtAuthGuard } from '../iam/jwt-auth.guard';
import { Roles } from '../iam/roles.decorator';
import { RolesGuard } from '../iam/roles.guard';
import { logoFileToDataUri } from './clinic-logo.util';
import { UpdateAppointmentDefaultsDto } from './dto/update-appointment-defaults.dto';
import { UpdateDeviceLockDto } from './dto/update-device-lock.dto';
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

  // Admin-only, both read and write — unlike the sections above, device
  // lock is a security control for the clinic's own computers, not
  // something profesional/recepcion need to see or that a PDF export
  // depends on.
  @Get('device-lock')
  @Roles('admin')
  getDeviceLock(@CurrentUser() user: CurrentUserPayload) {
    return this.settings.getDeviceLock(user.tenantId as string);
  }

  @Patch('device-lock')
  @Roles('admin')
  updateDeviceLock(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UpdateDeviceLockDto,
  ) {
    return this.settings.updateDeviceLock(user.tenantId as string, dto);
  }

  // Returns the raw token — the one and only time it's ever visible, since
  // only its argon2 hash is persisted. Replaces any existing credential,
  // so every previously installed device is instantly de-authorized.
  @Post('device-lock/credential')
  @Roles('admin')
  generateDeviceCredential(@CurrentUser() user: CurrentUserPayload) {
    return this.settings.generateDeviceCredential(user.tenantId as string);
  }

  @Delete('device-lock/credential')
  @Roles('admin')
  revokeDeviceCredential(@CurrentUser() user: CurrentUserPayload) {
    return this.settings.revokeDeviceCredential(user.tenantId as string);
  }

  // Read access for every role — the clinic's name/address/phone/logo show
  // up wherever a PDF is exported (ficha de paciente, tratamiento), which
  // admin and profesional can both trigger. Writing stays admin-only, below.
  @Get('clinic-profile')
  @Roles('admin', 'profesional', 'recepcion')
  getClinicProfile(@CurrentUser() user: CurrentUserPayload) {
    return this.settings.getClinicProfile(user.tenantId as string);
  }

  // Multipart, not a plain JSON @Body() DTO, since it may carry a logo file
  // alongside the text fields — same FileInterceptor + memoryStorage shape
  // as PatientsController's import endpoints (small-file, no disk write).
  @Patch('clinic-profile')
  @Roles('admin')
  @UseInterceptors(FileInterceptor('logo', { storage: memoryStorage() }))
  async updateClinicProfile(
    @CurrentUser() user: CurrentUserPayload,
    @Body('name') name?: string,
    @Body('tagline') tagline?: string,
    @Body('address') address?: string,
    @Body('phone') phone?: string,
    @Body('removeLogo') removeLogoRaw?: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!name?.trim()) {
      throw new BadRequestException('El nombre de la clínica es obligatorio');
    }
    // A submitted <input type="file"> with nothing picked still shows up
    // here as a zero-byte file (empty filename, generic mimetype) rather
    // than undefined — size > 0 is what actually means "a file was chosen".
    const hasFile = Boolean(file && file.size > 0);
    const removeLogo = removeLogoRaw === 'true';
    if (hasFile && removeLogo) {
      throw new BadRequestException(
        'No se puede subir un logo nuevo y quitarlo a la vez',
      );
    }
    const logo = hasFile
      ? await logoFileToDataUri(file!)
      : removeLogo
        ? null
        : undefined;

    return this.settings.updateClinicProfile(user.tenantId as string, {
      name: name.trim(),
      tagline: tagline?.trim() || null,
      address: address?.trim() || null,
      phone: phone?.trim() || null,
      logo,
    });
  }
}
