import { PartialType } from '@nestjs/mapped-types';
import { CreateInsuranceEntityDto } from './create-insurance-entity.dto';

export class UpdateInsuranceEntityDto extends PartialType(
  CreateInsuranceEntityDto,
) {}
