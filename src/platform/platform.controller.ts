import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../iam/jwt-auth.guard';
import { Roles } from '../iam/roles.decorator';
import { RolesGuard } from '../iam/roles.guard';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { PlatformService } from './platform.service';

// No TenantContextInterceptor here, deliberately — a superadmin's JWT
// carries no tenant_id (see User entity comment), and this controller's
// whole purpose is to operate across every tenant, not inside one.
@Controller('platform/tenants')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('superadmin')
export class PlatformController {
  constructor(private readonly platform: PlatformService) {}

  @Get()
  findAll() {
    return this.platform.listTenants();
  }

  @Post()
  create(@Body() dto: CreateTenantDto) {
    return this.platform.createTenant(dto);
  }
}
