import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { CurrentUser } from '../iam/current-user.decorator';
import type { CurrentUserPayload } from '../iam/current-user.decorator';
import { JwtAuthGuard } from '../iam/jwt-auth.guard';
import { TenantContextInterceptor } from '../tenancy/tenant-context.interceptor';
import { ClinicalEntriesService } from './clinical-entries.service';
import { CreateClinicalEntryDto } from './dto/create-clinical-entry.dto';
import { ListClinicalEntriesQueryDto } from './dto/list-clinical-entries-query.dto';

// No PATCH, no DELETE anywhere here on purpose — clinical_entries is
// append-only. A correction is a new entry, not an edit to history.
@Controller()
@UseGuards(JwtAuthGuard)
@UseInterceptors(TenantContextInterceptor)
export class ClinicalEntriesController {
  constructor(private readonly clinicalEntries: ClinicalEntriesService) {}

  @Post('patients/:patientId/clinical-entries')
  create(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateClinicalEntryDto,
  ) {
    return this.clinicalEntries.create(patientId, user.userId, dto);
  }

  @Get('patients/:patientId/clinical-entries')
  findAllForPatient(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Query() query: ListClinicalEntriesQueryDto,
  ) {
    return this.clinicalEntries.findAllForPatient(
      patientId,
      query.page,
      query.pageSize,
    );
  }

  @Get('clinical-entries/:id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.clinicalEntries.findOne(id);
  }
}
