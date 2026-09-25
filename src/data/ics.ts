import { Category, Meeting, Place } from "@/types";
import { detectLink } from "@/lib/links";

export interface IcsEvent { uid: string; title: string; date: string; startTime?: string; endTime?: string; location: string; description: string; teamsUrl?: string }

const pad = (n: number) => String(n).padStart(2, "0");
const unescape = (v: string) => v.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1");

/** DTSTART/DTEND の値を端末のローカル日付・時刻に変換（UTC の "Z" 付きは変換、TZID 付き・フローティングはそのまま） */
function parseDateTime(value: string): { date: string; time?: string } | null {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, , z] = m;
  if (h === undefined) return { date: `${y}-${mo}-${d}` };
  if (z) {
    const t = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi));
    return { date: `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`, time: `${pad(t.getHours())}:${pad(t.getMinutes())}` };
  }
  return { date: `${y}-${mo}-${d}`, time: `${h}:${mi}` };
}

/** "NAME;PARAM=..:VALUE" を名前と値に分割（引用符内のコロンは無視） */
function splitLine(line: string): [string, string] {
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') quoted = !quoted;
    else if (c === ":" && !quoted) return [line.slice(0, i).split(";")[0].toUpperCase(), line.slice(i + 1)];
  }
  return [line.toUpperCase(), ""];
}

export function parseIcs(raw: string): IcsEvent[] {
  const lines = raw.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").replace(/\n[ \t]/g, "").split("\n");
  const events: IcsEvent[] = [];
  let cur: Record<string, string> | null = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") { cur = {}; continue; }
    if (line === "END:VEVENT") {
      const start = cur && parseDateTime(cur.DTSTART ?? "");
      if (cur && start) {
        const end = parseDateTime(cur.DTEND ?? "");
        const description = unescape(cur.DESCRIPTION ?? "");
        const teamsUrl = description.match(/https:\/\/teams\.microsoft\.com\/[^\s<>"]+/)?.[0] ?? cur["X-MICROSOFT-SKYPETEAMSMEETINGURL"] ?? cur["X-MICROSOFT-ONLINEMEETINGCONFLINK"];
        events.push({
          uid: [cur.UID, cur["RECURRENCE-ID"]].filter(Boolean).join("@") || crypto.randomUUID(),
          title: unescape(cur.SUMMARY ?? "").trim(),
          date: start.date,
          startTime: start.time,
          endTime: start.time && end?.date === start.date ? end.time : undefined,
          location: unescape(cur.LOCATION ?? "").trim(),
          description,
          teamsUrl,
        });
      }
      cur = null; continue;
    }
    if (cur) { const [k, v] = splitLine(line); if (!(k in cur)) cur[k] = v; }
  }
  return events;
}

/** ドロップ・選択されたファイルが ICS かどうか（拡張子または MIME タイプで判定） */
export const isIcsFile = (f: File) => /\.ics$/i.test(f.name) || f.type === "text/calendar";

/** Teams 招待の定型文（罫線以降）を除いた本文 */
const cleanDescription = (d: string) => d.split(/\n?_{10,}/)[0].trim();

/** 議題に分類名が含まれればその分類、なければ fallback（既定は未選択 ""） */
export function eventToMeeting(ev: IcsEvent, categories: Category[], fallbackCategory = ""): Meeting {
  const now = new Date().toISOString();
  const byName = [...categories].sort((a, b) => b.name.length - a.name.length).find(c => ev.title.includes(c.name));
  const category = byName?.id ?? fallbackCategory;
  const isTeams = /teams/i.test(ev.location) || Boolean(ev.teamsUrl);
  const place: Place = isTeams ? "Teams" : ev.location ? "対面" : "その他";
  const memo = [!isTeams && ev.location ? `場所：${ev.location}` : "", cleanDescription(ev.description)].filter(Boolean).join("\n");
  return {
    id: crypto.randomUUID(), date: ev.date, startTime: ev.startTime, endTime: ev.endTime, place, category,
    title: ev.title || "無題の会議", important: false, memo, tags: [],
    links: ev.teamsUrl ? [{ id: crypto.randomUUID(), title: detectLink(ev.teamsUrl).title, url: ev.teamsUrl, type: "teams" }] : [],
    tasks: [], icsUid: ev.uid, createdAt: now, updatedAt: now,
  };
}
