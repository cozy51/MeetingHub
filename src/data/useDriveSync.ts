import { useCallback, useEffect, useRef, useState } from "react";
import * as drive from "./googleDrive";

// Google Drive 上の 1 つの JSON ファイルを正本とし、localStorage はオフライン用キャッシュとして使う。
// - 接続時: Drive にファイルがあれば読み込み、なければ現在のデータで作成
// - 変更時: 少し待ってから Drive へ保存（他端末で更新されていれば確認）
// - 画面復帰時: 未保存の変更がなければ Drive の更新を取り込む
// - ページ更新時: 保存済みトークンが有効なら自動で再接続。期限切れなら、次のクリック・キー操作で自動的に取り直す
//   （ログイン用ポップアップはユーザー操作なしでは開けないため）

export type DriveStatus = "unconfigured" | "disconnected" | "connecting" | "syncing" | "saved" | "reauth" | "error";

interface SyncState { connected: boolean; fileId?: string; remoteModified?: string; dirty: boolean }
const KEY = "meeting-hub:drive";
const loadState = (): SyncState => { try { return { dirty: false, connected: false, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") }; } catch { return { dirty: false, connected: false }; } };
const saveState = (s: SyncState) => localStorage.setItem(KEY, JSON.stringify(s));
const SAVE_DELAY = 1200;

export function useDriveSync({ ready, snapshot, serialize, apply }: {
  ready: boolean;
  /** 保存対象データを表す文字列（変化検知用） */
  snapshot: string;
  /** Drive に書き込む内容 */
  serialize: () => string;
  /** Drive から読み込んだ内容を画面に反映し、反映後の snapshot を返す */
  apply: (raw: string) => string;
}) {
  const [status, setStatus] = useState<DriveStatus>("disconnected");
  const [message, setMessage] = useState("");
  const [folderName, setFolderName] = useState("");
  const [lastSynced, setLastSynced] = useState<string>();
  const state = useRef<SyncState>({ dirty: false, connected: false });
  const prevSnapshot = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const busy = useRef(false), connecting = useRef(false), autoTried = useRef(false);
  const serializeRef = useRef(serialize), applyRef = useRef(apply);
  serializeRef.current = serialize; applyRef.current = apply;

  const update = (patch: Partial<SyncState>) => { state.current = { ...state.current, ...patch }; saveState(state.current); };
  const fail = useCallback((e: unknown) => {
    if (e instanceof drive.DriveAuthError) { setStatus("reauth"); setMessage(e.message); }
    else { setStatus("error"); setMessage(e instanceof Error ? e.message : String(e)); }
  }, []);
  const done = (meta: drive.DriveFileMeta) => { update({ fileId: meta.id, remoteModified: meta.modifiedTime, dirty: false }); setStatus("saved"); setMessage(""); setLastSynced(meta.modifiedTime); };

  const pullFrom = async (meta: drive.DriveFileMeta) => {
    const raw = await drive.downloadFile(meta.id);
    clearTimeout(timer.current);
    // 反映によるデータ変化を「ローカルの変更」と誤検知しないよう、反映後の snapshot を既知にしておく
    prevSnapshot.current = applyRef.current(raw);
    done(meta);
  };

  const push = useCallback(async (force = false) => {
    if (busy.current || !state.current.connected || (!force && !state.current.dirty)) return;
    if (!drive.hasValidToken()) { setStatus("reauth"); setMessage("Google Drive への再接続が必要です"); return; }
    busy.current = true; setStatus("syncing");
    try {
      const { fileId, remoteModified } = state.current;
      if (!fileId) { done(await drive.createFile(serializeRef.current())); return; }
      const meta = await drive.getFileMeta(fileId);
      if (!force && meta.modifiedTime !== remoteModified && confirm("Google Drive 上のデータが他の端末で更新されています。\nOK：Drive の内容を読み込む（この端末の未保存の変更は破棄）\nキャンセル：この端末の内容で上書き保存")) { await pullFrom(meta); return; }
      done(await drive.updateFile(fileId, serializeRef.current()));
    } catch (e) { fail(e); } finally { busy.current = false; }
  }, [fail]);

  /** Drive から最新を取得（初回接続・再接続・画面復帰時）。ローカルを保存すべきなら true を返す */
  const reconcile = async (): Promise<boolean> => {
    setFolderName(await drive.getFolderName());
    const meta = state.current.fileId ? await drive.getFileMeta(state.current.fileId).catch(() => drive.findDataFile()) : await drive.findDataFile();
    if (!meta) { update({ fileId: undefined }); return true; }
    const remoteChanged = meta.modifiedTime !== state.current.remoteModified;
    if (!state.current.dirty) { if (remoteChanged || !state.current.fileId) await pullFrom(meta); else done(meta); return false; }
    update({ fileId: meta.id });
    if (!remoteChanged) return true;
    if (confirm("この端末に Google Drive へ未保存の変更があります。\nOK：Drive の内容を読み込む（この端末の変更は破棄）\nキャンセル：この端末の内容で Drive を上書き")) { await pullFrom(meta); return false; }
    return true;
  };

  const pull = useCallback(async () => {
    if (busy.current) return;
    busy.current = true; setStatus("syncing");
    let pushLocal = false;
    try { pushLocal = await reconcile(); } catch (e) { fail(e); } finally { busy.current = false; }
    if (pushLocal) await push(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fail, push]);

  const connect = useCallback(async () => {
    if (connecting.current) return;
    connecting.current = true;
    setStatus("connecting"); setMessage("");
    try {
      await drive.signIn(state.current.connected ? "" : "consent");
      update({ connected: true });
      void drive.rememberAccount();
      await pull();
    } catch (e) { setStatus(state.current.connected ? "reauth" : "disconnected"); setMessage(e instanceof Error ? e.message : String(e)); }
    finally { connecting.current = false; }
  }, [pull]);

  const disconnect = useCallback(() => {
    drive.signOut(); clearTimeout(timer.current);
    update({ connected: false }); setStatus("disconnected"); setMessage(""); setFolderName("");
  }, []);

  // 起動時: 以前接続していれば、保存済みトークンで自動再接続（期限切れなら再接続待ち）
  useEffect(() => {
    state.current = loadState();
    if (!drive.isConfigured()) setStatus("unconfigured");
    else if (state.current.connected) { setStatus(drive.hasValidToken() ? "connecting" : "reauth"); void drive.loadGis().catch(() => undefined); }
  }, []);
  useEffect(() => {
    if (ready && state.current.connected && drive.hasValidToken()) void pull();
  }, [ready, pull]);

  // 再接続待ちのとき、ページ上の最初のクリック・キー操作で自動的にトークンを取り直す（1 ページにつき 1 回）
  useEffect(() => {
    if (status !== "reauth" || autoTried.current) return;
    const onUser = () => { autoTried.current = true; remove(); void connect(); };
    const remove = () => { document.removeEventListener("pointerdown", onUser, true); document.removeEventListener("keydown", onUser, true); };
    document.addEventListener("pointerdown", onUser, true);
    document.addEventListener("keydown", onUser, true);
    return remove;
  }, [status, connect]);

  // データ変更の検知と保存予約
  useEffect(() => {
    if (!ready) return;
    if (prevSnapshot.current === null || prevSnapshot.current === snapshot) { prevSnapshot.current = snapshot; return; }
    prevSnapshot.current = snapshot;
    update({ dirty: true });
    if (!state.current.connected) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void push(), SAVE_DELAY);
  }, [snapshot, ready, push]);

  // 画面に戻ったとき、他端末での更新を取り込む
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible" && state.current.connected && drive.hasValidToken() && !state.current.dirty) void pull(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [pull]);

  // 未保存のまま閉じようとしたら警告
  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => { if (state.current.connected && state.current.dirty) e.preventDefault(); };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, []);

  return { status, message, autoReconnect: status === "reauth" && !autoTried.current, folderName, lastSynced, connect, disconnect, syncNow: () => (drive.hasValidToken() ? pull() : connect()) };
}
