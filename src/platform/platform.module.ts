import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClinicHour } from '../iam/entities/clinic-hour.entity';
import { Tenant } from '../iam/entities/tenant.entity';
import { User } from '../iam/entities/user.entity';
import { PlatformController } from './platform.controller';
import { PlatformService } from './platform.service';

@Module({
  imports: [TypeOrmModule.forFeature([Tenant, User, ClinicHour])],
  controllers: [PlatformController],
  providers: [PlatformService],
})
export class PlatformModule {}
