import { Body, CanActivate, Controller, ExecutionContext, Injectable, Post, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'node:crypto';
import { IsString, Length, Matches } from 'class-validator';
import { WhatsappTenantRouterService } from './whatsapp-tenant-router.service';

class RoutedMessageDto {
  @IsString() @Matches(/^\d{1,30}$/) phoneNumberId: string;
  @IsString() @Matches(/^\+[1-9]\d{7,14}$/) phone: string;
  @IsString() @Length(1, 256) messageId: string;
  @IsString() @Length(1, 500) text: string;
}

@Injectable()
export class WhatsappTenantRouterGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}
  canActivate(context: ExecutionContext) {
    const expected = this.config.get<string>('WHATSAPP_ROUTER_TOKEN_SHA256') ?? '';
    const auth = context.switchToHttp().getRequest<{ headers: { authorization?: string } }>().headers.authorization ?? '';
    const match = /^Bearer ([A-Za-z0-9_-]{43,128})$/.exec(auth);
    if (!/^[a-f0-9]{64}$/.test(expected) || !match || !timingSafeEqual(Buffer.from(expected, 'hex'), createHash('sha256').update(match[1]).digest())) throw new UnauthorizedException();
    return true;
  }
}

@Controller('integrations/whatsapp-tenant-router')
@UseGuards(WhatsappTenantRouterGuard)
export class WhatsappTenantRouterController {
  constructor(private readonly router: WhatsappTenantRouterService) {}
  @Post('messages')
  message(@Body() body: RoutedMessageDto) { return this.router.process(body); }
}
