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
  Put,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { JwtAuthGuard } from '../iam/jwt-auth.guard';
import { Roles } from '../iam/roles.decorator';
import { RolesGuard } from '../iam/roles.guard';
import { TenantContextInterceptor } from '../tenancy/tenant-context.interceptor';
import { AntecedentesService } from './antecedentes.service';
import { CreateAntecedenteTypeDto } from './dto/create-antecedente-type.dto';
import { UpdateAntecedenteTypeDto } from './dto/update-antecedente-type.dto';
import { UpdatePatientAntecedentesDto } from './dto/update-patient-antecedentes.dto';

// Same clinical-data boundary as ClinicalEntriesController: recepcion is
// excluded entirely at the class level, not just from the write routes.
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TenantContextInterceptor)
@Roles('admin', 'profesional')
export class AntecedentesController {
  constructor(private readonly antecedentes: AntecedentesService) {}

  @Get('antecedente-types')
  findAllTypes() {
    return this.antecedentes.findAllTypes();
  }

  @Post('antecedente-types')
  @Roles('admin')
  createType(@Body() dto: CreateAntecedenteTypeDto) {
    return this.antecedentes.createType(dto);
  }

  @Patch('antecedente-types/:id')
  @Roles('admin')
  updateType(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAntecedenteTypeDto,
  ) {
    return this.antecedentes.updateType(id, dto);
  }

  @Delete('antecedente-types/:id')
  @Roles('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeType(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.antecedentes.removeType(id);
  }

  @Get('patients/:patientId/antecedentes')
  findForPatient(@Param('patientId', ParseUUIDPipe) patientId: string) {
    return this.antecedentes.findForPatient(patientId);
  }

  @Put('patients/:patientId/antecedentes')
  replaceForPatient(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() dto: UpdatePatientAntecedentesDto,
  ) {
    return this.antecedentes.replaceForPatient(patientId, dto);
  }
}
