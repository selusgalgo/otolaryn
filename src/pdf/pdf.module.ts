import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AntecedentesModule } from '../antecedentes/antecedentes.module';
import { ClinicalEntriesModule } from '../clinical-entries/clinical-entries.module';
import { Tenant } from '../iam/entities/tenant.entity';
import { InsuranceModule } from '../insurance/insurance.module';
import { PatientsModule } from '../patients/patients.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { PdfController } from './pdf.controller';
import { PdfService } from './pdf.service';

@Module({
  imports: [
    TenancyModule,
    PatientsModule,
    AntecedentesModule,
    ClinicalEntriesModule,
    InsuranceModule,
    TypeOrmModule.forFeature([Tenant]),
  ],
  controllers: [PdfController],
  providers: [PdfService],
})
export class PdfModule {}
