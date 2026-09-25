import { Meeting } from "@/types";
import { timeRange } from "./date";

export type ConflictReason = "time" | "title";
export interface Conflict { meeting: Meeting; reason: ConflictReason }
type Target = Pick<Meeting, "id" | "date" | "title" | "startTime" | "endTime">;

const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
/** 時間帯 [開始, 終了)。終了がなければ開始時刻の一点として扱う */
const span = (m: Target): [number, number] | null => {
  if (!m.startTime) return null;
  const s = toMin(m.startTime);
  return [s, m.endTime ? Math.max(toMin(m.endTime), s + 1) : s + 1];
};
const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();

/** 同じ日に時間が重なる会議、または同じ議題の会議（二重登録の可能性）を返す */
export function findConflicts(target: Target, meetings: Meeting[]): Conflict[] {
  const a = span(target), title = norm(target.title);
  return meetings.flatMap((m): Conflict[] => {
    if (m.id === target.id || m.date !== target.date) return [];
    const b = span(m);
    if (a && b && a[0] < b[1] && b[0] < a[1]) return [{ meeting: m, reason: "time" }];
    if (title && norm(m.title) === title) return [{ meeting: m, reason: "title" }];
    return [];
  });
}

export const describeConflict = ({ meeting: m, reason }: Conflict) =>
  `${Number(m.date.slice(5, 7))}/${Number(m.date.slice(8))} ${timeRange(m) || "時間未設定"}「${m.title}」${reason === "time" ? "と時間が重なっています" : "と同じ議題です"}`;
