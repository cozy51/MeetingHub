import { LinkType, MeetingLink } from "@/types";

/** テキストから http(s) の URL をすべて取り出す（末尾の句読点・括弧は除く） */
export function extractUrls(text: string): string[] {
  const found = text.match(/https?:\/\/[^\s<>"'「」、，,]+/g) ?? [];
  return [...new Set(found.map(u => u.replace(/[)\]}.。]+$/, "")))];
}

type Rule = { test: (u: URL, path: string) => boolean; title: string | ((u: URL, path: string) => string); type: LinkType };
const host = (u: URL, ...names: string[]) => names.some(n => u.hostname === n || u.hostname.endsWith("." + n));

// SharePoint / OneDrive の共有リンク（/:w:/ 等）や拡張子から Office の種類を判定
const officeTitle = (_: URL, path: string) =>
  /\/:w:\/|\.docx?(\b|$)/.test(path) ? "Word" :
  /\/:x:\/|\.xlsx?m?(\b|$)/.test(path) ? "Excel" :
  /\/:p:\/|\.pptx?(\b|$)/.test(path) ? "PowerPoint" :
  /\/:b:\/|\.pdf(\b|$)/.test(path) ? "PDF" :
  /\/:o:\/|onenote/.test(path) ? "OneNote" :
  /\/:f:\/|\/folders?\b/.test(path) ? "SharePointフォルダ" : "SharePoint資料";

// 上から順に最初に一致したルールを採用する
const RULES: Rule[] = [
  { test: (u, p) => host(u, "teams.microsoft.com", "teams.live.com", "teams.cloud.microsoft") && /meetingrecap/.test(p), title: "Teamsまとめ", type: "teams" },
  { test: (u, p) => host(u, "teams.microsoft.com", "teams.live.com", "teams.cloud.microsoft") && /meetup-join|\/meet\//.test(p), title: "Teams参加", type: "teams" },
  { test: (u, p) => host(u, "teams.microsoft.com", "teams.live.com", "teams.cloud.microsoft") && /\/l\/(message|chat)\//.test(p), title: "Teamsチャット", type: "teams" },
  { test: (u, p) => host(u, "teams.microsoft.com", "teams.live.com", "teams.cloud.microsoft") && /\/l\/channel\//.test(p), title: "Teamsチャネル", type: "teams" },
  { test: (u, p) => host(u, "teams.microsoft.com", "teams.live.com", "teams.cloud.microsoft") && /\/l\/file\//.test(p), title: "Teamsファイル", type: "document" },
  { test: u => host(u, "teams.microsoft.com", "teams.live.com", "teams.cloud.microsoft"), title: "Teams", type: "teams" },
  { test: (u, p) => host(u, "sharepoint.com", "onedrive.live.com", "1drv.ms") && /\.(mp4|mov|m4a)(\b|$)|stream\.aspx/.test(p), title: "会議の録画", type: "other" },
  { test: u => host(u, "sharepoint.com", "onedrive.live.com", "1drv.ms"), title: officeTitle, type: "document" },
  { test: u => host(u, "canva.link", "canva.com"), title: "CanvaDoc", type: "document" },
  { test: u => host(u, "notta.ai"), title: "Notta", type: "document" },
  { test: (u, p) => host(u, "docs.google.com") && p.startsWith("/document"), title: "Googleドキュメント", type: "document" },
  { test: (u, p) => host(u, "docs.google.com") && p.startsWith("/spreadsheets"), title: "Googleスプレッドシート", type: "document" },
  { test: (u, p) => host(u, "docs.google.com") && p.startsWith("/presentation"), title: "Googleスライド", type: "document" },
  { test: (u, p) => host(u, "docs.google.com") && p.startsWith("/forms"), title: "Googleフォーム", type: "document" },
  { test: u => host(u, "drive.google.com"), title: "Googleドライブ", type: "document" },
  { test: u => host(u, "meet.google.com"), title: "Google Meet参加", type: "other" },
  { test: u => host(u, "zoom.us"), title: "Zoom参加", type: "other" },
  { test: u => host(u, "webex.com"), title: "Webex参加", type: "other" },
  { test: u => host(u, "figma.com"), title: "Figma", type: "document" },
  { test: u => host(u, "miro.com"), title: "Miro", type: "document" },
  { test: u => host(u, "notion.so", "notion.site"), title: "Notion", type: "document" },
  { test: u => host(u, "loom.com"), title: "Loom", type: "other" },
  { test: u => host(u, "youtube.com", "youtu.be"), title: "YouTube", type: "other" },
  { test: u => host(u, "github.com"), title: "GitHub", type: "document" },
];

/** URL の特徴（ドメイン・パス）からリンク名と種類を推定する */
export function detectLink(url: string): { title: string; type: LinkType } {
  let u: URL;
  try { u = new URL(url); } catch { return { title: "リンク", type: "other" }; }
  let path = u.pathname + u.search;
  try { path = decodeURIComponent(path); } catch { /* 不正なエスケープはそのまま */ }
  path = path.toLowerCase();
  const rule = RULES.find(r => r.test(u, path));
  if (!rule) return { title: u.hostname.replace(/^www\./, ""), type: "other" };
  return { title: typeof rule.title === "function" ? rule.title(u, path) : rule.title, type: rule.type };
}

/** クリップボードのテキストを読む（未対応・拒否時は貼り付け用の入力欄にフォールバック） */
export async function readClipboardText(): Promise<string> {
  try {
    if (navigator.clipboard?.readText) return await navigator.clipboard.readText();
  } catch { /* 権限拒否など */ }
  return window.prompt("クリップボードを読み取れませんでした。URL を貼り付けてください") ?? "";
}

/** クリップボード内の URL から、既存リンクと重複しない新しいリンクを作る */
export function linksFromText(text: string, existing: MeetingLink[]): MeetingLink[] {
  return extractUrls(text).filter(url => !existing.some(l => l.url === url)).map(url => ({ id: crypto.randomUUID(), url, ...detectLink(url) }));
}

// 表示順：Teams参加 → CanvaDoc → その他（登録順）→ Notta → Googleドライブ → Teamsまとめ
const LINK_ORDER: Record<string, number> = { "Teams参加": 0, "CanvaDoc": 1, "Notta": 3, "Googleドライブ": 4, "Teamsまとめ": 5 };
const DEFAULT_ORDER = 2;
/** リンク名ではなく URL の種類で並べる（名前を変えても順序は保たれる）。元の配列は変更しない */
export function sortLinksForDisplay<T extends Pick<MeetingLink, "url">>(links: T[]): T[] {
  return links.map((l, i) => ({ l, i, r: LINK_ORDER[detectLink(l.url).title] ?? DEFAULT_ORDER }))
    .sort((a, b) => a.r - b.r || a.i - b.i).map(x => x.l);
}

// カード上のリンクバッジでは長い名前を短縮して表示する（詳細パネルでは正式名のまま）
const BADGE_LABEL: Record<string, string> = { "Googleドライブ": "G-Drv" };
export const badgeLabel = (title: string) => BADGE_LABEL[title] ?? title;

export interface LinkGroup { title: string; type: LinkType; items: MeetingLink[] }
/** 表示順に並べたうえで、同じ名前のリンクを 1 つのグループにまとめる（グループ内は登録順） */
export function groupLinksForDisplay(links: MeetingLink[]): LinkGroup[] {
  const groups: LinkGroup[] = [];
  for (const l of sortLinksForDisplay(links)) {
    const g = groups.find(x => x.title === l.title);
    if (g) g.items.push(l); else groups.push({ title: l.title, type: l.type, items: [l] });
  }
  return groups;
}
/** 同名リンクが複数あるときだけ「名前 (n)」と番号を付けた表示名を返す */
export function numberedLinks(links: MeetingLink[]): { link: MeetingLink; label: string; index?: number }[] {
  return groupLinksForDisplay(links).flatMap(g => g.items.map((link, i) => g.items.length > 1 ? { link, label: `${g.title} (${i + 1})`, index: i + 1 } : { link, label: g.title }));
}
