// Cloudflare Workers の API（/api/*）を呼び出す薄いクライアント。
// 認証は Cloudflare Access がページ全体で行うため、ここではクッキーをそのまま送るだけ。
import type { ChangeSet, RemoteData } from "./changes";

/** ログインの有効期限切れなど、ページの再読み込み（Access での再ログイン）が必要なエラー */
export class CloudAuthError extends Error {}
/** API が未設定（Access の設定前など） */
export class CloudConfigError extends Error {}
/** ネットワークにつながらない */
export class CloudOfflineError extends Error {}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    // Access のセッションが切れていると、ログイン画面へのリダイレクトが返る。追いかけずに検知する
    res = await fetch(path, { ...init, redirect: "manual", credentials: "same-origin", cache: "no-store", headers: { ...init.headers, Accept: "application/json" } });
  } catch {
    throw new CloudOfflineError("サーバーに接続できません（オフラインの可能性があります）");
  }
  if (res.type === "opaqueredirect" || res.status === 401 || res.status === 403) throw new CloudAuthError("ログインの有効期限が切れました");
  let body: { error?: string } & T;
  try { body = await res.json(); } catch { throw new Error(`サーバーエラー (${res.status})`); }
  if (res.status === 503) throw new CloudConfigError(body.error ?? "サーバーが未設定です");
  if (!res.ok) throw new Error(body.error ?? `サーバーエラー (${res.status})`);
  return body;
}

export const fetchRevision = () => api<{ revision: number }>("/api/revision").then(r => r.revision);
export const fetchData = () => api<RemoteData>("/api/data");
export const sendChanges = (changes: ChangeSet) =>
  api<RemoteData>("/api/changes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(changes) });
