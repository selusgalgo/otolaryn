import { IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class LoginDto {
  // Email or username — AuthService.login() checks both columns. Can't be
  // @IsEmail() any more since a username generally isn't one.
  @IsString()
  @IsNotEmpty()
  identifier: string;

  @IsString()
  @MinLength(8)
  password: string;

  // The browser's stored device credential (see device_token cookie /
  // web/src/lib/session.ts), forwarded by loginAction. Absent for a
  // tenant with device lock off, or a browser that was never installed —
  // AuthService.login only requires it when the resolved user's tenant
  // actually has deviceLockEnabled.
  @IsOptional()
  @IsString()
  deviceToken?: string;
}
