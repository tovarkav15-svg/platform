"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { TopBar } from "../TopBar";
import { PRIVACY_META, PRIVACY_TEXT } from "@/lib/legal/privacy";

type Block =
  | { t: "p"; text: string }
  | { t: "ul"; items: string[] }
  | { t: "dl"; rows: [string, string][] };
type Clause = { num: string; title: string; blocks: Block[] };
type Section = { id: string; num: string; title: string; intro: Block[]; clauses: Clause[] };

/** Разбор простой разметки документа (см. lib/legal/privacy.ts) */
function parse(src: string) {
  const intro: Block[] = [];
  const sections: Section[] = [];
  let cur: Block[] = intro;
  let para: string[] = [];
  const flush = () => { if (para.length) { cur.push({ t: "p", text: para.join(" ") }); para = []; } };
  for (const raw of src.split("\n")) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^## (\d+)\.\s+(.+)$/))) {
      flush();
      const s: Section = { id: `s${m[1]}`, num: m[1], title: m[2], intro: [], clauses: [] };
      sections.push(s);
      cur = s.intro;
    } else if ((m = line.match(/^### (\d+\.\d+)\.?\s*(.*)$/))) {
      flush();
      const c: Clause = { num: m[1], title: m[2], blocks: [] };
      sections[sections.length - 1].clauses.push(c);
      cur = c.blocks;
    } else if (line.startsWith("- ")) {
      flush();
      const last = cur[cur.length - 1];
      if (last?.t === "ul") last.items.push(line.slice(2)); else cur.push({ t: "ul", items: [line.slice(2)] });
    } else if (line.includes(" :: ")) {
      flush();
      const [k, v] = line.split(" :: ");
      const last = cur[cur.length - 1];
      if (last?.t === "dl") last.rows.push([k, v]); else cur.push({ t: "dl", rows: [[k, v]] });
    } else {
      para.push(line);
    }
  }
  flush();
  return { intro, sections };
}

/** Почта и адреса — ссылками, {{?…}} — пометкой «уточняется» */
function Rich({ text }: { text: string }) {
  const parts = text.split(/(\{\{\?[^}]+\}\}|[\w.+-]+@[\w-]+\.[\w.]+|https?:\/\/[^\s]+)/g);
  return (
    <>
      {parts.map((p, i) => {
        if (!p) return null;
        if (p.startsWith("{{?")) return <span key={i} className="lg-todo" title={`Нужно указать: ${p.slice(3, -2)}`}>уточняется</span>;
        if (/^https?:\/\//.test(p)) return <a key={i} href={p} target="_blank" rel="noopener noreferrer">{p.replace(/^https?:\/\//, "").replace(/\/$/, "")}</a>;
        if (/^[\w.+-]+@[\w-]+\.[\w.]+$/.test(p)) return <a key={i} href={`mailto:${p}`}>{p}</a>;
        return <span key={i}>{p}</span>;
      })}
    </>
  );
}

function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((b, i) =>
        b.t === "p" ? <p key={i}><Rich text={b.text} /></p>
        : b.t === "ul" ? <ul key={i}>{b.items.map((it, k) => <li key={k}><Rich text={it} /></li>)}</ul>
        : <dl key={i} className="lg-dl">{b.rows.map(([k, v], r) => <div key={r}><dt>{k}</dt><dd><Rich text={v} /></dd></div>)}</dl>,
      )}
    </>
  );
}

export default function PrivacyPage() {
  const doc = useMemo(() => parse(PRIVACY_TEXT), []);
  const [active, setActive] = useState("");
  const [toc, setToc] = useState(false);

  useEffect(() => { document.title = `${PRIVACY_META.title} — Relic`; }, []);
  // Подсвечиваем в оглавлении раздел, который сейчас читают
  useEffect(() => {
    const els = doc.sections.map((s) => document.getElementById(s.id)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver((entries) => {
      const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (vis) setActive(vis.target.id);
    }, { rootMargin: "-80px 0px -65% 0px" });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [doc]);

  return (
    <>
      <TopBar />
      <main className="page lg">
        <header className="lg-head">
          <span className="label">Документы Relic</span>
          <h1 className="h-xl">{PRIVACY_META.title}</h1>
          <p className="lg-sub">{PRIVACY_META.subtitle}</p>
          <div className="lg-meta">
            <span className="lg-chip">{PRIVACY_META.edition}</span>
            <button type="button" className="chip-btn" onClick={() => window.print()}>Распечатать / PDF</button>
          </div>
        </header>

        <div className="lg-grid">
          <aside className={`lg-toc ${toc ? "open" : ""}`}>
            <button type="button" className="lg-toc-btn" onClick={() => setToc(!toc)} aria-expanded={toc}>Содержание <span aria-hidden="true">{toc ? "▴" : "▾"}</span></button>
            <nav aria-label="Содержание">
              {doc.sections.map((s) => (
                <a key={s.id} href={`#${s.id}`} className={active === s.id ? "on" : ""} onClick={() => setToc(false)}>
                  <em className="mono">{s.num}</em><span>{s.title}</span>
                </a>
              ))}
            </nav>
          </aside>

          <article className="lg-body">
            <div className="lg-intro"><Blocks blocks={doc.intro} /></div>
            {doc.sections.map((s) => (
              <section key={s.id} id={s.id} className="lg-sec">
                <h2><a href={`#${s.id}`} className="lg-anchor"><span className="mono">{s.num}.</span> {s.title}</a></h2>
                <Blocks blocks={s.intro} />
                {s.clauses.map((c) => (
                  <div key={c.num} id={`p${c.num}`} className="lg-clause">
                    <h3><span className="mono">{c.num}.</span>{c.title && <> {c.title}</>}</h3>
                    <Blocks blocks={c.blocks} />
                  </div>
                ))}
              </section>
            ))}
            <footer className="lg-foot">
              <p>Вопросы по обработке персональных данных — <a href="mailto:knmi2000@mail.ru">knmi2000@mail.ru</a>, по работе сервиса — <a href="mailto:relic_help@mail.ru">relic_help@mail.ru</a>.</p>
              <Link href="/" className="chip-btn">На главную</Link>
            </footer>
          </article>
        </div>
      </main>
    </>
  );
}
