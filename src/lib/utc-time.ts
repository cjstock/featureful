const hhmm = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC" });

/** A time as "HH:MM" in UTC (24-hour), for copy that labels it "UTC". */
export function formatUtcTime(date: Date): string {
  return hhmm.format(date);
}
