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

/** 会議のステータス（開催前・開催中・終了）と、開始まで／終了までの残り時間 */
export function Countdown({ meeting: m }: { meeting: Meeting }) {
  const now = useNow();
  if (!now || !m.startTime) return null;
  const start = new Date(`${m.date}T${m.startTime}:00`).getTime();
  const end = m.endTime ? new Date(`${m.date}T${m.endTime}:00`).getTime() : undefined;
  const t = now.getTime();
  if (t < start) return <span className="countdown upcoming"><i>開催前</i>開始まで <b>{duration(start - t)}</b></span>;
  if (end !== undefined && t < end) return <span className="countdown live"><i>開催中</i>残り <b>{duration(end - t)}</b></span>;
  return <span className="countdown ended"><i>{end === undefined ? "開始済み" : "終了"}</i></span>;
}
