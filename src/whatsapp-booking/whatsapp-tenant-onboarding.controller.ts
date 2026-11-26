import {
  Body,
  Controller,
  Get,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { IsString, Length, Matches } from 'class-validator';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../iam/current-user.decorator';
import { JwtAuthGuard } from '../iam/jwt-auth.guard';
import { Roles } from '../iam/roles.decorator';
import { RolesGuard } from '../iam/roles.guard';
import { TenantContextInterceptor } from '../tenancy/tenant-context.interceptor';
import { WhatsappTenantOnboardingService } from './whatsapp-tenant-onboarding.service';

class CompleteSignupDto {
  @IsString() @Matches(/^[A-Za-z0-9_-]{43}$/) state: string;
  @IsString() @Length(1, 4096) code: string;
  @IsString() @Matches(/^\d{1,30}$/) wabaId: string;
  @IsString() @Matches(/^\d{1,30}$/) phoneNumberId: string;
}

@Controller('settings/whatsapp-connection')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TenantContextInterceptor)
@Roles('admin')
export class WhatsappTenantOnboardingController {
  constructor(private readonly onboarding: WhatsappTenantOnboardingService) {}

  @Get()
  status() {
    return this.onboarding.status();
  }

  @Post('begin')
  begin(@CurrentUser() user: CurrentUserPayload) {
    return this.onboarding.begin(user.userId);
  }

  @Post('complete')
  complete(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: CompleteSignupDto,
  ) {
    return this.onboarding.finish(user.userId, body.state, body);
  }

  @Post('activate')
  activate() {
    return this.onboarding.activate();
  }
}
