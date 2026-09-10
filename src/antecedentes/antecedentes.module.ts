import { Module } from '@nestjs/common';
import { PatientsModule } from '../patients/patients.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { AntecedentesController } from './antecedentes.controller';
import { AntecedentesService } from './antecedentes.service';

@Module({
  imports: [TenancyModule, PatientsModule],
  controllers: [AntecedentesController],
  providers: [AntecedentesService],
  exports: [AntecedentesService],
})
export class AntecedentesModule {}
