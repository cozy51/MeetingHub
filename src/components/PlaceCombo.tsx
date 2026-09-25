import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

/** 直接入力もできる場所のコンボボックス（候補は開くと全件表示、入力中は絞り込み） */
export default function PlaceCombo({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: string[] }) {
  const [open, setOpen] = useState(false), [typing, setTyping] = useState(false), [active, setActive] = useState(-1);
  const box = useRef<HTMLDivElement>(null), input = useRef<HTMLInputElement>(null);
  const q = value.trim().toLowerCase();
  const list = typing && q ? options.filter(o => o.toLowerCase().includes(q)) : options;
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const pick = (v: string) => { onChange(v); setOpen(false); setTyping(false); setActive(-1); input.current?.focus(); };
  return <div className="combo" ref={box}>
    <input ref={input} required role="combobox" aria-expanded={open} aria-autocomplete="list" placeholder="Teams、会議室名など" value={value}
      onChange={e => { onChange(e.target.value); setTyping(true); setOpen(true); setActive(-1); }}
      onKeyDown={e => {
        if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive(a => Math.min(a + 1, list.length - 1)); }
        else if (e.key === "ArrowUp") { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
        else if (e.key === "Enter" && open && active >= 0 && list[active]) { e.preventDefault(); pick(list[active]); }
        else if (e.key === "Escape" && open) { e.preventDefault(); e.stopPropagation(); setOpen(false); }
      }} />
    <button type="button" tabIndex={-1} aria-label="候補を表示" onClick={() => { setTyping(false); setOpen(o => !o); input.current?.focus(); }}><ChevronDown size={18} /></button>
    {open && list.length > 0 && <ul role="listbox">
      {list.map((o, i) => <li key={o} role="option" aria-selected={o === value} className={`${i === active ? "active" : ""} ${o === value ? "current" : ""}`} onMouseDown={e => { e.preventDefault(); pick(o); }}>{o}</li>)}
    </ul>}
  </div>;
}
