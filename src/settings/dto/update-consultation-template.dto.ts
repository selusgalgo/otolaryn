import { ArrayContains, IsArray, IsIn, IsOptional } from 'class-validator';
import {
  ALL_FIELDS,
  CONSULTATION_TEMPLATES,
  type ConsultationTemplate,
} from '../../clinical-entries/consultation-template';

export class UpdateConsultationTemplateDto {
  @IsIn(CONSULTATION_TEMPLATES, {
    message: `La plantilla debe ser una de: ${CONSULTATION_TEMPLATES.join(', ')}`,
  })
  template: ConsultationTemplate;

  // Campos marcados para la clínica. Opcional: sin él se usan los de la
  // plantilla. El motivo/enfermedad actual es obligatorio en toda consulta.
  @IsOptional()
  @IsArray()
  @ArrayContains(['chiefComplaint'], {
    message: 'El motivo de consulta es obligatorio',
  })
  @IsIn(ALL_FIELDS, { each: true, message: 'Campo de consulta no válido' })
  fields?: string[];
}
