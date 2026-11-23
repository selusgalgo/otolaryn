import { Body, Controller, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IsString, Length, Matches } from 'class-validator';
import type { Request, Response } from 'express';
import { decryptFlowRequest, encryptFlowResponse, validFlowSignature } from './whatsapp-flow-crypto';
import { FlowTokenError, WhatsappFlowService } from './whatsapp-flow.service';
import { readFileSync } from 'node:fs';

class FlowEnvelopeDto {
  @IsString() @Length(1, 65536) @Matches(/^[A-Za-z0-9+/=]+$/) encrypted_flow_data: string;
  @IsString() @Length(1, 2048) @Matches(/^[A-Za-z0-9+/=]+$/) encrypted_aes_key: string;
  @IsString() @Length(1, 64) @Matches(/^[A-Za-z0-9+/=]+$/) initial_vector: string;
}

/**
 * Public endpoint called by Meta. It is authenticated by the request
 * signature (app secret) and by the signed flow token inside the encrypted body.
 * Status codes follow the Flows protocol: 432 bad signature, 421 undecryptable
 * (Meta then refreshes the public key), 427 invalid flow token.
 */
@Controller('integrations/whatsapp-flows')
export class WhatsappFlowController {
  constructor(private readonly config: ConfigService, private readonly flows: WhatsappFlowService) {}

  @Post('endpoint')
  @HttpCode(200)
  async endpoint(@Body() body: FlowEnvelopeDto, @Req() req: Request & { rawBody?: Buffer }, @Res() res: Response) {
    const appSecret = this.config.get<string>('WHATSAPP_META_APP_SECRET') ?? '';
    const keyFile = this.config.get<string>('WHATSAPP_FLOW_PRIVATE_KEY_FILE') ?? '';
    if (!appSecret || !keyFile) return void res.status(503).end();
    if (!req.rawBody || !validFlowSignature(req.rawBody, req.headers['x-hub-signature-256'], appSecret)) return void res.status(432).end();
    let decrypted: ReturnType<typeof decryptFlowRequest>;
    try { decrypted = decryptFlowRequest(body, readFileSync(keyFile, 'utf8')); } catch { return void res.status(421).end(); }
    let response: unknown;
    try {
      response = await this.flows.handle(decrypted.data as Record<string, unknown>);
    } catch (error) {
      return void res.status(error instanceof FlowTokenError ? 427 : 500).end();
    }
    res.type('text/plain').set('Cache-Control', 'no-store').send(encryptFlowResponse(response, decrypted.aesKey, decrypted.iv));
  }
}
