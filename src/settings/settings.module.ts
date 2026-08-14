import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from '../iam/entities/tenant.entity';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

@Module({
  imports: [TypeOrmModule.forFeature([Tenant])],
  controllers: [SettingsController],
  providers: [SettingsService],
})
export class SettingsModule {}
