export function formatTime12Hour(value?: string | null): string {
  if (!value) return "";

  const match = value.trim().match(/^(\d{1,2}):(\d{2})(?:\s*([ap]m))?$/i);
  if (!match) return value;

  let hour = Number(match[1]);
  const minute = match[2];
  const meridiem = match[3]?.toUpperCase();

  if (meridiem) {
    if (hour < 1 || hour > 12) return value;
    return `${hour}:${minute} ${meridiem}`;
  }

  if (hour < 0 || hour > 23) return value;
  const period = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  return `${hour}:${minute} ${period}`;
}

export function parseTimeTo24Hour(value: string): string {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})\s*([ap]m)?$/i);
  if (!match) return value;

  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const meridiem = match[3]?.toLowerCase();

  if (minute > 59) return value;
  if (meridiem) {
    if (hour < 1 || hour > 12) return value;
    if (meridiem === "pm" && hour !== 12) hour += 12;
    if (meridiem === "am" && hour === 12) hour = 0;
  } else if (hour > 23) {
    return value;
  }

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}