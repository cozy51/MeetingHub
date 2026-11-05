import { useMemo, useState } from "react";
import { ArrowDownUp, CheckCircle2, Circle, Download, Search, Star } from "lucide-react";
import { Category, Meeting } from "@/types";
import { weekdayLabel, weekdayOf } from "@/lib/date";

type Order = "asc" | "desc";
const pad = (n: number) => String(n).padStart(2, "0");
const fmtDate = (s: string) => s.replaceAll("-", "/");
/** ISO 日時をローカル時刻の「YYYY/MM/DD HH:mm」にする */
const fmtDateTime = (iso?: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
/** 時系列の並び：日付 → 開始時刻（時刻なしはその日の最後） → 作成日時 */
const chrono = (a: Meeting, b: Meeting) =>
  a.date.localeCompare(b.date) || (a.startTime ?? "99:99").localeCompare(b.startTime ?? "99:99") || a.createdAt.localeCompare(b.createdAt);

/** CSV 用の列定義（表に表示している全項目） */
const csvColumns = (categories: Category[]): [string, (m: Meeting) => string][] => [
  ["日付", m => m.date],
  ["曜日", m => weekdayLabel(m.date)],
  ["開始", m => m.startTime ?? ""],
  ["終了", m => m.endTime ?? ""],
  ["議題", m => m.title],
  ["重要", m => (m.important ? "重要" : "")],
  ["分類", m => categories.find(c => c.id === m.category)?.name ?? m.category],
  ["場所", m => m.place],
  ["タグ", m => m.tags.join(" ")],
  ["メモ", m => m.memo ?? ""],
  ["リンク", m => m.links.map(l => `${l.title} ${l.url}`).join("\n")],
  ["タスク", m => m.tasks.map(t => `${t.completed ? "[完了]" : "[未完了]"} ${t.title}${t.dueDate ? `（期限 ${t.dueDate}）` : ""}`).join("\n")],
  ["案内メール", m => m.inviteMail ?? ""],
  ["終了記録", m => fmtDateTime(m.endedAt)],
  ["登録元", m => (m.icsUid ? "ICS" : "手動")],
  ["作成日時", m => fmtDateTime(m.createdAt)],
  ["更新日時", m => fmtDateTime(m.updatedAt)],
];
const csvCell = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v);

/** 会議の全項目を時系列で一覧できる表 */
export default function MeetingTable({ meetings, categories, onOpen }: { meetings: Meeting[]; categories: Category[]; onOpen: (m: Meeting) => void }) {
  const [order, setOrder] = useState<Order>("asc");
  const rows = useMemo(() => [...meetings].sort((a, b) => (order === "asc" ? chrono(a, b) : chrono(b, a))), [meetings, order]);
  const download = () => {
    const cols = csvColumns(categories);
    const lines = [cols.map(([h]) => h), ...rows.map(m => cols.map(([, f]) => f(m)))].map(r => r.map(csvCell).join(","));
    // Excel で文字化けしないよう BOM 付き UTF-8 にする
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `meeting-hub-table-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return <section className="list-section table-section">
    <div className="list-head"><div><h2>時系列表</h2><span>{rows.length}件</span></div>
      <div className="table-actions">
        <button className="sort" onClick={() => setOrder(order === "asc" ? "desc" : "asc")} title="並び順を切り替え"><ArrowDownUp size={14} />{order === "asc" ? "古い順" : "新しい順"}</button>
        <button className="sort" onClick={download} disabled={!rows.length} title="表示中の表を CSV で保存"><Download size={14} />CSV</button>
      </div>
    </div>
    {rows.length === 0 ? <div className="empty"><Search /><h3>会議が見つかりません</h3><p>検索語やフィルター条件を変更してください。</p></div> :
    <div className="table-scroll"><table className="meeting-table">
      <thead><tr><th>#</th><th>日付</th><th>開始</th><th>終了</th><th>議題</th><th>重要</th><th>分類</th><th>場所</th><th>タグ</th><th>メモ</th><th>リンク</th><th>タスク</th><th>案内メール</th><th>終了記録</th><th>登録元</th><th>作成日時</th><th>更新日時</th></tr></thead>
      <tbody>{rows.map((m, i) => {
        const cat = categories.find(c => c.id === m.category), wd = weekdayOf(m.date), newDay = i > 0 && rows[i - 1].date !== m.date;
        return <tr key={m.id} className={newDay ? "day-start" : ""}>
          <td className="num">{i + 1}</td>
          <td className="nowrap">{fmtDate(m.date)}<span className={`wd ${wd === 0 ? "sun" : wd === 6 ? "sat" : ""}`}>({weekdayLabel(m.date)})</span></td>
          <td className="nowrap num">{m.startTime ?? ""}</td>
          <td className="nowrap num">{m.endTime ?? ""}</td>
          <td className="title-cell"><button onClick={() => onOpen(m)} title="詳細を開く">{m.title || "（無題）"}</button></td>
          <td className="center">{m.important && <Star className="star" fill="currentColor" size={15} aria-label="重要" />}</td>
          <td className="nowrap"><span className={`badge ${cat?.color ?? "slate"}`}>{cat?.name ?? m.category}</span></td>
          <td className="nowrap">{m.place}</td>
          <td className="tags-cell">{m.tags.map(t => <span className="tag" key={t}>#{t}</span>)}</td>
          <td className="memo-cell">{m.memo}</td>
          <td className="links-cell">{m.links.map(l => <a key={l.id} href={l.url} target="_blank" rel="noreferrer" title={l.url}>{l.title || l.url}</a>)}</td>
          <td className="tasks-cell">{m.tasks.map(t => <div key={t.id} className={t.completed ? "done" : ""}>{t.completed ? <CheckCircle2 size={13} /> : <Circle size={13} />}<span>{t.title}{t.dueDate && <small>期限 {fmtDate(t.dueDate)}</small>}</span></div>)}</td>
          <td className="nowrap">{m.inviteMail && <a href={m.inviteMail} target="_blank" rel="noreferrer">開く</a>}</td>
          <td className="nowrap num">{fmtDateTime(m.endedAt)}</td>
          <td className="nowrap">{m.icsUid ? "ICS" : "手動"}</td>
          <td className="nowrap num">{fmtDateTime(m.createdAt)}</td>
          <td className="nowrap num">{fmtDateTime(m.updatedAt)}</td>
        </tr>;
      })}</tbody>
    </table></div>}
  </section>;
}
