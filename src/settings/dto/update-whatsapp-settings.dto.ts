import { Type } from 'class-transformer';
import { WhatsappFeaturesDto } from './whatsapp-features.dto';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsUUID,
  Max,
  Min,
  ValidateIf,
  IsObject,
  ValidateNested,
} from 'class-validator';

export class UpdateWhatsappSettingsDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsObject()
  @ValidateNested()
  @Type(() => WhatsappFeaturesDto)
  features?: WhatsappFeaturesDto;
  @IsBoolean() clinicEnabled: boolean;
  @IsBoolean() askReason: boolean;
  @IsInt() @Min(1) @Max(90) horizonDays: number;
  @IsInt() @Min(0) @Max(10080) leadMinutes: number;
  @ValidateIf((_, value) => value !== undefined)
  @IsBoolean()
  cancellationEnabled?: boolean;

  @ValidateIf((_, value) => value !== undefined)
  @IsInt()
  @Min(0)
  @Max(168)
  cancellationNoticeHours?: number;

  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  practitionerIds: string[];
}

export class UpdateWhatsappPlatformDto {
  @IsBoolean() platformEnabled: boolean;
}
