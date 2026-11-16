import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AntecedentesModule } from '../antecedentes/antecedentes.module';
import { ClinicalEntriesModule } from '../clinical-entries/clinical-entries.module';
import { Tenant } from '../iam/entities/tenant.entity';
import { InsuranceModule } from '../insurance/insurance.module';
import { PatientsModule } from '../patients/patients.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { SigningCertificate } from './entities/signing-certificate.entity';
import { PdfController } from './pdf.controller';
import { PdfService } from './pdf.service';
import { PdfSignerService } from './pdf-signer.service';

@Module({
  imports: [
    TenancyModule,
    PatientsModule,
    AntecedentesModule,
    ClinicalEntriesModule,
    InsuranceModule,
    TypeOrmModule.forFeature([Tenant, SigningCertificate]),
  ],
  controllers: [PdfController],
  providers: [PdfService, PdfSignerService],
  // SepaModule renders its mandate through the same configured pdfmake, and
  // seals it with the owner's certificate.
  exports: [PdfService, PdfSignerService],
})
export class PdfModule {}
