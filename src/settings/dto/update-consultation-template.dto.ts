import { IsIn } from 'class-validator';
import {
  CONSULTATION_TEMPLATES,
  type ConsultationTemplate,
} from '../../clinical-entries/consultation-template';

export class UpdateConsultationTemplateDto {
  @IsIn(CONSULTATION_TEMPLATES, {
    message: `La plantilla debe ser una de: ${CONSULTATION_TEMPLATES.join(', ')}`,
  })
  template: ConsultationTemplate;
}
