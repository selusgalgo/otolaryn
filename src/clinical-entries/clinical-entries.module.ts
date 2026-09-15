import { Module } from '@nestjs/common';
import { InsuranceModule } from '../insurance/insurance.module';
import { PatientsModule } from '../patients/patients.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { ClinicalEntriesController } from './clinical-entries.controller';
import { ClinicalEntriesService } from './clinical-entries.service';

@Module({
  // InsuranceModule for the Consultas importer's aseguradora
  // get-or-create — same reason PatientsModule imports it.
  imports: [TenancyModule, PatientsModule, InsuranceModule],
  controllers: [ClinicalEntriesController],
  providers: [ClinicalEntriesService],
})
export class ClinicalEntriesModule {}
