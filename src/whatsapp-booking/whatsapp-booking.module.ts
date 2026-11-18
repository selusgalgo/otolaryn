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

@Module({
  imports: [AppointmentsModule, PatientsModule, TenancyModule, IamModule],
  controllers: [WhatsappBookingController, WhatsappDeliveryReviewController],
  providers: [
    WhatsappBookingGuard,
    WhatsappBookingService,
    WhatsappConversationService,
    WhatsappBookingPurgeService,
    WhatsappDeliveryService,
  ],
})
export class WhatsappBookingModule {}
