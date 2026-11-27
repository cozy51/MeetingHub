import { useCallback, useEffect, useRef, useState } from "react";
import * as cloud from "./cloud";
import { ChangeSet, DataSet, diff, isEmpty, rebase, RemoteData } from "./changes";

// Cloudflare D1 を正本とし、localStorage はオフライン用キャッシュとして使う。
// - 「前回サーバーと一致した内容（base）」を保持し、現在の内容との差分（レコード単位）だけを送る
// - サーバーの最新に未送信の変更を重ねて反映するので、他端末が別の会議を編集していても上書きしない
// - 画面復帰時・オンライン復帰時・一定間隔で版番号を確認し、他端末の更新を取り込む

export type CloudStatus = "connecting" | "syncing" | "saved" | "offline" | "reauth" | "unconfigured" | "error";

interface SyncState { base: DataSet | null; revision: number }
const KEY = "meeting-hub:cloud";
const loadState = (): SyncState => { try { return { base: null, revision: 0, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") }; } catch { return { base: null, revision: 0 }; } };
const saveState = (s: SyncState) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* 容量不足でも同期自体は継続 */ } };
const SAVE_DELAY = 800, POLL_INTERVAL = 60_000, RETRY_DELAY = 15_000;

export function useCloudSync({ ready, data, apply }: {
  ready: boolean;
  /** 現在の画面上のデータ */
  data: DataSet;
  /** サーバーから受け取ったデータ（未送信の変更を反映済み）を画面に反映する */
  apply: (d: DataSet) => void;
}) {
  const [status, setStatus] = useState<CloudStatus>("connecting");
  const [message, setMessage] = useState("");
  const [user, setUser] = useState("");
  const [lastSynced, setLastSynced] = useState<string>();
  const [dirty, setDirty] = useState(false);
  const state = useRef<SyncState>({ base: null, revision: 0 });
  const dataRef = useRef(data), applyRef = useRef(apply);
  dataRef.current = data; applyRef.current = apply;
  const busy = useRef(false), again = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const fail = useCallback((e: unknown) => {
    setMessage(e instanceof Error ? e.message : String(e));
    if (e instanceof cloud.CloudAuthError) setStatus("reauth");
    else if (e instanceof cloud.CloudConfigError) setStatus("unconfigured");
    else if (e instanceof cloud.CloudOfflineError) setStatus("offline");
    else setStatus("error");
  }, []);

  /** サーバーの内容を取り込む。sent は送信時点の手元データ（送信中に行われた編集だけを未送信として残す） */
  const adopt = (remote: RemoteData, sent: DataSet) => {
    const { revision, user: u, ...rest } = remote;
    const pending = diff(sent, dataRef.current);
    const merged = isEmpty(pending) ? rest : rebase(rest, pending);
    state.current = { base: rest, revision };
    saveState(state.current);
    if (u) setUser(u);
    applyRef.current(merged);
    setLastSynced(new Date().toISOString());
    return !isEmpty(pending);
  };

  /** 未送信の変更を送り、サーバーの最新を取り込む。変更がなければ版番号だけ確認する */
  const sync = useCallback(async (opts: { check?: boolean } = {}) => {
    if (busy.current) { again.current = true; return; }
    busy.current = true;
    clearTimeout(timer.current);
    let more = false;
    try {
      const { base } = state.current;
      const sent = dataRef.current;
      if (!base) {
        // この端末で初めての同期: サーバーにデータがあれば採用し、空なら手元のデータを登録する
        setStatus("connecting");
        const remote = await cloud.fetchData();
        const empty = !remote.meetings.length && !remote.categories.length && !remote.holidays.length;
        // サーバーにデータがあれば手元（新しい端末ではサンプルデータ）は破棄する
        more = adopt(empty ? await cloud.sendChanges(diff({ meetings: [], categories: [], holidays: [] }, sent)) : remote, sent);
      } else {
        const changes: ChangeSet = diff(base, sent);
        if (!isEmpty(changes)) { setStatus("syncing"); more = adopt(await cloud.sendChanges(changes), sent); }
        else if (opts.check !== false) {
          const revision = await cloud.fetchRevision();
          if (revision !== state.current.revision) more = adopt(await cloud.fetchData(), sent);
          else setLastSynced(new Date().toISOString());
        }
      }
      setStatus("saved"); setMessage("");
    } catch (e) {
      fail(e);
      // 一時的な障害なら少し待って再試行する（再ログインが必要な場合は待つ）
      if (!(e instanceof cloud.CloudAuthError) && !(e instanceof cloud.CloudConfigError)) timer.current = setTimeout(() => void syncRef.current(), RETRY_DELAY);
    } finally {
      busy.current = false;
      setDirty(state.current.base ? !isEmpty(diff(state.current.base, dataRef.current)) : true);
    }
    if (more || again.current) { again.current = false; timer.current = setTimeout(() => void syncRef.current({ check: false }), SAVE_DELAY); }
  }, [fail]);
  const syncRef = useRef(sync);
  syncRef.current = sync;

  // 起動時: 前回の同期状態を読み込み、サーバーと同期する
  useEffect(() => {
    if (!ready) return;
    state.current = loadState();
    void sync();
  }, [ready, sync]);

  // データ変更の検知と保存予約（サーバーと一致していれば何もしない）
  useEffect(() => {
    if (!ready || !state.current.base) return;
    const changed = !isEmpty(diff(state.current.base, data));
    setDirty(changed);
    if (!changed || status === "reauth" || status === "unconfigured") return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void syncRef.current({ check: false }), SAVE_DELAY);
  }, [data, ready, status]);

  // 画面復帰時・オンライン復帰時・一定間隔で他端末の更新を取り込む
  useEffect(() => {
    if (!ready) return;
    const onVisible = () => { if (document.visibilityState === "visible") void syncRef.current(); };
    const onOnline = () => void syncRef.current();
    const poll = setInterval(() => { if (document.visibilityState === "visible" && !busy.current) void syncRef.current(); }, POLL_INTERVAL);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => { clearInterval(poll); document.removeEventListener("visibilitychange", onVisible); window.removeEventListener("online", onOnline); };
  }, [ready]);

  // 未保存のまま閉じようとしたら警告
  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault(); };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [dirty]);

  return {
    status, message, user, lastSynced, dirty, revision: state.current.revision,
    syncNow: () => void sync(),
    /** Cloudflare Access で再ログインする（ページを再読み込みするとログイン画面に移る） */
    relogin: () => location.reload(),
  };
}
