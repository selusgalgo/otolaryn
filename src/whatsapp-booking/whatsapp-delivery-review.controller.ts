import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { JwtAuthGuard } from '../iam/jwt-auth.guard';
import { Roles } from '../iam/roles.decorator';
import { RolesGuard } from '../iam/roles.guard';
import { TenantContextInterceptor } from '../tenancy/tenant-context.interceptor';
import { WhatsappDeliveryService } from './whatsapp-delivery.service';
import { TenancyContext } from '../tenancy/tenancy-context';

@Controller('whatsapp-booking')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TenantContextInterceptor)
@Roles('admin', 'recepcion')
export class WhatsappDeliveryReviewController {
  constructor(
    private readonly delivery: WhatsappDeliveryService,
    private readonly tenancy: TenancyContext,
  ) {}

  @Get('feature-status')
  @Roles('admin', 'recepcion', 'profesional')
  async featureStatus() {
    const [row] = await this.tenancy.manager.query<{ enabled: boolean }[]>(
      `SELECT COALESCE((SELECT platform_enabled FROM iam.whatsapp_booking_settings WHERE tenant_id = $1), false) AS enabled`,
      [this.tenancy.tenantId],
    );
    return row;
  }

  @Get('delivery-review')
  pendingReview() {
    return this.delivery.pendingReview();
  }

  @Get('activity')
  async activity() {
    const tenant = [this.tenancy.tenantId];
    const manager = this.tenancy.manager;
    const events = await manager.query(
      `SELECT activity.id, activity.appointment_id AS "appointmentId", activity.kind,
           activity.occurred_at AS "occurredAt",
           activity.notify_reception AND activity.acknowledged_at IS NULL AS unread,
           appointment.patient_id AS "patientId",
           NULLIF(TRIM(CONCAT_WS(' ', patient.first_name, patient.last_name)), '') AS "patientName"
       FROM public.whatsapp_booking_activity activity
       LEFT JOIN public.appointments appointment
         ON appointment.tenant_id = activity.tenant_id
        AND appointment.id = activity.appointment_id
       LEFT JOIN public.patients patient
         ON patient.tenant_id = appointment.tenant_id
        AND patient.id = appointment.patient_id
       WHERE activity.tenant_id = $1
       ORDER BY (activity.notify_reception AND activity.acknowledged_at IS NULL) DESC,
         activity.occurred_at DESC LIMIT 50`,
      tenant,
    );
    const reminders = await manager.query(
      `SELECT reminder.appointment_id AS "appointmentId", reminder.scheduled_at AS "scheduledAt",
           reminder.attempted_at AS "attemptedAt", reminder.status,
           appointment.patient_id AS "patientId",
           NULLIF(TRIM(CONCAT_WS(' ', patient.first_name, patient.last_name)), '') AS "patientName"
       FROM public.whatsapp_booking_reminders reminder
       LEFT JOIN public.appointments appointment
         ON appointment.tenant_id = reminder.tenant_id
        AND appointment.id = reminder.appointment_id
       LEFT JOIN public.patients patient
         ON patient.tenant_id = appointment.tenant_id
        AND patient.id = appointment.patient_id
       WHERE reminder.tenant_id = $1
       ORDER BY reminder.attempted_at DESC LIMIT 30`,
      tenant,
    );
    return {
      events,
      reminders,
      deliveryIssues: await this.delivery.pendingReview(),
    };
  }

  @Get('activity/unread')
  async unread() {
    const [row] = await this.tenancy.manager.query<{ count: number }[]>(
      `SELECT count(*)::integer AS count FROM public.whatsapp_booking_activity
       WHERE tenant_id = $1 AND notify_reception AND acknowledged_at IS NULL`,
      [this.tenancy.tenantId],
    );
    return row;
  }

  @Patch('activity/:id/acknowledge')
  async acknowledge(@Param('id', ParseUUIDPipe) id: string) {
    await this.tenancy.manager.query(
      `UPDATE public.whatsapp_booking_activity SET acknowledged_at = now()
       WHERE tenant_id = $1 AND id = $2 AND notify_reception AND acknowledged_at IS NULL`,
      [this.tenancy.tenantId, id],
    );
    return { ok: true };
  }
}
