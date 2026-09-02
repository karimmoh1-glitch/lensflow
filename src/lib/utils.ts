import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Returns a Date whose LOCAL wall-clock (whatever timezone the process happens to be
 * running in) reads the same as the real wall-clock time in `timeZone` — a trick to make
 * date-fns's format() (which always reads a Date's local representation) print times in
 * a business's configured timezone instead of the server's. Needed because Vercel runs
 * in UTC, and a business's actual hours/bookings are meaningless without their own zone.
 */
export function toZonedDisplayDate(date: Date, timeZone: string): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  const hour = Number(get("hour"));
  return new Date(
    Number(get("year")),
    Number(get("month")) - 1,
    Number(get("day")),
    hour === 24 ? 0 : hour,
    Number(get("minute")),
    Number(get("second"))
  );
}

export function formatMoney(cents: number) {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
