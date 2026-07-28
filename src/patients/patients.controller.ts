import {
  Body,
  Controller,
  Get,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { JwtAuthGuard } from '../iam/jwt-auth.guard';
import { TenantContextInterceptor } from '../tenancy/tenant-context.interceptor';
import { CreatePatientDto } from './dto/create-patient.dto';
import { PatientsService } from './patients.service';

@Controller('patients')
@UseGuards(JwtAuthGuard)
@UseInterceptors(TenantContextInterceptor)
export class PatientsController {
  constructor(private readonly patients: PatientsService) {}

  @Get()
  findAll() {
    return this.patients.findAll();
  }

  @Post()
  create(@Body() dto: CreatePatientDto) {
    return this.patients.create(dto.name);
  }
}
