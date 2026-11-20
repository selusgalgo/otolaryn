import {
  IsBoolean,
  IsDateString,
  IsISO8601,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class SlotQueryDto {
  @IsOptional()
  @IsUUID('4')
  visitTypeId?: string;

  @IsUUID()
  practitionerId: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  date: string;
}

export class BookingDto {
  @IsOptional()
  @IsBoolean()
  reminderOptIn?: boolean;

  @IsOptional()
  @IsUUID('4')
  visitTypeId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;

  @IsUUID()
  practitionerId: string;

  @IsISO8601({ strict: true })
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/)
  scheduledAt: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  dateOfBirth: string;

  @Matches(/^\+[1-9]\d{7,14}$/)
  phone: string;
}

export class InboundMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  messageId: string;

  @Matches(/^\+[1-9]\d{7,14}$/)
  phone: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  text: string;
}

export class DeliveryClaimDto {
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  messageId: string;

  @Matches(/^\+[1-9]\d{7,14}$/)
  phone: string;
}

export class DeliveryResultDto extends DeliveryClaimDto {
  @IsUUID()
  attempt: string;

  @IsIn(['sent', 'uncertain'])
  result: 'sent' | 'uncertain';
}
