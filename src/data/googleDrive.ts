// Google Drive API v3 をブラウザから直接呼び出す薄いクライアント。
// 認証は Google Identity Services（トークンモデル）で行う。ページ更新で接続が切れないよう、
// アクセストークン（有効期限 1 時間）は期限付きで localStorage に保持し、接続解除・期限切れ・401 で破棄する。

export const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";
/** 保存先フォルダ ID（https://drive.google.com/drive/folders/<ID>） */
export const DRIVE_FOLDER_ID = process.env.NEXT_PUBLIC_DRIVE_FOLDER_ID || "1PY_kbloM5WmS6EL12vL5cnT4_J79mubf";
export const DATA_FILE_NAME = "meeting-hub-data.json";
// 既存フォルダ（アプリ外で作成されたもの）へ書き込むため drive スコープを使用する。drive.file では親フォルダが見えない。
const SCOPE = "https://www.googleapis.com/auth/drive";
const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";
const ALL_DRIVES = "supportsAllDrives=true";

export interface DriveFileMeta { id: string; modifiedTime: string }
export class DriveAuthError extends Error {}

interface TokenResponse { access_token?: string; expires_in?: number; error?: string; error_description?: string }
interface TokenClient { requestAccessToken(o?: { prompt?: string }): void }
interface GoogleOAuth2 {
  initTokenClient(c: { client_id: string; scope: string; hint?: string; callback: (r: TokenResponse) => void; error_callback?: (e: { type: string }) => void }): TokenClient;
  revoke(token: string, done?: () => void): void;
}
declare global { interface Window { google?: { accounts: { oauth2: GoogleOAuth2 } } } }

const TOKEN_KEY = "meeting-hub:drive-token", HINT_KEY = "meeting-hub:drive-account";
type Token = { value: string; expiresAt: number };
let token: Token | null = null;
let gisLoading: Promise<void> | null = null;

const storage = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* 保存できなくても動作は継続 */ } },
  remove: (k: string) => { try { localStorage.removeItem(k); } catch { /* noop */ } },
};
function setToken(t: Token | null) {
  token = t;
  if (t) storage.set(TOKEN_KEY, JSON.stringify(t)); else storage.remove(TOKEN_KEY);
}
/** ページ更新後も有効期限内なら前回のトークンを再利用する */
function currentToken(): Token | null {
  if (!token && typeof window !== "undefined") {
    try { token = JSON.parse(storage.get(TOKEN_KEY) ?? "null"); } catch { token = null; }
  }
  return token;
}

export function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  gisLoading ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { gisLoading = null; reject(new Error("Google のログイン用スクリプトを読み込めませんでした")); };
    document.head.appendChild(s);
  });
  return gisLoading;
}

export const isConfigured = () => Boolean(GOOGLE_CLIENT_ID);
export const hasValidToken = () => { const t = currentToken(); return Boolean(t && t.expiresAt > Date.now() + 60_000); };

/** Google アカウントでログインしてアクセストークンを取得する（ボタン操作など、ユーザー操作の中で呼ぶこと） */
export async function signIn(prompt: "" | "consent" | "select_account" = ""): Promise<void> {
  if (!GOOGLE_CLIENT_ID) throw new Error("NEXT_PUBLIC_GOOGLE_CLIENT_ID が設定されていません");
  await loadGis();
  await new Promise<void>((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: SCOPE,
      // 前回のアカウントを指定し、アカウント選択を省略する
      hint: storage.get(HINT_KEY) ?? undefined,
      callback: r => {
        if (r.error || !r.access_token) { reject(new Error(r.error_description || r.error || "ログインに失敗しました")); return; }
        setToken({ value: r.access_token, expiresAt: Date.now() + (r.expires_in ?? 3600) * 1000 });
        resolve();
      },
      error_callback: e => reject(new Error(e.type === "popup_closed" ? "ログイン画面が閉じられました" : e.type === "popup_failed_to_open" ? "ポップアップがブロックされました" : e.type)),
    });
    client.requestAccessToken({ prompt });
  });
}

export function signOut() {
  const t = currentToken();
  if (t && window.google) window.google.accounts.oauth2.revoke(t.value);
  setToken(null);
  storage.remove(HINT_KEY);
}

async function api(url: string, init: RequestInit = {}): Promise<Response> {
  if (!hasValidToken()) throw new DriveAuthError("Google Drive への再接続が必要です");
  const res = await fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token!.value}` } });
  if (res.status === 401) { setToken(null); throw new DriveAuthError("Google Drive への再接続が必要です"); }
  if (!res.ok) {
    let detail = "";
    try { detail = (await res.json())?.error?.message ?? ""; } catch { /* 本文なし */ }
    throw new Error(res.status === 404 ? "保存先フォルダまたはファイルが見つかりません（アクセス権を確認してください）" : `Google Drive エラー (${res.status}) ${detail}`);
  }
  return res;
}

/** 保存先フォルダの存在とアクセス権を確認し、フォルダ名を返す */
export async function getFolderName(): Promise<string> {
  const r = await api(`${API}/files/${DRIVE_FOLDER_ID}?fields=id,name,mimeType&${ALL_DRIVES}`);
  const f = await r.json();
  if (f.mimeType !== "application/vnd.google-apps.folder") throw new Error("指定された ID はフォルダではありません");
  return f.name;
}

/** 次回ログイン時のアカウント指定用に、接続中の Google アカウントを記録する */
export async function rememberAccount(): Promise<void> {
  try {
    const r = await api(`${API}/about?fields=user(emailAddress)`);
    const email = (await r.json())?.user?.emailAddress;
    if (email) storage.set(HINT_KEY, email);
  } catch { /* 取得できなくても同期には影響しない */ }
}

export async function findDataFile(): Promise<DriveFileMeta | null> {
  const q = encodeURIComponent(`name='${DATA_FILE_NAME}' and '${DRIVE_FOLDER_ID}' in parents and trashed=false`);
  const r = await api(`${API}/files?q=${q}&fields=files(id,modifiedTime)&orderBy=modifiedTime desc&pageSize=1&includeItemsFromAllDrives=true&${ALL_DRIVES}`);
  return (await r.json()).files?.[0] ?? null;
}

export async function getFileMeta(id: string): Promise<DriveFileMeta> {
  return (await api(`${API}/files/${id}?fields=id,modifiedTime&${ALL_DRIVES}`)).json();
}

export async function downloadFile(id: string): Promise<string> {
  return (await api(`${API}/files/${id}?alt=media&${ALL_DRIVES}`)).text();
}

export async function createFile(content: string): Promise<DriveFileMeta> {
  const boundary = "meeting-hub-" + crypto.randomUUID();
  const meta = { name: DATA_FILE_NAME, parents: [DRIVE_FOLDER_ID], mimeType: "application/json" };
  const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${content}\r\n--${boundary}--`;
  const r = await api(`${UPLOAD}/files?uploadType=multipart&fields=id,modifiedTime&${ALL_DRIVES}`, { method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body });
  return r.json();
}

export async function updateFile(id: string, content: string): Promise<DriveFileMeta> {
  const r = await api(`${UPLOAD}/files/${id}?uploadType=media&fields=id,modifiedTime&${ALL_DRIVES}`, { method: "PATCH", headers: { "Content-Type": "application/json; charset=UTF-8" }, body: content });
  return r.json();
}
