import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

// Upper bounds on every field of this unauthenticated endpoint: each value
// reaches a DB lookup or an argon2.verify before any credential is known
// to be right, so its size shouldn't be capped only by the body parser.
export class LoginDto {
  // Email or username — AuthService.login() checks both columns. Can't be
  // @IsEmail() any more since a username generally isn't one.
  @IsString()
  @IsNotEmpty()
  @MaxLength(320)
  identifier: string;

  @IsString()
  @MinLength(8)
  @MaxLength(1024)
  password: string;

  // The browser's stored device credential (see device_token cookie /
  // web/src/lib/session.ts), forwarded by loginAction. Absent for a
  // tenant with device lock off, or a browser that was never installed —
  // AuthService.login only requires it when the resolved user's tenant
  // actually has deviceLockEnabled.
  @IsOptional()
  @IsString()
  @MaxLength(512)
  deviceToken?: string;
}
