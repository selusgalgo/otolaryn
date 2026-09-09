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
import { BulkDeletePatientsDto } from './dto/bulk-delete-patients.dto';
import { CreatePatientDto } from './dto/create-patient.dto';
import { ExportPatientsQueryDto } from './dto/export-patients-query.dto';
import { ListPatientsQueryDto } from './dto/list-patients-query.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import type { FieldMapping } from './patients-csv.util';
import {
  buildPatientsExport,
  isSupportedImportFile,
  parsePatientsFile,
  previewPatientsFile,
} from './patients-csv.util';
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

  // Paso 1 del asistente de importación: no crea nada — solo lee las
  // cabeceras reales del fichero, unas filas de muestra y un mapeo
  // sugerido, para que la persona confirme (o corrija) a qué campo
  // nuestro corresponde cada columna antes de importar de verdad. Un
  // fichero de otro sistema (p. ej. NUMHISTORIA del programa legado) no
  // encaja con ninguna sugerencia, que es justo el caso que este paso
  // existe para cubrir.
  @Post('import/preview')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  preview(@UploadedFile() file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No se ha recibido ningún fichero');
    }
    if (!isSupportedImportFile(file.originalname)) {
      throw new BadRequestException(
        'Formato no admitido — sube un fichero .csv, .xls o .xlsx',
      );
    }
    return previewPatientsFile(file.buffer, file.originalname);
  }

  @Post('import')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  import(
    @UploadedFile() file?: Express.Multer.File,
    @Body('mapping') mappingJson?: string,
  ) {
    if (!file) {
      throw new BadRequestException('No se ha recibido ningún fichero');
    }
    if (!isSupportedImportFile(file.originalname)) {
      throw new BadRequestException(
        'Formato no admitido — sube un fichero .csv, .xls o .xlsx',
      );
    }

    // Sin mapeo explícito, parsePatientsFile recae en la detección
    // automática de siempre — mantiene la llamada retrocompatible para
    // quien no pase por el asistente (tests existentes, una futura
    // integración sin UI).
    let mapping: FieldMapping | undefined;
    if (mappingJson) {
      try {
        mapping = JSON.parse(mappingJson) as FieldMapping;
      } catch {
        throw new BadRequestException(
          'El mapeo de columnas no es un JSON válido',
        );
      }
    }

    const { rows, missingColumns } = parsePatientsFile(
      file.buffer,
      file.originalname,
      mapping,
    );
    if (missingColumns.length > 0) {
      throw new BadRequestException(
        `Faltan columnas obligatorias en el fichero: ${missingColumns.join(', ')}`,
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

  // Bulk version of the same "dar de baja" below (a POST, not DELETE — a
  // DELETE carrying a body is poorly supported by proxies/clients, and
  // this is a list-selection action, not addressing one resource by URL).
  // Same role restriction, same per-id visibility check, reused as-is —
  // see PatientsService.bulkSoftDelete.
  @Post('bulk-delete')
  @Roles('admin', 'profesional')
  @HttpCode(HttpStatus.OK)
  bulkRemove(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: BulkDeletePatientsDto,
  ) {
    return this.patients.bulkSoftDelete(dto.ids, user);
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
