import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { CurrentUser } from '../iam/current-user.decorator';
import type { CurrentUserPayload } from '../iam/current-user.decorator';
import { JwtAuthGuard } from '../iam/jwt-auth.guard';
import { Roles } from '../iam/roles.decorator';
import { RolesGuard } from '../iam/roles.guard';
import { TenantContextInterceptor } from '../tenancy/tenant-context.interceptor';
import { ClinicalEntryDraftsService } from './clinical-entry-drafts.service';
import { CreateClinicalEntryDto } from './dto/create-clinical-entry.dto';
import { SaveClinicalEntryDraftDto } from './dto/save-clinical-entry-draft.dto';

// admin y profesional, como el resto de la historia clínica; recepción nunca ve
// borradores. Ver ClinicalEntryDraftsService para las reglas de autoría.
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TenantContextInterceptor)
@Roles('admin', 'profesional')
export class ClinicalEntryDraftsController {
  constructor(private readonly drafts: ClinicalEntryDraftsService) {}

  @Post('patients/:patientId/clinical-entry-drafts')
  create(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: SaveClinicalEntryDraftDto,
  ) {
    return this.drafts.create(patientId, user.userId, dto);
  }

  @Patch('clinical-entry-drafts/:id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: SaveClinicalEntryDraftDto,
  ) {
    return this.drafts.update(id, user.userId, dto);
  }

  @Post('clinical-entry-drafts/:id/finalize')
  @HttpCode(HttpStatus.OK)
  finalize(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateClinicalEntryDto,
  ) {
    return this.drafts.finalize(id, user.userId, dto);
  }

  @Delete('clinical-entry-drafts/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async discard(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<void> {
    await this.drafts.discard(id, user);
  }
}
