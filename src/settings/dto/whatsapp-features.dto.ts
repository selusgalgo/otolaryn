import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsObject,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class WhatsappVisitTypeDto {
  @IsUUID('4') id: string;
  @IsString() @Matches(/\S/) @MaxLength(60) name: string;
  @IsInt() @Min(5) @Max(480) durationMinutes: number;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  practitionerIds: string[];
}

export class WhatsappHoursDto {
  @IsInt() @Min(0) @Max(6) weekday: number;
  @Matches(/^([01][0-9]|2[0-3]):[0-5][0-9]$/) start: string;
  @Matches(/^([01][0-9]|2[0-3]):[0-5][0-9]$/) end: string;
}

export class WhatsappFeaturesDto {
  @IsString() @MaxLength(300) welcome: string;
  @IsString() @MaxLength(40) receptionPhone: string;
  @IsString() @MaxLength(160) receptionHours: string;
  @IsBoolean() reschedule: boolean;
  @IsBoolean() notifyReception: boolean;
  @IsInt() @Min(0) @Max(168) reminderHours: number;

  @IsArray()
  @ArrayMaxSize(8)
  @ArrayUnique((item: WhatsappVisitTypeDto) => item?.id)
  @IsObject({ each: true })
  @ValidateNested({ each: true })
  @Type(() => WhatsappVisitTypeDto)
  visitTypes: WhatsappVisitTypeDto[];

  @IsBoolean() restrictHours: boolean;
  @IsArray()
  @ArrayMaxSize(28)
  @IsObject({ each: true })
  @ValidateNested({ each: true })
  @Type(() => WhatsappHoursDto)
  hours: WhatsappHoursDto[];
}

export const defaultWhatsappFeatures: WhatsappFeaturesDto = {
  welcome: '',
  receptionPhone: '',
  receptionHours: '',
  reschedule: false,
  notifyReception: false,
  reminderHours: 0,
  visitTypes: [],
  restrictHours: false,
  hours: [],
};
