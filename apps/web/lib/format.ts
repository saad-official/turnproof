/** Date and time formatting for server-rendered pages, always in an explicit zone. */

const LOCALE = "en-GB";

export function formatDate(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat(LOCALE, { timeZone, weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(
    new Date(iso),
  );
}

export function formatDay(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat(LOCALE, { timeZone, day: "numeric", month: "long", year: "numeric" }).format(new Date(iso));
}

export function formatTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat(LOCALE, { timeZone, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

/** "America/Toronto" -> "Toronto time"; UTC stays "UTC". */
export function zoneLabel(timeZone: string): string {
  if (timeZone === "UTC" || timeZone === "Etc/UTC") return "UTC";
  const city = timeZone.split("/").pop()?.replace(/_/g, " ");
  return city ? `${city} time` : timeZone;
}
