import { Meeting } from "@/types";
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
const pad = (n: number) => String(n).padStart(2, "0");
export const toIsoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseIsoDate = (s: string) => new Date(s + "T12:00:00");
export const weekdayOf = (s: string) => parseIsoDate(s).getDay();
export const weekdayLabel = (s: string) => WEEKDAYS[weekdayOf(s)];
export const timeRange = (m: Pick<Meeting, "startTime" | "endTime">) => m.startTime ? `${m.startTime}${m.endTime ? `–${m.endTime}` : "〜"}` : "";
export const compareMeetings = (a: Meeting, b: Meeting) => a.date.localeCompare(b.date) || (a.startTime ?? "").localeCompare(b.startTime ?? "");
