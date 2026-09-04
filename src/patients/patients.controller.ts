import {
  BadRequestException,
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
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../iam/current-user.decorator';
import type { CurrentUserPayload } from '../iam/current-user.decorator';
import { JwtAuthGuard } from '../iam/jwt-auth.guard';
import { Roles } from '../iam/roles.decorator';
import { RolesGuard } from '../iam/roles.guard';
import { TenantContextInterceptor } from '../tenancy/tenant-context.interceptor';
import { CreatePatientDto } from './dto/create-patient.dto';
import { ExportPatientsQueryDto } from './dto/export-patients-query.dto';
import { ListPatientsQueryDto } from './dto/list-patients-query.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { buildPatientsExport, parsePatientsCsv } from './patients-csv.util';
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

  // Must come before @Get(':id') — Express matches routes in registration
  // order, so "export" would otherwise be captured as :id (and rejected by
  // ParseUUIDPipe) instead of ever reaching this handler.
  @Get('export')
  async export(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: ExportPatientsQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const patients = await this.patients.findAllForExport(user, query.search);
    const { buffer, contentType, filename } = buildPatientsExport(
      patients,
      query.format,
    );
    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    return new StreamableFile(buffer);
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

  @Post('import')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  import(@UploadedFile() file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No se ha recibido ningún fichero');
    }
    const { rows, missingColumns } = parsePatientsCsv(file.buffer);
    if (missingColumns.length > 0) {
      throw new BadRequestException(
        `Faltan columnas obligatorias en el CSV: ${missingColumns.join(', ')}`,
      );
    }
    return this.patients.bulkImport(rows);
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
