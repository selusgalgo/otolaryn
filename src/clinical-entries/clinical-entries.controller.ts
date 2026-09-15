import {
  BadRequestException,
  Body,
  Controller,
  Get,
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

// No PATCH, no DELETE anywhere here on purpose — clinical_entries is
// append-only. A correction is a new entry, not an edit to history.
//
// recepcion is deliberately excluded from @Roles here — clinical history is
// off-limits to that role entirely, unlike patients/appointments.
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
  // verdad.
  @Post('clinical-entries/import/preview')
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
    return this.clinicalEntries.bulkImport(rows, doctorMapping);
  }

  @Get('clinical-entries/:id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.clinicalEntries.findOne(id);
  }
}
