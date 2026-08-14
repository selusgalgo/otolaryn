import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../iam/current-user.decorator';
import type { CurrentUserPayload } from '../iam/current-user.decorator';
import { JwtAuthGuard } from '../iam/jwt-auth.guard';
import { AccountService } from './account.service';
import { UpdatePasswordDto } from './dto/update-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

// No RolesGuard, no TenantContextInterceptor — every authenticated role,
// including superadmin (no tenant), manages their own account here.
@Controller('account')
@UseGuards(JwtAuthGuard)
export class AccountController {
  constructor(private readonly account: AccountService) {}

  @Get()
  getProfile(@CurrentUser() user: CurrentUserPayload) {
    return this.account.getProfile(user.userId);
  }

  @Patch('profile')
  updateProfile(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.account.updateProfile(user.userId, dto);
  }

  @Patch('password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async updatePassword(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UpdatePasswordDto,
  ): Promise<void> {
    await this.account.updatePassword(user.userId, dto);
  }
}
