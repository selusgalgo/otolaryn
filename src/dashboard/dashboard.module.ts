import { Module } from '@nestjs/common';
import { TenancyModule } from '../tenancy/tenancy.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [TenancyModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
