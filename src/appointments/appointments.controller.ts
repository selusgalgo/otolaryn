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
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AgendaAccessGuard } from '../iam/agenda-access.guard';
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

// DELETE is a narrow admin/recepcion override (see
// AppointmentsService.softDelete) — cancelling stays the normal PATCH
// { status: 'cancelled' } for everyone else. AgendaAccessGuard after
// RolesGuard — a profesional an admin has turned Agenda access off for
// loses this whole module, see that guard's comment.
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard, AgendaAccessGuard)
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

  @Delete('appointments/:id')
  @Roles('admin', 'recepcion')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.appointments.softDelete(id);
  }
}
