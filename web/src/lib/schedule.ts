import type { TimeSlot } from "@/lib/types";

// Plain utility, deliberately NOT in a "use server" file — every exported
// function in one of those must be async, and this one is a synchronous
// FormData reader used by two different Server Action files.
//
// Reads day0..day6 as JSON — see ScheduleForm, which mirrors each day's
// slot list into a same-named hidden input (a per-slot dynamic field name
// would be far more fiddly for a variable number of tramos per day).
export function scheduleFromFormData(formData: FormData): { weekday: number; slots: TimeSlot[] }[] {
  return Array.from({ length: 7 }, (_, weekday) => {
    const raw = formData.get(`day${weekday}`);
    let slots: TimeSlot[] = [];
    if (typeof raw === "string" && raw) {
      try {
        slots = JSON.parse(raw) as TimeSlot[];
      } catch {
        slots = [];
      }
    }
    return { weekday, slots };
  });
}
