import { Module } from '@nestjs/common';
import { AttachmentStorageModule } from '../attachments/attachment-storage.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [TenancyModule, AttachmentStorageModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
