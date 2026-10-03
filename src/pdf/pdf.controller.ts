import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Res,
  StreamableFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Response } from 'express';
import { Repository } from 'typeorm';
import { AntecedentesService } from '../antecedentes/antecedentes.service';
import { ClinicalEntriesService } from '../clinical-entries/clinical-entries.service';
import { Tenant } from '../iam/entities/tenant.entity';
import { JwtAuthGuard } from '../iam/jwt-auth.guard';
import { Roles } from '../iam/roles.decorator';
import { RolesGuard } from '../iam/roles.guard';
import { InsuranceService } from '../insurance/insurance.service';
import { PatientsService } from '../patients/patients.service';
import { TenancyContext } from '../tenancy/tenancy-context';
import { TenantContextInterceptor } from '../tenancy/tenant-context.interceptor';
import type { ClinicProfileData } from './clinic-header.util';
import { buildPatientRecordPdf } from './patient-record-pdf.util';
import { PdfService } from './pdf.service';
import { buildTreatmentPdf } from './treatment-pdf.util';

// Same clinical-data boundary as ClinicalEntriesController/
// AntecedentesController: recepcion gets neither export — a PDF of the
// ficha completa embeds Historia clínica and Consultas, and the treatment
// PDF is a single consulta's own content, both of which that role has no
// access to anywhere else in the app either.
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TenantContextInterceptor)
@Roles('admin', 'profesional')
export class PdfController {
  constructor(
    private readonly pdf: PdfService,
    private readonly patients: PatientsService,
    private readonly antecedentes: AntecedentesService,
    private readonly clinicalEntries: ClinicalEntriesService,
    private readonly insurance: InsuranceService,
    private readonly tenancyContext: TenancyContext,
    // iam.tenants carries no RLS (same as everywhere else it's read) — a
    // direct repo, not TenancyContext, just for the clinic name header.
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
  ) {}

  private async clinicProfile(): Promise<ClinicProfileData> {
    const tenant = await this.tenants.findOneOrFail({
      where: { id: this.tenancyContext.tenantId },
    });
    return {
      name: tenant.name,
      tagline: tenant.tagline,
      address: tenant.address,
      phone: tenant.phone,
      logo: tenant.logo,
    };
  }

  @Get('patients/:id/pdf')
  async patientRecordPdf(
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    // No "own patients" narrowing — same access as ClinicalEntriesController/
    // AntecedentesController already give admin/profesional on this
    // patient's clinical content.
    const patient = await this.patients.findOne(id);

    const [clinic, types, marked, entries, insuranceEntities] =
      await Promise.all([
        this.clinicProfile(),
        this.antecedentes.findAllTypes(),
        this.antecedentes.findForPatient(id),
        this.clinicalEntries.findAllForPatientUnpaged(id),
        this.insurance.findAll(),
      ]);

    const typeById = new Map(types.map((t) => [t.id, t]));
    const toMarkedAntecedente = (m: (typeof marked)[number]) => {
      const type = typeById.get(m.antecedenteTypeId);
      return {
        name: type?.name ?? 'Antecedente',
        detalle: m.detalle,
        category: type?.category,
      };
    };
    const resolved = marked.map(toMarkedAntecedente);

    const insuranceName =
      insuranceEntities.find((e) => e.id === patient.insuranceEntityId)?.name ??
      null;

    const buffer = await this.pdf.render(
      buildPatientRecordPdf({
        clinic,
        patient,
        insuranceName,
        personalAntecedentes: resolved.filter((a) => a.category === 'personal'),
        familiarAntecedentes: resolved.filter((a) => a.category === 'familiar'),
        entries,
      }),
    );

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="ficha-${patient.legacyId ?? patient.id}.pdf"`,
    });
    return new StreamableFile(buffer);
  }

  @Get('clinical-entries/:id/treatment-pdf')
  async treatmentPdf(
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const entry = await this.clinicalEntries.findOne(id);
    if (!entry.treatment) {
      throw new NotFoundException(
        'Esta consulta no tiene tratamiento indicado',
      );
    }
    const patient = await this.patients.findOne(entry.patientId);

    const buffer = await this.pdf.render(buildTreatmentPdf({ patient, entry }));

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="tratamiento-${patient.legacyId ?? patient.id}.pdf"`,
    });
    return new StreamableFile(buffer);
  }
}
