import { IsString, MinLength } from 'class-validator';

// Admin/superadmin setting a new password directly for someone else — not
// a self-service flow (that's AccountService.updatePassword, which also
// verifies the current one). There's no "current password" to check here:
// the whole point is recovering an account whose owner can't log in.
export class ResetPasswordDto {
  @IsString()
  @MinLength(8)
  newPassword: string;
}
