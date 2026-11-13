export type CalendarView = "day" | "week" | "month";
export function periodStart(date: string, view: CalendarView) {
  const value = new Date(`${date}T00:00:00.000Z`);
  if (view === "week")
    value.setUTCDate(value.getUTCDate() - ((value.getUTCDay() + 6) % 7));
  if (view === "month") value.setUTCDate(1);
  return value;
}
export function shiftPeriod(
  date: string,
  view: CalendarView,
  direction: number,
) {
  const value = periodStart(date, view);
  if (view === "month") value.setUTCMonth(value.getUTCMonth() + direction);
  else
    value.setUTCDate(
      value.getUTCDate() + direction * (view === "week" ? 7 : 1),
    );
  const result = value.toISOString().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(result) && result >= "0001-01-01"
    ? result
    : null;
}
export function calendarDays(date: string, view: "week" | "month") {
  const first = periodStart(date, view),
    end = new Date(first);
  if (view === "week") end.setUTCDate(end.getUTCDate() + 7);
  else end.setUTCMonth(end.getUTCMonth() + 1);
  const start = new Date(first);
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  const last = new Date(end);
  last.setUTCDate(last.getUTCDate() + ((7 - ((last.getUTCDay() + 6) % 7)) % 7));
  const days: string[] = [];
  for (
    const cursor = new Date(start);
    cursor < last;
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  )
    days.push(cursor.toISOString().split("T")[0]);
  return days;
}
