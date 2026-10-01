"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { supabase, publicMedia, isOwner } from "@/lib/supabase";
import { useRequireMe } from "@/lib/session";
import { uploadPublicImage } from "@/lib/upload";
import { NICHES } from "@/lib/niches";
import { LEVELS, articleHref, readMinutes, renderMarkdown, slugify, type Article } from "@/lib/learn";
import { TopBar } from "../../TopBar";
import { ImagePicker } from "../../ImagePicker";

const SAMPLE = `Короткое вступление: о чём статья и что человек получит.

# Первый раздел

Обычный текст. **Жирный**, *курсив*, \`код\`, [ссылка](https://example.com).

- пункт списка
- ещё пункт

> ! Важная мысль в выделенной выноске

# Второй раздел

1. Шаг первый
2. Шаг второй`;

/** Редактор статьи для владельцев платформы: слева Markdown, справа живой предпросмотр */
export default function EditArticle() {
  const { me } = useRequireMe();
  const sp = useSearchParams();
  const router = useRouter();
  const editSlug = sp.get("a");
  const [orig, setOrig] = useState<Article | null>(null);
  const [f, setF] = useState({ title: "", slug: "", niche: sp.get("n") ?? NICHES[0].id, level: "start" as Article["level"], summary: "", body: SAMPLE, published: false, position: 0 });
  const [slugTouched, setSlugTouched] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [coverPath, setCoverPath] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);
  const cover = useMemo(() => (file ? URL.createObjectURL(file) : publicMedia(coverPath)), [file, coverPath]);
  const preview = useMemo(() => renderMarkdown(f.body).html, [f.body]);

  useEffect(() => {
    document.title = editSlug ? "Правка статьи" : "Новая статья";
    if (!editSlug) return;
    supabase.from("articles").select("*").eq("slug", editSlug).maybeSingle().then(({ data }) => {
      if (!data) return;
      const a = data as Article;
      setOrig(a); setSlugTouched(true); setCoverPath(a.cover_path);
      setF({ title: a.title, slug: a.slug, niche: a.niche, level: a.level, summary: a.summary, body: a.body, published: a.published, position: a.position });
    });
  }, [editSlug]);

  if (me && !isOwner(me.role)) return (<><TopBar /><main className="page"><div className="pf-empty"><p className="lead">Писать статьи могут только владельцы платформы.</p><Link className="btn" href="/learn/">К обучению</Link></div></main></>);

  async function save(publish?: boolean) {
    if (!me) return;
    if (f.title.trim().length < 3) return setErr("Заголовок хотя бы из 3 символов");
    const slug = (f.slug || slugify(f.title)).slice(0, 80);
    if (!/^[a-z0-9-]{3,80}$/.test(slug)) return setErr("Адрес статьи: латиница, цифры и дефисы, от 3 символов");
    setBusy(true); setErr("");
    try {
      const cover_path = file ? await uploadPublicImage(me.id, file) : coverPath;
      const row = { ...f, slug, title: f.title.trim(), summary: f.summary.trim(), cover_path, published: publish ?? f.published, updated_at: new Date().toISOString() };
      const { error } = orig ? await supabase.from("articles").update(row).eq("id", orig.id) : await supabase.from("articles").insert(row);
      if (error) throw error;
      router.push(articleHref(slug));
    } catch (e) {
      setBusy(false);
      setErr(String((e as { message?: string })?.message ?? "").includes("duplicate") ? "Такой адрес уже занят, поменяй его" : "Не получилось сохранить");
    }
  }

  return (
    <>
      <TopBar />
      <main className="page wide ae">
        <div className="section-head">
          <div><span className="label">Обучение · редактор</span><h1 className="h-xl caps">{orig ? <>Правка <span className="it">статьи</span></> : <>Новая <span className="it">статья</span></>}</h1></div>
          <div className="friend-actions">
            <button type="button" className="btn ghost" disabled={busy} onClick={() => save(false)}>Сохранить черновик</button>
            <button type="button" className="btn" disabled={busy} onClick={() => save(true)}>{busy ? "Сохраняю…" : "Опубликовать"}</button>
          </div>
        </div>
        {err && <div className="form-error">{err}</div>}
        <div className="ae-grid">
          <div className="ae-form card">
            <label className="field"><span>Заголовок</span><div className="input"><input value={f.title} maxLength={120} onChange={(e) => setF({ ...f, title: e.target.value, slug: slugTouched ? f.slug : slugify(e.target.value) })} placeholder="Как смонтировать первый рилс за вечер" /></div></label>
            <div className="row2">
              <label className="field"><span>Ниша</span><div className="input"><select value={f.niche} onChange={(e) => setF({ ...f, niche: e.target.value })}>{NICHES.map((n) => <option key={n.id} value={n.id}>{n.title}</option>)}</select></div></label>
              <label className="field"><span>Уровень</span><div className="input"><select value={f.level} onChange={(e) => setF({ ...f, level: e.target.value as Article["level"] })}>{Object.entries(LEVELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div></label>
            </div>
            <label className="field"><span>Адрес <span className="count">…/learn/article/?a=</span></span><div className="input"><input value={f.slug} onChange={(e) => { setSlugTouched(true); setF({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") }); }} /></div></label>
            <label className="field"><span>Анонс <span className="count">{f.summary.length}/300</span></span><div className="input"><textarea rows={2} maxLength={300} value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} placeholder="Одно-два предложения: что человек узнает" /></div></label>
            <div className="field"><span>Обложка</span><ImagePicker preview={cover} onPick={setFile} onClear={() => { setFile(null); setCoverPath(null); }} /></div>
            <label className="field"><span>Текст <span className="count">Markdown · {readMinutes(f.body)} мин чтения</span></span>
              <div className="input"><textarea className="ae-body" rows={18} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></div>
            </label>
            <p className="hint"># Заголовок раздела · **жирный** · *курсив* · - список · 1. шаги · &gt; цитата · &gt; ! выноска · ![подпись](https://…картинка)</p>
            {orig && (confirmDel
              ? <button type="button" className="btn danger" onClick={async () => { await supabase.from("articles").delete().eq("id", orig.id); router.push(`/learn/niche/?n=${orig.niche}`); }}>Точно удалить статью</button>
              : <button type="button" className="btn ghost" onClick={() => setConfirmDel(true)}>Удалить статью</button>)}
          </div>
          <div className="ae-preview">
            <span className="label">Предпросмотр</span>
            <div className="ar" style={{ "--c": NICHES.find((n) => n.id === f.niche)?.color } as React.CSSProperties}>
              <h1 className="ar-title">{f.title || "Заголовок статьи"}</h1>
              {f.summary && <p className="ar-summary">{f.summary}</p>}
              <article className="ar-body" dangerouslySetInnerHTML={{ __html: preview }} />
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
