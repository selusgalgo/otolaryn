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
import { JwtAuthGuard } from '../iam/jwt-auth.guard';
import { TenantContextInterceptor } from '../tenancy/tenant-context.interceptor';
import { AppointmentsService } from './appointments.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { ListAppointmentsQueryDto } from './dto/list-appointments-query.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';

// No DELETE here on purpose — cancelling is PATCH { status: 'cancelled' },
// not removing the row. The appointment stays in the agenda's history.
@Controller()
@UseGuards(JwtAuthGuard)
@UseInterceptors(TenantContextInterceptor)
export class AppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  @Post('patients/:patientId/appointments')
  create(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() dto: CreateAppointmentDto,
  ) {
    return this.appointments.create(patientId, dto);
  }

  @Get('appointments')
  findAll(@Query() query: ListAppointmentsQueryDto) {
    return this.appointments.findAll(query);
  }

  @Get('appointments/:id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.appointments.findOne(id);
  }

  @Patch('appointments/:id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAppointmentDto,
  ) {
    return this.appointments.update(id, dto);
  }
}
