import { Controller, Get, UseGuards, UseInterceptors } from '@nestjs/common';
import { JwtAuthGuard } from '../iam/jwt-auth.guard';
import { Roles } from '../iam/roles.decorator';
import { RolesGuard } from '../iam/roles.guard';
import { TenantContextInterceptor } from '../tenancy/tenant-context.interceptor';
import { WhatsappDeliveryService } from './whatsapp-delivery.service';

@Controller('whatsapp-booking/delivery-review')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TenantContextInterceptor)
@Roles('admin', 'recepcion')
export class WhatsappDeliveryReviewController {
  constructor(private readonly delivery: WhatsappDeliveryService) {}

  @Get()
  pendingReview() {
    return this.delivery.pendingReview();
  }
}
