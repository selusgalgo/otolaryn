import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { CurrentUser } from '../iam/current-user.decorator';
import type { CurrentUserPayload } from '../iam/current-user.decorator';
import { JwtAuthGuard } from '../iam/jwt-auth.guard';
import { Roles } from '../iam/roles.decorator';
import { RolesGuard } from '../iam/roles.guard';
import { TenantContextInterceptor } from '../tenancy/tenant-context.interceptor';
import { AppointmentsService } from './appointments.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { ListAppointmentsQueryDto } from './dto/list-appointments-query.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';

// No DELETE here on purpose — cancelling is PATCH { status: 'cancelled' },
// not removing the row. The appointment stays in the agenda's history.
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TenantContextInterceptor)
@Roles('admin', 'profesional', 'recepcion')
export class AppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  @Post('patients/:patientId/appointments')
  create(
    @CurrentUser() user: CurrentUserPayload,
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() dto: CreateAppointmentDto,
  ) {
    return this.appointments.create(patientId, dto, user);
  }

  @Get('appointments')
  findAll(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: ListAppointmentsQueryDto,
  ) {
    return this.appointments.findAll(query, user);
  }

  @Get('appointments/:id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.appointments.findOne(id);
  }

  @Patch('appointments/:id')
  update(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAppointmentDto,
  ) {
    return this.appointments.update(id, dto, user);
  }
}
