import { format } from "date-fns";

/**
 * Get current date/time in IST (Indian Standard Time - UTC+5:30)
 */
export function getNowIST(): Date {
  const now = new Date();
  // Convert to IST by adding 5:30 hours
  const istTime = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  return istTime;
}

/**
 * Get today's date in IST formatted as yyyy-MM-dd
 */
export function getTodayDateIST(): string {
  const now = getNowIST();
  return format(now, "yyyy-MM-dd");
}

/**
 * Get today's start of day (00:00:00) in IST
 */
export function getTodayStartIST(): Date {
  const today = new Date();
  today.setHours(5, 30, 0, 0); // Adjust for IST offset
  today.setDate(today.getDate());
  return today;
}

/**
 * Convert any date to IST format string (yyyy-MM-dd)
 */
export function dateToISTString(date: Date): string {
  const istTime = new Date(date.getTime() + 5.5 * 60 * 60 * 1000);
  return format(istTime, "yyyy-MM-dd");
}

export function parseTimeString(time: string): { hours: number; minutes: number } {
  const match = time.trim().match(/^(\d{1,2}):(\d{2})\s*([ap]m)?$/i);
  if (!match) throw new Error(`Invalid time: ${time}`);

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const period = match[3]?.toLowerCase();

  if (minutes > 59) throw new Error(`Invalid time: ${time}`);
  if (period) {
    if (hours < 1 || hours > 12) throw new Error(`Invalid time: ${time}`);
    if (period === "pm" && hours !== 12) hours += 12;
    if (period === "am" && hours === 12) hours = 0;
  } else if (hours > 23) {
    throw new Error(`Invalid time: ${time}`);
  }

  return { hours, minutes };
}

export function formatTimeForStorage(time: string): string {
  const { hours, minutes } = parseTimeString(time);
  const period = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 || 12;
  return `${String(hour12).padStart(2, "0")}:${String(minutes).padStart(2, "0")} ${period}`;
}

/**
 * Check if market has closed based on closeTime (format: "hh:mm AM/PM" or "HH:mm")
 * Returns true if current IST time >= market closeTime
 */
export function isMarketClosed(marketCloseTime: string): boolean {
  try {
    const now = getNowIST();
    const { hours: closeHour, minutes: closeMinute } = parseTimeString(marketCloseTime);
    
    const nowHour = now.getHours();
    const nowMinute = now.getMinutes();
    
    // Convert both times to minutes for easier comparison
    const currentTimeInMinutes = nowHour * 60 + nowMinute;
    const closeTimeInMinutes = closeHour * 60 + closeMinute;
    
    // Market is closed if current time >= close time
    const isClosed = currentTimeInMinutes >= closeTimeInMinutes;
    console.log(`[Market Close Check] Current: ${nowHour}:${String(nowMinute).padStart(2, '0')}, Close: ${marketCloseTime}, Closed: ${isClosed}`);
    return isClosed;
  } catch (error) {
    console.error(`Error parsing market close time: ${marketCloseTime}`, error);
    return true; // Default to true (market closed) for safety
  }
}
