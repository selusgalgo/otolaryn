import { Module } from '@nestjs/common';
import { BackupsController } from './backups.controller';
import { BackupConfigurationService } from './backup-configuration.service';
import { BackupsService } from './backups.service';
import { AttachmentStorageModule } from '../attachments/attachment-storage.module';

@Module({
  imports: [AttachmentStorageModule],
  controllers: [BackupsController],
  providers: [BackupConfigurationService, BackupsService],
})
export class BackupsModule {}
