// Shared month-grid math for the navigable mini-calendars (Escritorio's
// AgendaCalendar and Agenda's OccupancyCalendar) — same weekday convention
// (0 = Monday) as the rest of the app (schedule.days, weekdayOf()).

export const WEEKDAYS = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];

export interface DayCell {
  date: Date;
  inMonth: boolean;
}

export function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function parseDateKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

// 6 rows worst case (a month that starts on the last weekday slot and spans
// into a 6th week), filled with the tail of the previous/next month —
// standard calendar-grid shape.
export function buildGrid(year: number, month: number): DayCell[] {
  const firstOfMonth = new Date(year, month, 1);
  const firstWeekday = (firstOfMonth.getDay() + 6) % 7; // 0 = Monday
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const cells: DayCell[] = [];
  for (let i = firstWeekday - 1; i >= 0; i--) {
    cells.push({ date: new Date(year, month - 1, daysInPrevMonth - i), inMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: new Date(year, month, d), inMonth: true });
  }
  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1].date;
    cells.push({ date: new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1), inMonth: false });
  }
  return cells;
}
