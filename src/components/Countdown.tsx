import { useEffect, useState } from "react";
import { Meeting } from "@/types";

/** 1秒ごとに現在時刻を返す（サーバー描画との不一致を避けるため、マウント後に開始する） */
function useNow() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

const pad = (n: number) => String(n).padStart(2, "0");
/** ミリ秒を「h:mm:ss」（1時間未満は「mm:ss」）にする */
const duration = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600);
  return `${h ? `${h}:` : ""}${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
};

/** 現在時刻（秒まで）の表示 */
export function NowClock() {
  const now = useNow();
  if (!now) return null;
  return <span className="now-clock" aria-live="off">現在 <b>{pad(now.getHours())}:{pad(now.getMinutes())}:{pad(now.getSeconds())}</b></span>;
}

/** 会議のステータス（開催前・開催中・終了）と、開始まで／終了までの残り時間。onEnd があれば開催中の会議を手動で終了にできる */
export function Countdown({ meeting: m, onEnd }: { meeting: Meeting; onEnd?: (endedAt: string | undefined) => void }) {
  const now = useNow();
  if (!now || !m.startTime) return null;
  const start = new Date(`${m.date}T${m.startTime}:00`).getTime();
  const end = m.endTime ? new Date(`${m.date}T${m.endTime}:00`).getTime() : undefined;
  const t = now.getTime();
  // カードのクリック（詳細を開く）に伝わらないようにする
  const act = (endedAt: string | undefined) => (e: React.SyntheticEvent) => { e.stopPropagation(); onEnd?.(endedAt); };
  const stop = (e: React.KeyboardEvent) => e.stopPropagation();
  if (t < start) return <span className="countdown upcoming"><i>開催前</i>開始まで <b>{duration(start - t)}</b></span>;
  const ended = m.endedAt && new Date(m.endedAt).getTime() >= start ? new Date(m.endedAt) : undefined;
  if (ended) return <span className="countdown ended" title={`${pad(ended.getHours())}:${pad(ended.getMinutes())} に手動で終了`}><i>終了</i>{onEnd && (end === undefined || t < end) && <button type="button" className="countdown-action" onClick={act(undefined)} onKeyDown={stop} title="終了を取り消して開催中に戻す">戻す</button>}</span>;
  if (end !== undefined && t < end) return <span className="countdown live"><i>開催中</i>残り <b>{duration(end - t)}</b>（{Math.floor((t - start) / (end - start) * 100)}%）{onEnd && <button type="button" className="countdown-action" onClick={act(now.toISOString())} onKeyDown={stop} title="会議が早く終わったので終了にする">終了</button>}</span>;
  return <span className="countdown ended"><i>{end === undefined ? "開始済み" : "終了"}</i>{onEnd && end === undefined && <button type="button" className="countdown-action" onClick={act(now.toISOString())} onKeyDown={stop} title="会議を終了にする">終了</button>}</span>;
}
