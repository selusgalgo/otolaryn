import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClinicHour } from '../iam/entities/clinic-hour.entity';
import { Tenant } from '../iam/entities/tenant.entity';
import { User } from '../iam/entities/user.entity';
import { PatientsModule } from '../patients/patients.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { PlatformController } from './platform.controller';
import { PlatformService } from './platform.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Tenant, User, ClinicHour]),
    // PatientsService, reused as-is for GET /platform/tenants/:id/patients
    // (read-only) — see the route's RouteTenantContextInterceptor for how
    // it gets pointed at the chosen clinic instead of the caller's own.
    PatientsModule,
    TenancyModule,
  ],
  controllers: [PlatformController],
  providers: [PlatformService],
})
export class PlatformModule {}
