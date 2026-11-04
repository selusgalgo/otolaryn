import { Module } from '@nestjs/common';
import { ImportJobsModule } from '../import-jobs/import-jobs.module';
import { InsuranceModule } from '../insurance/insurance.module';
import { PatientsModule } from '../patients/patients.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { ClinicalEntriesController } from './clinical-entries.controller';
import { ClinicalEntriesService } from './clinical-entries.service';
import { ClinicalEntryDraftsController } from './clinical-entry-drafts.controller';
import { ClinicalEntryDraftsPurgeService } from './clinical-entry-drafts-purge.service';
import { ClinicalEntryDraftsService } from './clinical-entry-drafts.service';

@Module({
  // InsuranceModule for the Consultas importer's aseguradora
  // get-or-create — same reason PatientsModule imports it.
  imports: [TenancyModule, PatientsModule, InsuranceModule, ImportJobsModule],
  controllers: [ClinicalEntriesController, ClinicalEntryDraftsController],
  providers: [
    ClinicalEntriesService,
    ClinicalEntryDraftsService,
    ClinicalEntryDraftsPurgeService,
  ],
  exports: [ClinicalEntriesService, ClinicalEntryDraftsPurgeService],
})
export class ClinicalEntriesModule {}
