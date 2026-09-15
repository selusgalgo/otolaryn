import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { JwtAuthGuard } from '../iam/jwt-auth.guard';
import { Roles } from '../iam/roles.decorator';
import { RolesGuard } from '../iam/roles.guard';
import { TenantContextInterceptor } from '../tenancy/tenant-context.interceptor';
import { CreateInsuranceEntityDto } from './dto/create-insurance-entity.dto';
import { UpdateInsuranceEntityDto } from './dto/update-insurance-entity.dto';
import { InsuranceService } from './insurance.service';

// Read is open to recepcion too — same reason as GET /users?role=...: it
// may need the catalog to help fill in a patient's insurer. Writing (the
// Configuración panel) stays admin-only.
@Controller('insurance-entities')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TenantContextInterceptor)
@Roles('admin', 'profesional', 'recepcion')
export class InsuranceController {
  constructor(private readonly insurance: InsuranceService) {}

  @Get()
  findAll() {
    return this.insurance.findAll();
  }

  @Post()
  @Roles('admin')
  create(@Body() dto: CreateInsuranceEntityDto) {
    return this.insurance.create(dto);
  }

  @Patch(':id')
  @Roles('admin')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateInsuranceEntityDto,
  ) {
    return this.insurance.update(id, dto);
  }

  @Delete(':id')
  @Roles('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.insurance.remove(id);
  }
}
