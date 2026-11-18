import { IsIn } from 'class-validator';
import type { AgendaView } from '../../iam/entities/user.entity';

export class UpdateAgendaViewDto {
  @IsIn(['day', 'week', 'month'])
  agendaView: AgendaView;
}
