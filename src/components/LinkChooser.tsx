import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { ExternalLink, FileText, MessageSquare, X } from "lucide-react";
import { LinkGroup } from "@/lib/links";

/** 同名リンクが複数あるときに、開くリンクを選ぶダイアログ */
export default function LinkChooser({ group, onClose }: { group: LinkGroup; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    // 親カードのキー処理で伝播が止まっても拾えるよう、キャプチャ段階で受け取る
    window.addEventListener("keydown", onKey, true);
    first.current?.focus();
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);
  const first = useRef<HTMLAnchorElement>(null);
  const Icon = group.type === "teams" ? MessageSquare : FileText;
  // ポータルでもイベントは React ツリー上で親カードへ伝わるため、ここで止める
  return createPortal(
    <div className="overlay form-overlay" onClick={e => { e.stopPropagation(); if (e.target === e.currentTarget) onClose(); }} onKeyDown={e => e.stopPropagation()}>
      <div className="link-chooser" role="dialog" aria-modal="true" aria-label={`${group.title} のリンク`}>
        <div className="chooser-head"><h2>{group.title} のリンク</h2><button onClick={onClose} aria-label="閉じる"><X /></button></div>
        <p>{group.items.length}件あります。開くリンクを選んでください。</p>
        <ul>
          {group.items.map((l, i) => <li key={l.id}>
            <a ref={i === 0 ? first : undefined} href={l.url} target="_blank" rel="noreferrer" onClick={onClose} className={l.type}>
              <b>({i + 1})</b>
              <span><strong><Icon size={14} />{l.title} ({i + 1})</strong><small>{l.url}</small></span>
              <ExternalLink size={16} />
            </a>
          </li>)}
        </ul>
      </div>
    </div>, document.body);
}
