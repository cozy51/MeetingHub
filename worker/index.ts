// Meeting Hub の API（Cloudflare Workers + D1）。
// /api/* 以外のリクエストは wrangler.jsonc の assets 設定により静的ファイルとして配信される。
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { ChangeSet, RemoteData } from "../src/data/changes";
import type { Category, Holiday, Meeting } from "../src/types";

interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  /** ローカル開発用（.dev.vars で "1" を設定）。本番では設定しないこと */
  DEV_AUTH_BYPASS?: string;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });

// ---- 認証（Cloudflare Access の JWT を検証） ----
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
class AuthError extends Error { constructor(message: string, readonly status = 401) { super(message); } }

async function authenticate(req: Request, env: Env): Promise<string> {
  if (env.DEV_AUTH_BYPASS === "1") return "dev@localhost";
  const team = env.ACCESS_TEAM_DOMAIN?.replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (!team || !env.ACCESS_AUD) throw new AuthError("Cloudflare Access が未設定です（ACCESS_TEAM_DOMAIN / ACCESS_AUD）", 503);
  const cookie = req.headers.get("Cookie")?.match(/(?:^|;\s*)CF_Authorization=([^;]+)/)?.[1];
  const token = req.headers.get("Cf-Access-Jwt-Assertion") ?? cookie;
  if (!token) throw new AuthError("ログインが必要です");
  let jwks = jwksCache.get(team);
  if (!jwks) { jwks = createRemoteJWKSet(new URL(`https://${team}/cdn-cgi/access/certs`)); jwksCache.set(team, jwks); }
  try {
    const { payload } = await jwtVerify(token, jwks, { issuer: `https://${team}`, audience: env.ACCESS_AUD });
    return typeof payload.email === "string" ? payload.email : String(payload.sub ?? "");
  } catch {
    throw new AuthError("ログインの有効期限が切れました");
  }
}

// ---- データ ----
async function revision(db: D1Database): Promise<number> {
  return (await db.prepare("SELECT value FROM sync_meta WHERE key = 'revision'").first<number>("value")) ?? 0;
}

async function loadAll(db: D1Database, user?: string): Promise<RemoteData> {
  const [m, c, h, r] = await db.batch([
    db.prepare("SELECT data FROM meetings ORDER BY date DESC, id"),
    db.prepare("SELECT data FROM categories ORDER BY sort, id"),
    db.prepare("SELECT date, kind FROM holidays ORDER BY date, kind"),
    db.prepare("SELECT value FROM sync_meta WHERE key = 'revision'"),
  ]);
  return {
    revision: (r.results[0] as { value: number } | undefined)?.value ?? 0,
    meetings: (m.results as { data: string }[]).map(x => JSON.parse(x.data) as Meeting),
    categories: (c.results as { data: string }[]).map(x => JSON.parse(x.data) as Category),
    holidays: h.results as unknown as Holiday[],
    user,
  };
}

const str = (v: unknown) => typeof v === "string";
function validate(body: unknown): ChangeSet {
  const b = body as ChangeSet;
  const ok = b && typeof b === "object"
    && Array.isArray(b.meetings?.put) && Array.isArray(b.meetings?.del)
    && Array.isArray(b.categories?.put) && Array.isArray(b.categories?.del)
    && Array.isArray(b.holidays?.put) && Array.isArray(b.holidays?.del)
    && b.meetings.put.every(m => str(m?.id) && str(m?.date) && str(m?.title)) && b.meetings.del.every(str)
    && b.categories.put.every(c => str(c?.id) && Number.isInteger(c?.sort)) && b.categories.del.every(str)
    && [...b.holidays.put, ...b.holidays.del].every(h => str(h?.date) && str(h?.kind));
  if (!ok) throw new AuthError("リクエストの形式が正しくありません", 400);
  return b;
}

// D1 は 1 回の呼び出しあたりのクエリ数と 1 値あたりのサイズ（2MB）に上限があるため、
// レコードを 1 件ずつ送らず、JSON 配列を json_each で展開してまとめて処理する（大きい場合は分割）
const CHUNK_BYTES = 1_000_000;
function chunks<T>(items: T[]): string[] {
  const out: string[] = [];
  let cur: string[] = [], size = 0;
  for (const x of items) {
    const j = JSON.stringify(x);
    if (cur.length && size + j.length > CHUNK_BYTES) { out.push(`[${cur.join(",")}]`); cur = []; size = 0; }
    cur.push(j); size += j.length + 1;
  }
  if (cur.length) out.push(`[${cur.join(",")}]`);
  return out;
}

async function applyChanges(db: D1Database, c: ChangeSet): Promise<void> {
  const now = new Date().toISOString();
  const stmts: D1PreparedStatement[] = [];
  const add = <T>(items: T[], sql: string, withTime = false) => { for (const j of chunks(items)) stmts.push(withTime ? db.prepare(sql).bind(j, now) : db.prepare(sql).bind(j)); };
  add(c.meetings.put, `INSERT INTO meetings (id, date, title, data, updated_at)
    SELECT json_extract(value, '$.id'), json_extract(value, '$.date'), json_extract(value, '$.title'), value, ?2 FROM json_each(?1) WHERE true
    ON CONFLICT(id) DO UPDATE SET date = excluded.date, title = excluded.title, data = excluded.data, updated_at = excluded.updated_at`, true);
  add(c.meetings.del, "DELETE FROM meetings WHERE id IN (SELECT value FROM json_each(?1))");
  add(c.categories.put, `INSERT INTO categories (id, sort, data, updated_at)
    SELECT json_extract(value, '$.id'), json_extract(value, '$.sort'), json_remove(value, '$.sort'), ?2 FROM json_each(?1) WHERE true
    ON CONFLICT(id) DO UPDATE SET sort = excluded.sort, data = excluded.data, updated_at = excluded.updated_at`, true);
  add(c.categories.del, "DELETE FROM categories WHERE id IN (SELECT value FROM json_each(?1))");
  add(c.holidays.put, `INSERT OR REPLACE INTO holidays (date, kind, updated_at)
    SELECT json_extract(value, '$.date'), json_extract(value, '$.kind'), ?2 FROM json_each(?1)`, true);
  add(c.holidays.del, `DELETE FROM holidays WHERE date || ':' || kind IN
    (SELECT json_extract(value, '$.date') || ':' || json_extract(value, '$.kind') FROM json_each(?1))`);
  if (!stmts.length) return;
  stmts.push(db.prepare("UPDATE sync_meta SET value = value + 1 WHERE key = 'revision'"));
  // batch は 1 つのトランザクションとして実行される（途中で失敗すれば全体が取り消される）
  await db.batch(stmts);
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(req.url);
    if (!pathname.startsWith("/api/")) return env.ASSETS.fetch(req);
    try {
      const user = await authenticate(req, env);
      if (pathname === "/api/revision" && req.method === "GET") return json({ revision: await revision(env.DB) });
      if (pathname === "/api/data" && req.method === "GET") return json(await loadAll(env.DB, user));
      if (pathname === "/api/changes" && req.method === "POST") {
        let body: unknown;
        try { body = await req.json(); } catch { throw new AuthError("JSON を読み取れません", 400); }
        await applyChanges(env.DB, validate(body));
        return json(await loadAll(env.DB, user));
      }
      return json({ error: "Not Found" }, 404);
    } catch (e) {
      if (e instanceof AuthError) return json({ error: e.message }, e.status);
      console.error(e);
      return json({ error: e instanceof Error ? e.message : String(e) }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
