import { Module } from '@nestjs/common';
import { AppointmentsModule } from '../appointments/appointments.module';
import { PatientsModule } from '../patients/patients.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { IamModule } from '../iam/iam.module';
import { WhatsappBookingController } from './whatsapp-booking.controller';
import { WhatsappBookingGuard } from './whatsapp-booking.guard';
import { WhatsappBookingService } from './whatsapp-booking.service';
import { WhatsappConversationService } from './whatsapp-conversation.service';
import { WhatsappBookingPurgeService } from './whatsapp-booking-purge.service';
import { WhatsappDeliveryService } from './whatsapp-delivery.service';
import { WhatsappDeliveryReviewController } from './whatsapp-delivery-review.controller';
import { WhatsappRemindersService } from './whatsapp-reminders.service';
import { WhatsappTenantOnboardingController } from './whatsapp-tenant-onboarding.controller';
import { WhatsappTenantOnboardingService } from './whatsapp-tenant-onboarding.service';
import { WhatsappTenantRouterController, WhatsappTenantRouterGuard } from './whatsapp-tenant-router.controller';
import { WhatsappTenantRouterService } from './whatsapp-tenant-router.service';

@Module({
  imports: [AppointmentsModule, PatientsModule, TenancyModule, IamModule],
  controllers: [WhatsappBookingController, WhatsappDeliveryReviewController, WhatsappTenantOnboardingController, WhatsappTenantRouterController],
  providers: [
    WhatsappBookingGuard,
    WhatsappBookingService,
    WhatsappConversationService,
    WhatsappBookingPurgeService,
    WhatsappDeliveryService,
    WhatsappRemindersService,
    WhatsappTenantOnboardingService,
    WhatsappTenantRouterService,
    WhatsappTenantRouterGuard,
  ],
})
export class WhatsappBookingModule {}
