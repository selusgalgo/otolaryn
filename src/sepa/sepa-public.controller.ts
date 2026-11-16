import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Put,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { memoryStorage } from 'multer';
import { SepaDebtorDto } from './dto/sepa-debtor.dto';
import { SignWebDto } from './dto/sign-web.dto';
import { clientContext, SepaRateLimitGuard } from './sepa-rate-limit.guard';
import { SepaSigningService } from './sepa-signing.service';
import { MAX_SIGNED_PDF_BYTES } from './sepa-signing.util';

// Deliberately no JwtAuthGuard: the clinic owner has no account. The long
// random token in the URL is the credential (see SepaSigningService), and
// everything here is scoped to the one mandate that token belongs to.
// Every response is no-store: they carry the client's IBAN and signed document.
@Controller('public/sepa')
@UseGuards(SepaRateLimitGuard)
export class SepaPublicController {
  constructor(private readonly signing: SepaSigningService) {}

  @Get(':token')
  @Header('Cache-Control', 'no-store')
  view(@Param('token') token: string) {
    return this.signing.getView(token);
  }

  @Put(':token')
  @Header('Cache-Control', 'no-store')
  saveDebtor(@Param('token') token: string, @Body() dto: SepaDebtorDto) {
    return this.signing.saveDebtor(token, dto);
  }

  @Get(':token/pdf')
  async pdf(
    @Param('token') token: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { buffer, reference } = await this.signing.getPdf(token);
    res.set({
      'Content-Type': 'application/pdf',
      'Cache-Control': 'no-store',
      'Content-Disposition': `inline; filename="orden-sepa-${reference}.pdf"`,
    });
    return new StreamableFile(buffer);
  }

  @Post(':token/sign')
  @Header('Cache-Control', 'no-store')
  signWeb(
    @Param('token') token: string,
    @Body() dto: SignWebDto,
    @Req() req: Request,
  ) {
    return this.signing.signWeb(token, dto.typedName, clientContext(req));
  }

  @Post(':token/sign-certificate')
  @Header('Cache-Control', 'no-store')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_SIGNED_PDF_BYTES },
    }),
  )
  signWithCertificate(
    @Param('token') token: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: Request,
  ) {
    return this.signing.signWithCertificate(token, file, clientContext(req));
  }
}
