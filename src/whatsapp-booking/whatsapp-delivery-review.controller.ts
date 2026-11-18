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
      `SELECT id, appointment_id AS "appointmentId", kind, occurred_at AS "occurredAt",
           notify_reception AND acknowledged_at IS NULL AS unread
       FROM public.whatsapp_booking_activity WHERE tenant_id = $1
       ORDER BY (notify_reception AND acknowledged_at IS NULL) DESC, occurred_at DESC LIMIT 50`,
      tenant,
    );
    const reminders = await manager.query(
      `SELECT appointment_id AS "appointmentId", scheduled_at AS "scheduledAt",
           attempted_at AS "attemptedAt", status
       FROM public.whatsapp_booking_reminders WHERE tenant_id = $1
       ORDER BY attempted_at DESC LIMIT 30`,
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
