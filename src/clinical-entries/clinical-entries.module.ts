import { Module } from '@nestjs/common';
import { PatientsModule } from '../patients/patients.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { ClinicalEntriesController } from './clinical-entries.controller';
import { ClinicalEntriesService } from './clinical-entries.service';

@Module({
  imports: [TenancyModule, PatientsModule],
  controllers: [ClinicalEntriesController],
  providers: [ClinicalEntriesService],
})
export class ClinicalEntriesModule {}
