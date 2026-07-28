import { Module } from '@nestjs/common';
import { TenancyModule } from '../tenancy/tenancy.module';
import { PatientsController } from './patients.controller';
import { PatientsService } from './patients.service';

@Module({
  imports: [TenancyModule],
  controllers: [PatientsController],
  providers: [PatientsService],
})
export class PatientsModule {}
