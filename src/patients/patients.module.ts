import { Module } from '@nestjs/common';
import { InsuranceModule } from '../insurance/insurance.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { PatientsController } from './patients.controller';
import { PatientsService } from './patients.service';

@Module({
  // InsuranceModule (not AntecedentesModule — that one already imports
  // PatientsModule for PatientsService, and a module can't import back
  // the thing that imports it) — the import wizard's aseguradora
  // get-or-create needs InsuranceService; the antecedente_types it needs
  // for mapping are fetched directly via TenancyContext in the
  // controller instead, see PatientsController.
  imports: [TenancyModule, InsuranceModule],
  controllers: [PatientsController],
  providers: [PatientsService],
  exports: [PatientsService],
})
export class PatientsModule {}
