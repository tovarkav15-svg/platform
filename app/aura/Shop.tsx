"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase, publicMedia } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import { TIERS } from "@/lib/aura";
import { ABOUT, CHEST_PRICE, KINDS, TIER_COINS, loadCatalog, rarity, type Deco, type ShopItem, type ShopKind, type Wallet } from "@/lib/shop";
import { ProfileHeader } from "../ProfileHeader";
import { BannerFx, PageFx, RingFx, TitleChip } from "../Deco";
import { OverlayFx, SceneFx } from "../Scenes";
import { CountUp } from "../CountUp";

type Slot = keyof Omit<Deco, "user_id">;
const EMPTY: Omit<Deco, "user_id"> = { banner: null, ring: null, name_fx: null, title: null, page_bg: null, overlay: null, scene: null };

export function Shop() {
  const { ready, me } = useSession();
  const [items, setItems] = useState<ShopItem[]>([]);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [owned, setOwned] = useState<Set<string>>(new Set());
  const [deco, setDeco] = useState(EMPTY);
  const [kind, setKind] = useState<ShopKind>("scene");
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; bad?: boolean } | null>(null);
  const [rar, setRar] = useState("all");
  const [onlyMine, setOnlyMine] = useState<"all" | "avail" | "owned">("all");
  const [sort, setSort] = useState<"default" | "cheap" | "pricey">("default");
  const [won, setWon] = useState<ShopItem | null>(null);
  const [rolling, setRolling] = useState(false);
  const [roll, setRoll] = useState<ShopItem | null>(null); // что крутится в рулетке перед показом

  const loadMine = useCallback(async () => {
    if (!me) return;
    const [{ data: w }, { data: own }, { data: d }] = await Promise.all([
      supabase.rpc("my_wallet"),
      supabase.from("user_items").select("item_id"),
      supabase.from("profile_deco").select("banner, ring, name_fx, title, page_bg, overlay, scene").eq("user_id", me.id).maybeSingle(),
    ]);
    setWallet(((w as Wallet[]) ?? [])[0] ?? null);
    setOwned(new Set(((own as { item_id: string }[]) ?? []).map((o) => o.item_id)));
    setDeco((d as typeof EMPTY) ?? EMPTY);
  }, [me]);

  useEffect(() => { loadCatalog().then(setItems); }, []);
  useEffect(() => { if (ready) loadMine(); }, [ready, loadMine]);

  const say = (text: string, bad?: boolean) => { setToast({ text, bad }); setTimeout(() => setToast(null), 2600); };
  const slotOf = (k: ShopKind) => KINDS.find((x) => x.id === k)!.slot as Slot;

  async function buy(it: ShopItem) {
    setBusy(it.id);
    const { error } = await supabase.rpc("buy_item", { p_item: it.id });
    if (error) say(error.message, true);
    else {
      await supabase.rpc("equip_item", { p_kind: it.kind, p_item: it.id });
      say(`«${it.name}» твой и уже надет`);
      await loadMine();
    }
    setBusy(null);
  }

  async function equip(it: ShopItem, on: boolean) {
    setBusy(it.id);
    const { error } = await supabase.rpc("equip_item", { p_kind: it.kind, p_item: on ? it.id : null });
    if (error) say(error.message, true); else { say(on ? `Надето: «${it.name}»` : "Снято"); await loadMine(); }
    setBusy(null);
  }

  async function chest() {
    setRolling(true);
    const { data, error } = await supabase.rpc("open_chest");
    if (error) { setRolling(false); return say(error.message, true); }
    const it = items.find((i) => i.id === data) ?? null;
    if (!it) { setRolling(false); return; }
    setRoll(it); // рулетка покрутится и покажет выигрыш
    loadMine();
  }

  const tier = wallet?.tier ?? 0;
  const shown = items
    .filter((i) => i.kind === kind && (!i.hidden || owned.has(i.id)))
    .filter((i) => rar === "all" || rarity(i.price).id === rar)
    .filter((i) => onlyMine === "all" || (onlyMine === "owned" ? owned.has(i.id) : !owned.has(i.id) && tier >= i.min_tier && (!wallet || wallet.balance >= i.price)))
    .sort((a, b) => (sort === "cheap" ? a.price - b.price : sort === "pricey" ? b.price - a.price : a.sort - b.sort));
  const previewItem = items.find((i) => i.id === preview);
  // В превью надето то, что выбрал сейчас, поверх того, что уже носишь
  const look = useMemo(() => {
    const l = { ...deco };
    if (previewItem) l[slotOf(previewItem.kind)] = previewItem.id;
    return l;
  }, [deco, previewItem]); // eslint-disable-line react-hooks/exhaustive-deps

  const name = me?.display_name ?? "Твоё имя";
  const nextTier = TIERS[tier + 1];
  const colPct = items.length ? Math.round((owned.size / items.length) * 100) : 0;

  return (
    <section className="sx">
      {/* ===== Витрина: баланс и сундук ===== */}
      <div className="sx-hero">
        <span className="sx-glow g1" aria-hidden="true" /><span className="sx-glow g2" aria-hidden="true" />
        <div className="sx-bal">
          <span className="sx-label">Баланс</span>
          <div className="sx-coins"><span className="sx-coin" aria-hidden="true">C</span><b>{wallet ? <CountUp value={wallet.balance} ms={1200} /> : 0}</b></div>
          <span className="sx-sub">{wallet ? <>Coins · собрано {owned.size} из {items.length}</> : me ? "Считаем…" : "Войди, чтобы получать Coins"}</span>
          <span className="sx-col" title={`Коллекция ${colPct}%`}><i style={{ width: `${colPct}%` }} /></span>
        </div>
        <div className={`sx-chest ${rolling ? "rolling" : ""}`}>
          <span className="sx-chest-box" aria-hidden="true"><i /><b>?</b><em /><em /><em /></span>
          <div className="sx-chest-text">
            <b>Сундук удачи</b>
            <span>Случайный предмет, даже выше твоего уровня</span>
          </div>
          {me
            ? <button type="button" className="sx-btn hot" disabled={rolling || !wallet || wallet.balance < CHEST_PRICE} onClick={chest}>{rolling ? "Открываю…" : <>Открыть <i className="sx-coin sm" aria-hidden="true">C</i>{CHEST_PRICE}</>}</button>
            : <Link className="sx-btn hot" href="/login">Войти</Link>}
        </div>
      </div>

      {/* ===== Coins за уровни — тонкая лента ===== */}
      <ol className="sx-ladder" aria-label="Coins за уровни">
        {TIERS.map((t, i) => (
          <li key={t.name} className={wallet && tier >= i ? "got" : ""} style={{ "--t": t.color } as React.CSSProperties} title={`${t.name}: от ${t.min} AURA`}>
            <span>{t.icon}</span><b>{t.name}</b><em>+{TIER_COINS[i]}</em>
          </li>
        ))}
      </ol>
      {nextTier && wallet && <p className="sx-hint">Следующий уровень «{nextTier.name}» — ещё +{TIER_COINS[tier + 1]} Coins. Плюс 1 Coin за каждые 5 AURA.</p>}

      <div className="sx-body">
        {/* ===== Категории и фильтры ===== */}
        <div className="sx-shelf">
          <nav className="sx-kinds" aria-label="Категории">
            {KINDS.map((k) => (
              <button key={k.id} type="button" className="sx-kind" aria-pressed={kind === k.id} title={k.sub} onClick={() => { setKind(k.id); setPreview(null); }}>
                <span aria-hidden="true">{ICON[k.id]}</span>{SHORTLABEL[k.id]}
              </button>
            ))}
          </nav>
          <div className="sx-filters">
            {[["all", "Все"], ["common", "Обычные"], ["rare", "Редкие"], ["epic", "Эпические"], ["legend", "Легендарные"]].map(([id, l]) => (
              <button key={id} type="button" className={`sx-rar r-${id}`} aria-pressed={rar === id} onClick={() => setRar(id)}><i />{l}</button>
            ))}
            <select className="sx-select" value={`${onlyMine}:${sort}`} onChange={(e) => { const [a, b] = e.target.value.split(":"); setOnlyMine(a as typeof onlyMine); setSort(b as typeof sort); }} aria-label="Показывать">
              <option value="all:default">Все предметы</option>
              <option value="avail:default">Могу купить</option>
              <option value="owned:default">Мои</option>
              <option value="all:cheap">Сначала дешёвые</option>
              <option value="all:pricey">Сначала дорогие</option>
            </select>
          </div>

          {shown.length === 0 && <p className="sx-empty">Тут пусто. Попробуй другой фильтр.</p>}
          <div className="sx-grid" key={`${kind}-${rar}-${onlyMine}-${sort}`}>
            {shown.map((it, i) => {
              const r = rarity(it.price);
              const have = owned.has(it.id);
              const worn = deco[slotOf(it.kind)] === it.id;
              const locked = tier < it.min_tier;
              const poor = !!wallet && wallet.balance < it.price;
              return (
                <article key={it.id} className={`sx-item rar-${it.hidden ? "excl" : r.id} ${preview === it.id ? "on" : ""} ${worn ? "worn" : ""} ${locked && !have ? "locked" : ""}`}
                  style={{ "--i": i } as React.CSSProperties} title={ABOUT[it.id]} onClick={() => setPreview(preview === it.id ? null : it.id)}>
                  <div className="sx-art">
                    <ItemArt it={it} name={name} avatar={me?.avatar ?? null} banner={publicMedia(me?.banner_path ?? null)} />
                    <span className="sx-tag">{it.hidden ? "Эксклюзив" : r.label}</span>
                    {worn && <span className="sx-worn">Надето</span>}
                  </div>
                  <div className="sx-info">
                    <b>{it.name}</b>
                    <div className="sx-foot" onClick={(e) => e.stopPropagation()}>
                      {have
                        ? <button type="button" className={`sx-btn sm ${worn ? "ghost" : ""}`} disabled={busy === it.id} onClick={() => equip(it, !worn)}>{worn ? "Снять" : "Надеть"}</button>
                        : locked
                          ? <span className="sx-lock" title={`Откроется с уровня «${TIERS[it.min_tier].name}»`}>🔒 {TIERS[it.min_tier].name}</span>
                          : !me
                            ? <Link className="sx-btn sm" href="/login">Войти</Link>
                            : <button type="button" className="sx-btn sm" disabled={busy === it.id || poor} onClick={() => buy(it)}>{poor ? "Мало Coins" : "Купить"}</button>}
                      {!have && <span className="sx-price"><i className="sx-coin sm" aria-hidden="true">C</i>{it.price}</span>}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>

        {/* ===== Примерка ===== */}
        <aside className="sx-try">
          <span className="sx-label">Примерка</span>
          <div className="sx-try-card">
            <PageFx id={look.page_bg} />
            <ProfileHeader
              compact displayName={name} username={me?.username ?? "username"} headline={me?.headline}
              accent={me?.accent ?? "edit"} avatar={me?.avatar ?? null} role={me?.role} support={me?.is_support}
              banner={publicMedia(me?.banner_path ?? null)} bannerPreset={me?.banner_preset} ring={me?.avatar_ring} nameStyle={me?.name_style}
              deco={look}
            />
          </div>
          <p className="sx-try-note">{previewItem ? <>Примеряешь <b>«{previewItem.name}»</b>{owned.has(previewItem.id) ? " — уже твоё" : ` · ${previewItem.price} Coins`}</> : "Нажми на предмет — он появится здесь"}</p>
          {me && <Link href={`/u/?n=${me.username}`} className="sx-try-link">Мой профиль →</Link>}
        </aside>
      </div>

      {roll && <CaseRoll items={items} winner={roll} name={name} avatar={me?.avatar ?? null} onDone={() => { setWon(roll); setRoll(null); setRolling(false); }} />}
      {won && (
        <div className="sh-won" role="dialog" aria-label="Выпал предмет" onClick={() => setWon(null)}>
          <div className={`sh-won-card rar-${rarity(won.price).id}`} onClick={(e) => e.stopPropagation()}>
            <span className="sh-won-rays" aria-hidden="true" />
            <span className="sh-rar">{rarity(won.price).label} · {KINDS.find((k) => k.id === won.kind)?.label}</span>
            <div className="sh-item-art"><ItemArt it={won} name={name} avatar={me?.avatar ?? null} /></div>
            <b>{won.name}</b>
            <small>{ABOUT[won.id]}{won.price > CHEST_PRICE ? ` · в магазине стоит ${won.price}` : ""}</small>
            {won.min_tier > tier && <span className="sh-won-rare">🔓 Выше твоего уровня — в магазине откроется только с «{TIERS[won.min_tier].name}»</span>}
            <div className="save-row">
              <button type="button" className="sh-btn" onClick={async () => { await equip(won, true); setWon(null); }}>Надеть</button>
              <button type="button" className="sh-btn ghost" onClick={() => setWon(null)}>Позже</button>
            </div>
          </div>
        </div>
      )}
      {toast && <div className={`sh-toast ${toast.bad ? "bad" : ""}`} role="status">{toast.text}</div>}
    </section>
  );
}

const ICON: Record<ShopKind, string> = { scene: "🏞", overlay: "🍂", banner: "✨", ring: "◎", name: "Aa", title: "🏷", bg: "🌌" };
const SHORTLABEL: Record<ShopKind, string> = { scene: "Сцены", overlay: "Анимации", banner: "Баннеры", ring: "Ауры", name: "Имя", title: "Титулы", bg: "Фоны" };

function ItemArt({ it, name, avatar, banner }: { it: ShopItem; name: string; avatar: string | null; banner?: string | null }) {
  if (it.kind === "scene") return <div className="sh-art-scene"><SceneFx id={it.id} /></div>;
  if (it.kind === "overlay") return <div className="sh-art-over">{banner && <img src={banner} alt="" />}<OverlayFx id={it.id} /></div>;
  if (it.kind === "banner") return <div className="sh-art-banner"><BannerFx id={it.id} /><em /><em /><em /></div>;
  if (it.kind === "ring") return (
    <span className="fx-host sh-art-ava"><RingFx id={it.id} /><span className="ava" style={{ width: 64, height: 64, fontSize: 24 }}>{avatar ? <img src={avatar} alt="" /> : name.slice(0, 1)}</span></span>
  );
  if (it.kind === "name") return <span className={`sh-art-name caps fx-name ${it.id}`} data-text={name.split(" ")[0]}>{name.split(" ")[0]}</span>;
  if (it.kind === "bg") return <div className="sh-art-page"><PageFx id={it.id} /><span /><span /></div>;
  return <TitleChip id={it.id} />;
}

/** Открытие сундука как кейса: лента предметов разгоняется и останавливается на выигрыше */
export function CaseRoll({ items, winner, name, avatar, onDone }: { items: ShopItem[]; winner: ShopItem; name: string; avatar: string | null; onDone: () => void }) {
  const W = 142; // ширина карточки + отступ
  const WIN = 42;
  const [strip] = useState(() => {
    const pool = items;
    // дешёвые попадаются чаще — как в настоящем кейсе
    // как в базе: дешёвые мелькают чаще, легендарные — изредка
    const pick = () => { const r = Math.random(); const cap = r < .47 ? 200 : r < .9 ? 500 : r < .985 ? 1000 : Infinity; const lo = cap === 200 ? 0 : cap === 500 ? 200 : cap === 1000 ? 500 : 1000; const p = pool.filter((i) => i.price >= lo && i.price < cap); return p[Math.floor(Math.random() * p.length)] ?? pool[0]; };
    return Array.from({ length: 50 }, (_, i) => (i === WIN ? winner : pick()));
  });
  const box = useRef<HTMLDivElement>(null);
  const [x, setX] = useState(0);
  const [done, setDone] = useState(false);
  useEffect(() => {
    const w = box.current?.clientWidth ?? 600;
    const jitter = (Math.random() - 0.5) * (W - 30);
    const t = requestAnimationFrame(() => requestAnimationFrame(() => setX(-(WIN * W + W / 2 - w / 2 + jitter))));
    return () => cancelAnimationFrame(t);
  }, []);
  return (
    <div className="cr" role="dialog" aria-label="Открываем сундук">
      <div className="cr-panel">
        <b className="cr-title">Сундук удачи</b>
        <div className="cr-window" ref={box}>
          <span className="cr-marker" aria-hidden="true" />
          <div className={`cr-strip ${done ? "stopped" : ""}`} style={{ transform: `translateX(${x}px)` }} onTransitionEnd={() => { setDone(true); setTimeout(onDone, 900); }}>
            {strip.map((it, i) => (
              <div key={i} className={`cr-item rar-${rarity(it.price).id} ${done && i === WIN ? "win" : ""}`}>
                <div className="cr-art"><ItemArt it={it} name={name} avatar={avatar} /></div>
                <span>{it.name}</span>
              </div>
            ))}
          </div>
        </div>
        <small className="cr-hint">{done ? "Есть!" : "Крутим…"}</small>
      </div>
    </div>
  );
}
