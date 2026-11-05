import { Module } from '@nestjs/common';
import { AttachmentStorage } from './attachment-storage.service';
import { VirusScanService } from './virus-scan.service';

// Almacenamiento y antivirus de adjuntos, compartidos por quien sube archivos
// (consultas) y por quien debe borrarlos al eliminar sus filas (usuarios,
// borradores caducados).
@Module({
  providers: [AttachmentStorage, VirusScanService],
  exports: [AttachmentStorage, VirusScanService],
})
export class AttachmentStorageModule {}
