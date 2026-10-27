"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

// Карточка ссылки, как в Telegram: название сайта, заголовок, описание и картинка
export type Preview = { url: string; site?: string; title?: string; description?: string; image?: string; icon?: string };

const URL_RE = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+|\b(?:[a-z0-9-]+\.)+(?:ru|com|net|org|io|me|app|dev|online|site|store|pro|info|рф|su|ai|gg|tv|co|xyz|tech|shop|be)\b(?:\/[^\s<>"']*)?)/i;
const TRAIL = /[.,!?;:)»"'\]]+$/;

/** Первая ссылка в тексте — для неё и строится карточка */
export function firstUrl(text: string): string | null {
  const m = text.match(URL_RE);
  if (!m) return null;
  // e-mail вида name@mail.ru — не ссылка
  const at = (m.index ?? 0) - 1;
  if (at >= 0 && text[at] === "@") return null;
  const token = m[0].replace(TRAIL, "");
  return /^https?:\/\//i.test(token) ? token : `https://${token}`;
}

// Одна загрузка на ссылку за всё время открытой вкладки
const cache = new Map<string, Promise<Preview | null>>();
function load(url: string) {
  if (!cache.has(url)) {
    cache.set(url, supabase.functions.invoke("link-preview", { body: { url } })
      .then(({ data, error }) => (error ? null : ((data as { preview: Preview | null })?.preview ?? null)))
      .catch(() => null));
  }
  return cache.get(url)!;
}

export function usePreview(url: string | null) {
  const [state, setState] = useState<{ url: string | null; p: Preview | null; loading: boolean }>({ url: null, p: null, loading: false });
  useEffect(() => {
    if (!url) { setState({ url: null, p: null, loading: false }); return; }
    let alive = true;
    setState({ url, p: null, loading: true });
    load(url).then((p) => { if (alive) setState({ url, p, loading: false }); });
    return () => { alive = false; };
  }, [url]);
  return state.url === url ? state : { url, p: null, loading: !!url };
}

/** Карточка под сообщением */
export function LinkCard({ url }: { url: string }) {
  const { p } = usePreview(url);
  const [imgOk, setImgOk] = useState(true);
  if (!p) return null;
  return (
    <a className="link-card" href={p.url} target="_blank" rel="noopener noreferrer nofollow">
      <span className="lc-site">
        {p.icon && <img src={p.icon} alt="" referrerPolicy="no-referrer" onError={(e) => (e.currentTarget.style.display = "none")} />}
        {p.site}
      </span>
      {p.title && <b className="lc-title">{p.title}</b>}
      {p.description && <span className="lc-desc">{p.description}</span>}
      {p.image && imgOk && <img className="lc-img" src={p.image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setImgOk(false)} />}
    </a>
  );
}

/** Полоска над полем ввода: какой будет карточка, с крестиком «без превью» */
export function ComposerPreview({ url, onDismiss }: { url: string; onDismiss: () => void }) {
  const { p, loading } = usePreview(url);
  if (!loading && !p) return null;
  return (
    <div className="composer-link" role="status">
      <svg className="cl-ico" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M10.6 13.4a1 1 0 0 1 0-1.4l3.4-3.4a1 1 0 1 1 1.4 1.4L12 13.4a1 1 0 0 1-1.4 0zm-2.1 5.3a4.5 4.5 0 0 1-3.2-7.7l2.1-2.1a1 1 0 1 1 1.4 1.4l-2.1 2.1a2.5 2.5 0 0 0 3.5 3.5l2.1-2.1a1 1 0 1 1 1.4 1.4l-2.1 2.1a4.5 4.5 0 0 1-3.1 1.4zm7.4-5a1 1 0 0 1-.7-1.7l2.1-2.1a2.5 2.5 0 0 0-3.5-3.5l-2.1 2.1a1 1 0 1 1-1.4-1.4l2.1-2.1a4.5 4.5 0 0 1 6.4 6.4l-2.1 2.1a1 1 0 0 1-.8.2z"/></svg>
      <span className="cl-text">
        {loading ? <b>Загружаю предпросмотр…</b> : <><b>{p?.title || p?.site}</b><small>{p?.description || p?.url}</small></>}
      </span>
      {p?.image && <img className="cl-img" src={p.image} alt="" referrerPolicy="no-referrer" onError={(e) => (e.currentTarget.style.display = "none")} />}
      <button type="button" className="icon-btn sm" aria-label="Отправить без предпросмотра" title="Без предпросмотра" onClick={onDismiss}>×</button>
    </div>
  );
}
