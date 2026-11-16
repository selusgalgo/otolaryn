import { Transform } from 'class-transformer';
import { Equals, IsString, MaxLength, MinLength } from 'class-validator';
import { spanishMessage } from '../../shared/validation-messages.util';
import { trim } from './sepa-dto.helpers';

const ACCEPT_MESSAGE = spanishMessage(
  'Debes aceptar la orden de domiciliación para firmarla',
);

// Signing on the web (simple electronic signature): the signer ticks the
// acceptance and types their name as it appears in the document.
export class SignWebDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  typedName: string;

  @Equals(true, { message: ACCEPT_MESSAGE })
  accept: boolean;
}
