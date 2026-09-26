import { useMemo, useState } from "react";
import { CalendarPlus, Check, ChevronLeft, ChevronRight } from "lucide-react";
import { Holiday, HolidayKind, Meeting, MeetingTask } from "@/types";
import { parseIsoDate, toIsoDate } from "@/lib/date";

const WEEK = ["日", "月", "火", "水", "木", "金", "土"];
const KIND_LABEL: Record<HolidayKind, string> = { self: "自分の休み", company: "会社の休み" };

type Props = {
  meetings: Meeting[]; holidays: Holiday[]; today: string; selectedDay: string;
  setHolidays: (h: Holiday[]) => void; onOpen: (m: Meeting) => void; onSelectDay: (date: string) => void;
};

/** 全ビュー共通で表示する3か月分のカレンダー（中央が基準月、初期表示は今月）。前後の月へ制限なく移動でき、日付クリックで一覧をその日に絞り込む */
export default function CalendarView({ meetings, holidays, today, selectedDay, setHolidays, onOpen, onSelectDay }: Props) {
  const [mode, setMode] = useState<HolidayKind | null>(null);
  // 中央に表示する月の、今月からのずれ（0 = 今月が中央）
  const [offset, setOffset] = useState(0);
  const base = parseIsoDate(today);
  const months = [-1, 0, 1].map(i => new Date(base.getFullYear(), base.getMonth() + offset + i, 1));
  const monthValue = `${months[1].getFullYear()}-${String(months[1].getMonth() + 1).padStart(2, "0")}`;
  const jumpTo = (value: string) => {
    const [y, m] = value.split("-").map(Number);
    if (y && m) setOffset((y - base.getFullYear()) * 12 + (m - 1 - base.getMonth()));
  };
  const last = months[2];
  const rangeLabel = months[0].getFullYear() === last.getFullYear()
    ? `${months[0].getFullYear()}年${months[0].getMonth() + 1}月〜${last.getMonth() + 1}月`
    : `${months[0].getFullYear()}年${months[0].getMonth() + 1}月〜${last.getFullYear()}年${last.getMonth() + 1}月`;

  const countByDate = useMemo(() => {
    const map = new Map<string, number>();
    meetings.forEach(m => map.set(m.date, (map.get(m.date) ?? 0) + 1));
    return map;
  }, [meetings]);
  const dueTasks = useMemo(() => meetings.flatMap(m => m.tasks.filter(t => t.dueDate && !t.completed).map(t => ({ m, t: t as MeetingTask & { dueDate: string } })))
    .sort((a, b) => a.t.dueDate.localeCompare(b.t.dueDate)), [meetings]);
  const dueDates = new Set(dueTasks.map(x => x.t.dueDate));
  const holidayOf = (date: string) => holidays.find(h => h.date === date)?.kind;

  const clickDay = (date: string) => {
    if (!mode) { onSelectDay(date); return; }
    const current = holidayOf(date);
    const rest = holidays.filter(h => h.date !== date);
    setHolidays(current === mode ? rest : [...rest, { date, kind: mode }]);
  };

  return (
    <section className="calendar-board">
      <div className="calendar-head">
        <div><p className="eyebrow">{rangeLabel}</p><h2>3-Month View</h2></div>
        <div className="calendar-nav">
          <button className="icon-btn" onClick={() => setOffset(o => o - 1)} title="前の月" aria-label="前の月"><ChevronLeft size={18}/></button>
          <button className="button secondary" onClick={() => setOffset(0)} disabled={offset === 0}>今月</button>
          <button className="icon-btn" onClick={() => setOffset(o => o + 1)} title="次の月" aria-label="次の月"><ChevronRight size={18}/></button>
          <input type="month" value={monthValue} onChange={e => jumpTo(e.target.value)} aria-label="表示する月"/>
        </div>
        <div className="calendar-tools">
          <span className="legend"><i className="lg-self"/>自分の休み</span>
          <span className="legend"><i className="lg-company"/>会社の休み</span>
          <span className="legend"><i className="lg-due"/>タスク期限</span>
          {mode
            ? <div className="holiday-mode">{(["self", "company"] as const).map(k => <button key={k} className={mode === k ? `on ${k}` : ""} onClick={() => setMode(k)}>{KIND_LABEL[k]}</button>)}<button className="button primary" onClick={() => setMode(null)}><Check size={16}/>完了</button></div>
            : <button className="button secondary" onClick={() => setMode("self")}><CalendarPlus size={17}/>休みを登録</button>}
        </div>
      </div>
      {mode && <p className="holiday-hint">日付をクリックすると「{KIND_LABEL[mode]}」を登録・解除できます。</p>}
      <div className="month-grid">
        {months.map(first => {
          const y = first.getFullYear(), mo = first.getMonth();
          const start = new Date(y, mo, 1 - first.getDay());
          const weeks = Math.ceil((first.getDay() + new Date(y, mo + 1, 0).getDate()) / 7);
          const cells = Array.from({ length: weeks * 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
          const prefix = `${y}-${String(mo + 1).padStart(2, "0")}`;
          const tasks = dueTasks.filter(x => x.t.dueDate.startsWith(prefix));
          return <div className="month-card" key={prefix}>
            <h3>{y}年{mo + 1}月{prefix === today.slice(0, 7) && <span>今月</span>}</h3>
            <div className="cal-grid">
              {WEEK.map((w, i) => <b key={w} className={i === 0 ? "sun" : i === 6 ? "sat" : ""}>{w}</b>)}
              {cells.map(d => {
                const iso = toIsoDate(d), out = d.getMonth() !== mo, count = countByDate.get(iso) ?? 0, hol = holidayOf(iso);
                const cls = ["cal-day", out ? "out" : d.getDay() === 0 ? "sun" : d.getDay() === 6 ? "sat" : "", hol && !out ? `hol-${hol}` : "", !out && count > 0 ? "has-mtg" : "",
                  !out && dueDates.has(iso) ? "due" : "", iso === today ? "today" : "", !out && !mode && iso === selectedDay ? "selected" : ""].filter(Boolean).join(" ");
                return <button key={iso} className={cls} disabled={out} onClick={() => clickDay(iso)} title={mode ? undefined : iso === selectedDay ? "絞り込みを解除" : "この日の会議で絞り込む"}>
                  <span>{d.getDate()}</span>
                  {!out && count > 0 && <em>{count}件</em>}
                  {iso === today && <small>今日</small>}
                </button>;
              })}
            </div>
            <ul className="due-list">
              {tasks.length ? tasks.map(({ m, t }) => <li key={t.id}><button onClick={() => onOpen(m)}><strong>{Number(t.dueDate.slice(5, 7))}/{Number(t.dueDate.slice(8))}</strong><span>{t.title}</span><small>{m.title}</small></button></li>)
                : <li className="none">期限のあるタスクはありません</li>}
            </ul>
          </div>;
        })}
      </div>
    </section>
  );
}
