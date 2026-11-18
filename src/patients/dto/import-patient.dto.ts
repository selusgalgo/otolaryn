import { OmitType } from '@nestjs/mapped-types';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { CreatePatientDto } from './create-patient.dto';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

// Lo que valida una fila de un fichero legado. Es CreatePatientDto menos
// la obligatoriedad de fecha de nacimiento y teléfono: un fichero real trae
// muchos pacientes sin uno u otro, y esa fila debe importarse con el dato
// vacío (NULL) en vez de omitirse. Nombre y apellidos siguen siendo
// obligatorios — sin ellos el paciente no se puede buscar ni citar.
//
// El alta manual NO usa esta clase: sigue con CreatePatientDto y exige
// ambos datos, para que un descuido en el formulario no genere fichas
// incompletas. Un valor que sí venga informado se valida igual que allí.
export class ImportPatientDto extends OmitType(CreatePatientDto, [
  'dateOfBirth',
  'phone',
] as const) {
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  phone?: string;
}
