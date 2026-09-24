import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

// Trims whitespace before validation/storage. Without this, " 00000002B"
// and "00000002B" are different strings as far as the documentId unique
// index is concerned — a stray leading/trailing space (easy to fat-finger,
// or pasted in from somewhere) silently defeats the "no duplicate patient"
// guarantee. Found by the user creating a patient that looked identical to
// an existing one.
const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreatePatientDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName: string;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName: string;

  // Opcional: muchos pacientes reales no tienen DNI/NIE/pasaporte a mano
  // (~80% de las filas de la migración legada, por ejemplo) — no se
  // inventa un valor cuando falta, se deja vacío.
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  documentId?: string;

  @IsDateString()
  dateOfBirth: string;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  phone: string;

  // Muchas filas del legado traen dos teléfonos en una sola celda
  // ("645575702/955761278") — el importador los separa antes de llegar
  // aquí (ver patients-csv.util.ts), pero el campo en sí es un teléfono
  // secundario normal, igual de editable a mano que el primero.
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(30)
  phone2?: string;

  @IsOptional()
  @Transform(trim)
  @IsEmail()
  email?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  address?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  province?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(10)
  postalCode?: string;

  // 2000 no basta para el legado: la columna HISTORIA de pacientes.xls (que
  // se mapea aquí) llega hasta 11.548 caracteres en algunas filas reales.
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(20000)
  notes?: string;

  // PROFESION del programa legado — solo lo rellena el asistente de
  // importación de Pacientes; también editable a mano desde la ficha.
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  profession?: string;

  @IsOptional()
  @IsUUID()
  insuranceEntityId?: string;

  // "Número de historia" — el asistente de importación de Pacientes lo
  // rellena con el NUMHISTORIA del programa legado, cuando esa fila lo
  // trae. El formulario normal nunca lo envía: si llega undefined,
  // PatientsService.create le asigna automáticamente el siguiente número
  // libre de la secuencia del tenant (24/09/2026, a petición del usuario)
  // — sigue siendo opcional aquí solo para no bloquear ese camino explícito
  // del importador.
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(50)
  legacyId?: string;
}
