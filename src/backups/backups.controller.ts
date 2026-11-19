import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../iam/current-user.decorator';
import type { CurrentUserPayload } from '../iam/current-user.decorator';
import { JwtAuthGuard } from '../iam/jwt-auth.guard';
import { Roles } from '../iam/roles.decorator';
import { RolesGuard } from '../iam/roles.guard';
import { BackupConfigurationDto } from './backup-configuration.dto';
import { BackupConfigurationService } from './backup-configuration.service';
import { BackupsService } from './backups.service';
import { RestoreBackupDto } from './restore-backup.dto';

@Controller('platform/backups')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('superadmin')
export class BackupsController {
  constructor(
    private readonly configuration: BackupConfigurationService,
    private readonly backups: BackupsService,
  ) {}

  @Get('connection')
  connection() {
    return this.configuration.connection();
  }

  @Put('configuration')
  save(
    @Body() dto: BackupConfigurationDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.configuration.save(dto, user.userId);
  }

  @Get()
  list() {
    return this.backups.list();
  }

  @Post('runs')
  runNow(@CurrentUser() user: CurrentUserPayload) {
    return this.backups.runNow(user.userId);
  }

  @Post(':artifactId/restore')
  restore(
    @Param('artifactId', ParseUUIDPipe) artifactId: string,
    @Body() dto: RestoreBackupDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.backups.restore(artifactId, dto.confirmation, user.userId);
  }
}
