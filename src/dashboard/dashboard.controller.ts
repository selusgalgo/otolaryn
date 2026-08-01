import {
  Controller,
  Get,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { CurrentUser } from '../iam/current-user.decorator';
import type { CurrentUserPayload } from '../iam/current-user.decorator';
import { JwtAuthGuard } from '../iam/jwt-auth.guard';
import { TenantContextInterceptor } from '../tenancy/tenant-context.interceptor';
import { DashboardService } from './dashboard.service';
import { TodayDashboardQueryDto } from './dto/today-dashboard-query.dto';

// Read-only on purpose: this is the "Escritorio" pilot's backend — Hoy only.
// Semana/Mes are out of scope until the Hoy view is validated in real use.
@Controller('dashboard')
@UseGuards(JwtAuthGuard)
@UseInterceptors(TenantContextInterceptor)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('today')
  getToday(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: TodayDashboardQueryDto,
  ) {
    return this.dashboard.getToday(user.userId, query.date);
  }
}
