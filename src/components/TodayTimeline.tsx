import { CalendarClock, TriangleAlert } from "lucide-react";
import { Category, Meeting } from "@/types";
import { timeRange } from "@/lib/date";
import { findConflicts } from "@/lib/conflicts";
import { useNow } from "./Countdown";

const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
/** 終了時刻のない会議は 30 分として描く */
const NO_END_MIN = 30;
type Status = "upcoming" | "soon" | "live" | "ended";
/** Countdown と同じ基準で、現在時刻から会議のステータスを決める */
function statusOf(m: Meeting, now: Date | null): Status {
  if (!now || !m.startTime) return "upcoming";
  const t = now.getTime(), start = new Date(`${m.date}T${m.startTime}:00`).getTime();
  if (t < start) return start - t <= 15 * 60 * 1000 ? "soon" : "upcoming";
  if (m.endedAt && new Date(m.endedAt).getTime() >= start) return "ended";
  const end = m.endTime ? new Date(`${m.date}T${m.endTime}:00`).getTime() : undefined;
  return end !== undefined && t < end ? "live" : "ended";
}
const LABEL: Record<Status, string> = { upcoming: "開催前", soon: "まもなく", live: "開催中", ended: "終了" };

/** 今日の会議を時間軸に並べたガントチャート（現在時刻は赤い縦線）。重なり判定は絞り込み前の全会議（all）で行う。バーをクリックすると会議の詳細を開く */
export default function TodayTimeline({ meetings, all, date, categories, onOpen }: { meetings: Meeting[]; all: Meeting[]; date: string; categories: Category[]; onOpen: (m: Meeting) => void }) {
  const now = useNow();
  const timed = meetings.filter(m => m.date === date && m.startTime).sort((a, b) => a.startTime!.localeCompare(b.startTime!));
  const untimed = meetings.filter(m => m.date === date && !m.startTime).length;
  const spans = timed.map(m => { const s = toMin(m.startTime!); return [s, m.endTime ? Math.max(toMin(m.endTime), s + 5) : s + NO_END_MIN] as const; });
  // 表示範囲は 8〜19 時を基本に、会議がはみ出す場合は時間単位で広げる
  const from = Math.min(8, ...spans.map(([s]) => Math.floor(s / 60))), to = Math.max(19, ...spans.map(([, e]) => Math.ceil(e / 60)));
  const total = (to - from) * 60, pct = (min: number) => `${((min - from * 60) / total) * 100}%`;
  const hours = Array.from({ length: to - from + 1 }, (_, i) => from + i);
  const nowMin = now && now.toDateString() === new Date(`${date}T12:00:00`).toDateString() ? now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60 : undefined;
  const showNow = nowMin !== undefined && nowMin >= from * 60 && nowMin <= to * 60;
  const nowLine = showNow && <span className="tl-now" style={{ left: pct(nowMin!) }} />;

  return <section className="timeline-section">
    <div className="list-head"><div><h2>タイムライン</h2><span>{timed.length}件</span></div><div className="tl-legend">{(["upcoming", "soon", "live", "ended"] as Status[]).map(s => <span key={s} className={`tl-key ${s}`}><i />{LABEL[s]}</span>)}</div></div>
    {timed.length === 0 ? <p className="tl-empty"><CalendarClock size={16} />時間が設定された今日の会議はありません</p> : <div className="tl-body">
      <div className="tl-row tl-axis"><span className="tl-label" /><div className="tl-track">{hours.map(h => <span key={h} className={`tl-hour ${h % 2 ? "odd" : ""}`} style={{ left: pct(h * 60) }}>{h}:00</span>)}{nowLine}{showNow && <span className="tl-now-label" style={{ left: pct(nowMin!) }}>{String(now!.getHours()).padStart(2, "0")}:{String(now!.getMinutes()).padStart(2, "0")}</span>}</div></div>
      {timed.map((m, i) => {
        const [s, e] = spans[i], st = statusOf(m, now), conflict = findConflicts(m, all).some(c => c.reason === "time");
        const cat = categories.find(c => c.id === m.category)?.name ?? m.category, time = timeRange(m);
        return <div key={m.id} className="tl-row">
          <button type="button" className="tl-label" onClick={() => onOpen(m)} title={m.title}><b>{m.title}</b><small>{time}</small></button>
          <div className="tl-track">
            {hours.map(h => <span key={h} className="tl-grid" style={{ left: pct(h * 60) }} />)}
            {nowLine}
            <button type="button" className={`tl-bar ${st}${conflict ? " conflict" : ""}${m.endTime ? "" : " open-end"}`} style={{ left: pct(s), width: `calc(${pct(e)} - ${pct(s)})` }} onClick={() => onOpen(m)} title={`${m.title}\n${time}（${LABEL[st]}）\n${cat} / ${m.place}${conflict ? "\n※ 時間が重なる会議があります" : ""}`}>
              {conflict && <TriangleAlert size={12} />}<span>{m.title}</span>
            </button>
          </div>
        </div>;
      })}
    </div>}
    {untimed > 0 && <p className="tl-note">時間未設定の会議が {untimed} 件あります（タイムラインには表示していません）</p>}
  </section>;
}
