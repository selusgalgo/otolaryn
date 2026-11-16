import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../iam/current-user.decorator';
import { JwtAuthGuard } from '../iam/jwt-auth.guard';
import { Roles } from '../iam/roles.decorator';
import { RolesGuard } from '../iam/roles.guard';
import { UpdateCreditorProfileDto } from './dto/update-creditor-profile.dto';
import { UpsertSepaMandateDto } from './dto/upsert-sepa-mandate.dto';
import { MAX_CERTIFICATE_BYTES, SepaService } from './sepa.service';

// Panel Eiduo only. Like PlatformController, no tenant context: these
// routes operate on Mederi's own billing, across every clinic.
@Controller('platform')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('superadmin')
export class SepaController {
  constructor(private readonly sepa: SepaService) {}

  @Get('creditor-profile')
  getCreditor() {
    return this.sepa.getCreditor();
  }

  @Get('creditor-profile/certificate')
  getCertificateStatus() {
    return this.sepa.getCertificateStatus();
  }

  // The .p12 and its passphrase arrive together; the passphrase is a text
  // field of the same multipart body, never a query string or a header.
  @Post('creditor-profile/certificate')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_CERTIFICATE_BYTES },
    }),
  )
  installCertificate(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('passphrase') passphrase: string | undefined,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.sepa.installCertificate(file, passphrase, user.userId);
  }

  @Delete('creditor-profile/certificate')
  removeCertificate(@CurrentUser() user: CurrentUserPayload) {
    return this.sepa.removeCertificate(user.userId);
  }

  @Put('creditor-profile')
  updateCreditor(@Body() dto: UpdateCreditorProfileDto) {
    return this.sepa.updateCreditor(dto);
  }

  @Get('tenants/:id/sepa-mandate')
  getMandate(@Param('id', ParseUUIDPipe) id: string) {
    return this.sepa.getMandate(id);
  }

  @Put('tenants/:id/sepa-mandate')
  upsertMandate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpsertSepaMandateDto,
  ) {
    return this.sepa.upsertMandate(id, dto);
  }

  @Post('tenants/:id/sepa-mandate/signing-link')
  issueSigningLink(@Param('id', ParseUUIDPipe) id: string) {
    return this.sepa.issueSigningLink(id);
  }

  @Post('tenants/:id/sepa-mandate/cancel')
  cancelMandate(@Param('id', ParseUUIDPipe) id: string) {
    return this.sepa.cancelMandate(id);
  }

  // Current data as PDF — a preview until the order is signed.
  @Get('tenants/:id/sepa-mandate/pdf')
  async mandatePdf(
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { buffer, reference } = await this.sepa.renderMandatePdf(id);
    return this.sendPdf(res, buffer, `orden-sepa-${reference}-borrador.pdf`);
  }

  @Get('tenants/:id/sepa-mandate/signed-pdf')
  async signedPdf(
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { buffer, reference } = await this.sepa.getSignedPdf(id);
    return this.sendPdf(res, buffer, `orden-sepa-${reference}-firmada.pdf`);
  }

  private sendPdf(
    res: Response,
    buffer: Buffer,
    filename: string,
  ): StreamableFile {
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    return new StreamableFile(buffer);
  }
}
