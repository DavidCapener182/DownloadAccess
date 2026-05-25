import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/London",
  }).format(new Date(value));
}

export function minutesBetween(start: string, end = new Date()) {
  return Math.max(
    0,
    Math.round((end.getTime() - new Date(start).getTime()) / 60000),
  );
}
