import { IsDateString } from 'class-validator';

export class TodayDashboardQueryDto {
  // Required, not defaulted server-side — same convention as the Agenda's
  // from/to filters: the caller always computes "today" in its own local
  // timezone and passes it explicitly, so there's no server-side notion of
  // "today" to get wrong.
  @IsDateString()
  date: string;
}
