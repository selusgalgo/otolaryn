import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { MAX_ATTACHMENT_BYTES } from '../attachments/attachment-file.util';
import { CurrentUser } from '../iam/current-user.decorator';
import type { CurrentUserPayload } from '../iam/current-user.decorator';
import { JwtAuthGuard } from '../iam/jwt-auth.guard';
import { Roles } from '../iam/roles.decorator';
import { RolesGuard } from '../iam/roles.guard';
import { TenantContextInterceptor } from '../tenancy/tenant-context.interceptor';
import { ClinicalEntryAttachmentsService } from './clinical-entry-attachments.service';

// Ver y descargar: todos los que ven la consulta (también recepción). Añadir y
// quitar: administradores y profesionales — ver ClinicalEntryAttachmentsService
// para las reglas de borradores.
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TenantContextInterceptor)
@Roles('admin', 'profesional', 'recepcion')
export class ClinicalEntryAttachmentsController {
  constructor(private readonly attachments: ClinicalEntryAttachmentsService) {}

  @Get('clinical-entries/:entryId/attachments')
  list(
    @Param('entryId', ParseUUIDPipe) entryId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.attachments.list(entryId, user);
  }

  @Post('clinical-entries/:entryId/attachments')
  @Roles('admin', 'profesional')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_ATTACHMENT_BYTES, files: 1 },
    }),
  )
  upload(
    @Param('entryId', ParseUUIDPipe) entryId: string,
    @CurrentUser() user: CurrentUserPayload,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('No se ha recibido ningún archivo');
    }
    return this.attachments.add(entryId, user, file);
  }

  // El contenido lo ha subido un usuario: se sirve con el tipo que se comprobó
  // al subirlo, sin dejar que el navegador lo reinterprete (nosniff) y aislado
  // (sandbox, sin scripts ni recursos), de modo que un PDF o imagen manipulado
  // no pueda ejecutar nada en nuestro dominio.
  @Get('clinical-entry-attachments/:id/file')
  async file(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Res({ passthrough: true }) res: Response,
    @Query('download') download?: string,
  ): Promise<StreamableFile> {
    const { attachment, stream } = await this.attachments.getFile(id, user);
    const disposition = download === '1' ? 'attachment' : 'inline';
    const ascii = attachment.originalName
      .replace(/[^\x20-\x7e]/g, '_')
      .replace(/"/g, '');
    res.set({
      'Content-Type': attachment.mimeType,
      'Content-Length': String(attachment.sizeBytes),
      'Content-Disposition': `${disposition}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(attachment.originalName)}`,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cache-Control': 'private, no-store',
    });
    return new StreamableFile(stream);
  }

  @Delete('clinical-entry-attachments/:id')
  @Roles('admin', 'profesional')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<void> {
    await this.attachments.remove(id, user);
  }
}
