import {
  Body,
  Controller,
  Get,
  Headers,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { TenantContextInterceptor } from '../tenancy/tenant-context.interceptor';
import {
  BookingDto,
  InboundMessageDto,
  DeliveryClaimDto,
  DeliveryResultDto,
  SlotQueryDto,
} from './whatsapp-booking.dto';
import { WhatsappConversationService } from './whatsapp-conversation.service';
import { WhatsappBookingGuard } from './whatsapp-booking.guard';
import { WhatsappBookingService } from './whatsapp-booking.service';
import { WhatsappDeliveryService } from './whatsapp-delivery.service';

@Controller('integrations/whatsapp-booking')
@UseGuards(WhatsappBookingGuard)
@UseInterceptors(TenantContextInterceptor)
export class WhatsappBookingController {
  constructor(
    private readonly booking: WhatsappBookingService,
    private readonly conversation: WhatsappConversationService,
    private readonly delivery: WhatsappDeliveryService,
  ) {}

  @Get('practitioners')
  practitioners() {
    return this.booking.practitioners();
  }

  @Get('dates')
  dates(@Query('practitionerId', ParseUUIDPipe) practitionerId: string) {
    return this.booking.availableDates(practitionerId);
  }

  @Get('slots')
  slots(@Query() query: SlotQueryDto) {
    return this.booking.slots(query);
  }

  @Post('appointments')
  book(@Body() body: BookingDto, @Headers('idempotency-key') key?: string) {
    return this.booking.book(body, key);
  }

  @Post('messages')
  message(@Body() body: InboundMessageDto) {
    return this.conversation.process(body);
  }

  @Post('delivery/prepare-flow')
  prepareFlowDelivery(@Body() body: DeliveryClaimDto) {
    return this.delivery.prepareFlow(body);
  }

  @Post('delivery/claim')
  claimDelivery(@Body() body: DeliveryClaimDto) {
    return this.delivery.claim(body);
  }

  @Post('delivery/result')
  deliveryResult(@Body() body: DeliveryResultDto) {
    return this.delivery.result(body);
  }
}
