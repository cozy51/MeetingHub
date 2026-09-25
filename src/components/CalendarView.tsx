import { useMemo, useState } from "react";
import { CalendarPlus, Check, Plus } from "lucide-react";
import { Category, Holiday, HolidayKind, Meeting, MeetingTask } from "@/types";
import { compareMeetings, parseIsoDate, toIsoDate, weekdayLabel } from "@/lib/date";
import MeetingCard from "./MeetingCard";

const WEEK = ["日", "月", "火", "水", "木", "金", "土"];
const KIND_LABEL: Record<HolidayKind, string> = { self: "自分の休み", company: "会社の休み" };

type Props = {
  meetings: Meeting[]; categories: Category[]; holidays: Holiday[]; today: string;
  setHolidays: (h: Holiday[]) => void; onOpen: (m: Meeting) => void; onAdd: (date: string) => void;
};

export default function CalendarView({ meetings, categories, holidays, today, setHolidays, onOpen, onAdd }: Props) {
  const [selected, setSelected] = useState(today);
  const [mode, setMode] = useState<HolidayKind | null>(null);
  const base = parseIsoDate(today);
  const months = [0, 1, 2].map(i => new Date(base.getFullYear(), base.getMonth() + i, 1));

  const byDate = useMemo(() => {
    const map = new Map<string, Meeting[]>();
    [...meetings].sort(compareMeetings).forEach(m => map.set(m.date, [...(map.get(m.date) ?? []), m]));
    return map;
  }, [meetings]);
  const dueTasks = useMemo(() => meetings.flatMap(m => m.tasks.filter(t => t.dueDate && !t.completed).map(t => ({ m, t: t as MeetingTask & { dueDate: string } })))
    .sort((a, b) => a.t.dueDate.localeCompare(b.t.dueDate)), [meetings]);
  const dueDates = new Set(dueTasks.map(x => x.t.dueDate));
  const holidayOf = (date: string) => holidays.find(h => h.date === date)?.kind;

  const clickDay = (date: string) => {
    if (!mode) { setSelected(date); return; }
    const current = holidayOf(date);
    const rest = holidays.filter(h => h.date !== date);
    setHolidays(current === mode ? rest : [...rest, { date, kind: mode }]);
  };

  const dayMeetings = byDate.get(selected) ?? [];
  const sel = parseIsoDate(selected);

  return <>
    <section className="calendar-board">
      <div className="calendar-head">
        <div><p className="eyebrow">今月から3か月</p><h2>Next 3 Months</h2></div>
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
                const iso = toIsoDate(d), out = d.getMonth() !== mo, count = byDate.get(iso)?.length ?? 0, hol = holidayOf(iso);
                const cls = ["cal-day", out ? "out" : d.getDay() === 0 ? "sun" : d.getDay() === 6 ? "sat" : "", hol && !out ? `hol-${hol}` : "",
                  !out && dueDates.has(iso) ? "due" : "", iso === today ? "today" : "", !out && !mode && iso === selected ? "selected" : ""].filter(Boolean).join(" ");
                return <button key={iso} className={cls} disabled={out} onClick={() => clickDay(iso)} title={hol ? KIND_LABEL[hol] : undefined}>
                  {!out && count > 0 && <em>{count}件</em>}
                  <span>{d.getDate()}</span>
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
    <section className="list-section day-list">
      <div className="list-head"><div><h2>{sel.getMonth() + 1}月{sel.getDate()}日 ({weekdayLabel(selected)}) の会議</h2><span>{dayMeetings.length}件</span></div><button className="sort" onClick={() => onAdd(selected)}><Plus size={15}/>この日に追加</button></div>
      <div className="meeting-list">
        {dayMeetings.map(m => <MeetingCard key={m.id} meeting={m} category={categories.find(c => c.id === m.category)} onClick={() => onOpen(m)}/>)}
        {dayMeetings.length === 0 && <div className="empty small"><p>この日の会議はありません</p></div>}
      </div>
    </section>
  </>;
}
