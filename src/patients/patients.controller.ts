import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
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
import { TenantContextInterceptor } from '../tenancy/tenant-context.interceptor';
import { CreatePatientDto } from './dto/create-patient.dto';
import { ListPatientsQueryDto } from './dto/list-patients-query.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { PatientsService } from './patients.service';

@Controller('patients')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TenantContextInterceptor)
@Roles('admin', 'profesional', 'recepcion')
export class PatientsController {
  constructor(private readonly patients: PatientsService) {}

  @Get()
  findAll(
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

  @Get(':id')
  findOne(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.patients.findOne(id, user);
  }

  @Post()
  create(@Body() dto: CreatePatientDto) {
    return this.patients.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePatientDto,
  ) {
    return this.patients.update(id, dto);
  }

  // recepcion excluded on purpose — it can create/edit patients to book
  // appointments, but discharging one is a clinical/admin decision.
  @Delete(':id')
  @Roles('admin', 'profesional')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.patients.softDelete(id, user);
  }
}
