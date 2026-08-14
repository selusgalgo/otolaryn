import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class LoginDto {
  // Email or username — AuthService.login() checks both columns. Can't be
  // @IsEmail() any more since a username generally isn't one.
  @IsString()
  @IsNotEmpty()
  identifier: string;

  @IsString()
  @MinLength(8)
  password: string;
}
