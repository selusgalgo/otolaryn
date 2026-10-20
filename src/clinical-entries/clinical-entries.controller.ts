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
  Post,
  Query,
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
import { TenantContextInterceptor } from '../tenancy/tenant-context.interceptor';
import {
  distinctDoctorNames,
  isSupportedImportFile,
  parseClinicalEntriesFile,
  previewClinicalEntriesFile,
} from './clinical-entries-csv.util';
import type { ClinicalEntryFieldMapping } from './clinical-entries-csv.util';
import { ClinicalEntriesService } from './clinical-entries.service';
import { CreateClinicalEntryDto } from './dto/create-clinical-entry.dto';
import { ListClinicalEntriesQueryDto } from './dto/list-clinical-entries-query.dto';

// See PatientsController's own IMPORT_BATCH_SIZE — same reasoning,
// same value.
const IMPORT_BATCH_SIZE = 100;

function parseJsonBody<T>(
  json: string | undefined,
  label: string,
): T | undefined {
  if (!json) return undefined;
  try {
    return JSON.parse(json) as T;
  } catch {
    throw new BadRequestException(`${label} no es un JSON válido`);
  }
}

// No PATCH anywhere here on purpose — clinical_entries stays append-only
// for corrections: a mistake is fixed with a new entry, not an edit to
// history. DELETE is the one, narrow, admin-only exception — see
// ClinicalEntriesService.softDelete.
//
// recepcion can read (list/view a patient's consultas, print their PDFs)
// but never create, import or delete — those three stay admin/profesional
// only, same clinical-authorship boundary as before, just no longer a
// blanket "no access at all" for this role.
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TenantContextInterceptor)
@Roles('admin', 'profesional')
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
  @Roles('admin', 'profesional', 'recepcion')
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

  // Paso 1 del asistente de importación de Consultas: mismo patrón que
  // /patients/import/preview — lee columnas y unas filas de muestra sin
  // crear nada, para que la persona confirme el mapeo (incluida qué
  // columna es NUMHISTORIA/Aseguradora/Doctor) antes de importar de
  // verdad. profesional excluido de aquí en adelante (import/doctors/
  // import/import/continue) — importar en bloque es cosa de admin, no una
  // acción clínica del día a día.
  @Post('clinical-entries/import/preview')
  @Roles('admin')
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
    return previewClinicalEntriesFile(file.buffer, file.originalname);
  }

  // Paso 2: una vez confirmado el mapeo (y por tanto qué columna es
  // DOCTOR), devuelve cada nombre de médico distinto que aparece en el
  // fichero *entero* — no solo la muestra del preview — para que la
  // persona elija a qué profesional corresponde cada uno antes de
  // importar. Vacío si no se mapeó ninguna columna de doctor.
  @Post('clinical-entries/import/doctors')
  @Roles('admin')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  importDoctors(
    @UploadedFile() file?: Express.Multer.File,
    @Body('mapping') mappingJson?: string,
  ) {
    if (!file) {
      throw new BadRequestException('No se ha recibido ningún fichero');
    }
    const mapping = parseJsonBody<ClinicalEntryFieldMapping>(
      mappingJson,
      'El mapeo de columnas',
    );
    return {
      doctorNames: distinctDoctorNames(
        file.buffer,
        file.originalname,
        mapping ?? {},
      ),
    };
  }

  // Paso 3: la importación real — patientLegacyId relaciona cada fila con
  // un paciente ya importado por NUMHISTORIA (nunca por nombre), y
  // doctorMapping (nombre del fichero -> id de usuario, confirmado en el
  // paso anterior) resuelve el autor de cada consulta.
  @Post('clinical-entries/import')
  @Roles('admin')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  import(
    @UploadedFile() file?: Express.Multer.File,
    @Body('mapping') mappingJson?: string,
    @Body('doctorMapping') doctorMappingJson?: string,
  ) {
    if (!file) {
      throw new BadRequestException('No se ha recibido ningún fichero');
    }
    if (!isSupportedImportFile(file.originalname)) {
      throw new BadRequestException(
        'Formato no admitido — sube un fichero .csv, .xls o .xlsx',
      );
    }
    const mapping = parseJsonBody<ClinicalEntryFieldMapping>(
      mappingJson,
      'El mapeo de columnas',
    );
    const doctorMapping =
      parseJsonBody<Record<string, string>>(
        doctorMappingJson,
        'El mapeo de médicos',
      ) ?? {};

    const { rows, missingColumns } = parseClinicalEntriesFile(
      file.buffer,
      file.originalname,
      mapping,
    );
    if (missingColumns.length > 0) {
      throw new BadRequestException(
        `Faltan columnas obligatorias en el fichero: ${missingColumns.join(', ')}`,
      );
    }
    // Returns immediately with a jobId — see
    // PatientsController.import/PatientsController.continueImport for why
    // (same 300s-timeout problem, same fix).
    return this.clinicalEntries.startBulkImportJob(rows, doctorMapping);
  }

  @Post('clinical-entries/import/:jobId/continue')
  @Roles('admin')
  continueImport(@Param('jobId', ParseUUIDPipe) jobId: string) {
    return this.clinicalEntries.continueBulkImportJob(jobId, IMPORT_BATCH_SIZE);
  }

  @Get('clinical-entries/:id')
  @Roles('admin', 'profesional', 'recepcion')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.clinicalEntries.findOne(id);
  }

  // Admin only — ver ClinicalEntriesService.softDelete. No está pensado
  // para que un profesional "borre" una consulta propia; una corrección
  // sigue siendo una entrada nueva, esto es solo para quitar un error
  // real (paciente equivocado, duplicado de importación).
  @Delete('clinical-entries/:id')
  @Roles('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.clinicalEntries.softDelete(id);
  }
}
