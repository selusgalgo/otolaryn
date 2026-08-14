import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClinicHour } from '../iam/entities/clinic-hour.entity';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

@Module({
  imports: [TypeOrmModule.forFeature([ClinicHour])],
  controllers: [SettingsController],
  providers: [SettingsService],
})
export class SettingsModule {}
