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
const SHORT: Record<ShopKind, string> = { banner: "баннеры", ring: "ауры", name: "имена", title: "титулы", bg: "фоны", overlay: "анимации", scene: "сцены" };
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

  const shown = items
    .filter((i) => i.kind === kind)
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

  const tier = wallet?.tier ?? 0;
  const name = me?.display_name ?? "Твоё имя";

  return (
    <section className="sh">
      <div className="sh-top">
        <div className="sh-wallet">
          <span className="label">Баланс</span>
          <div className="sh-coins"><span className="sh-coin" aria-hidden="true">C</span><b className="mono">{wallet ? <CountUp value={wallet.balance} /> : me ? "…" : "0"}</b><em>Coins</em></div>
          {wallet
            ? <small>Заработано {wallet.earned} · потрачено {wallet.spent}. Пик AURA {wallet.peak}: монеты не сгорают, даже если аура просядет.</small>
            : <small>{me ? "Считаем…" : "Войди, чтобы получать Coins и покупать декор."}</small>}
        </div>
        <ol className="sh-ladder" aria-label="Coins за уровни">
          {TIERS.map((t, i) => {
            const got = wallet ? tier >= i : false;
            return (
              <li key={t.name} className={got ? "got" : ""} style={{ "--t": t.color, "--i": i } as React.CSSProperties}>
                <i />
                <b>{t.icon} {t.name}</b>
                <span className="mono">{t.min}+ AURA</span>
                <em className="mono">+{TIER_COINS[i]}</em>
              </li>
            );
          })}
          <li className="sh-ladder-note">и ещё +1 Coin за каждые 5 AURA</li>
        </ol>
      </div>

      <div className="sh-extras">
        <div className={`sh-chest ${rolling ? "rolling" : ""}`}>
          <span className="sh-chest-box" aria-hidden="true"><i /><b>?</b></span>
          <div>
            <b>Сундук удачи</b>
            <small>Случайный предмет до 500 Coins, которого у тебя ещё нет. Бывает, что выпадает вещь дороже сундука.</small>
          </div>
          {me
            ? <button type="button" className="sh-btn" disabled={rolling || !wallet || wallet.balance < CHEST_PRICE} onClick={chest}>{rolling ? "Открываю…" : <>Открыть · <i className="sh-coin sm" aria-hidden="true">C</i>{CHEST_PRICE}</>}</button>
            : <Link className="sh-btn" href="/login">Войти</Link>}
        </div>
        <div className="sh-collection">
          <span className="label">Коллекция</span>
          <b className="mono">{owned.size}<em>/{items.length}</em></b>
          <span className="sh-col-bar"><i style={{ width: `${items.length ? (owned.size / items.length) * 100 : 0}%` }} /></span>
          <small>{KINDS.map((k) => `${SHORT[k.id]} ${items.filter((i) => i.kind === k.id && owned.has(i.id)).length}/${items.filter((i) => i.kind === k.id).length}`).join(" · ")}</small>
        </div>
      </div>

      <div className="sh-body">
        <aside className="sh-preview">
          <span className="label">Примерка</span>
          <div className="sh-preview-card sh-stage">
            <PageFx id={look.page_bg} />
            <ProfileHeader
              compact displayName={name} username={me?.username ?? "username"} headline={me?.headline}
              accent={me?.accent ?? "edit"} avatar={me?.avatar ?? null} role={me?.role} support={me?.is_support}
              banner={publicMedia(me?.banner_path ?? null)} bannerPreset={me?.banner_preset} ring={me?.avatar_ring} nameStyle={me?.name_style}
              bio={me?.bio || "Так тебя увидят в профиле"} deco={look}
            />
          </div>
          {previewItem
            ? <p className="sh-preview-note">Примеряешь «{previewItem.name}». {owned.has(previewItem.id) ? "Уже в коллекции." : `Стоит ${previewItem.price} Coins.`}</p>
            : <p className="sh-preview-note">Нажми на предмет, чтобы примерить его на свою шапку.</p>}
          {me && <Link href={`/u/?n=${me.username}`} className="link-btn">Открыть мой профиль →</Link>}
        </aside>

        <div className="sh-shelf">
          <nav className="sh-kinds">
            {KINDS.map((k) => (
              <button key={k.id} type="button" className="sh-kind" aria-pressed={kind === k.id} onClick={() => { setKind(k.id); setPreview(null); }}>
                <b>{k.label}</b><small>{k.sub}</small>
              </button>
            ))}
          </nav>
          <div className="sh-filters">
            <div className="sh-rars">
              {[["all", "Все"], ["common", "Обычные"], ["rare", "Редкие"], ["epic", "Эпические"], ["legend", "Легендарные"]].map(([id, l]) => (
                <button key={id} type="button" className={`sh-rar-chip r-${id}`} aria-pressed={rar === id} onClick={() => setRar(id)}>{l}</button>
              ))}
            </div>
            <div className="sh-sorts">
              <select className="mini-select" value={onlyMine} onChange={(e) => setOnlyMine(e.target.value as typeof onlyMine)} aria-label="Показывать">
                <option value="all">Все предметы</option>
                <option value="avail">Могу купить</option>
                <option value="owned">Мои</option>
              </select>
              <select className="mini-select" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Сортировка">
                <option value="default">По порядку</option>
                <option value="cheap">Сначала дешёвые</option>
                <option value="pricey">Сначала дорогие</option>
              </select>
            </div>
          </div>
          {shown.length === 0 && <p className="sh-empty">Тут пусто. Попробуй другой фильтр.</p>}
          <div className="sh-grid" key={`${kind}-${rar}-${onlyMine}-${sort}`}>
            {shown.map((it, i) => {
              const r = rarity(it.price);
              const have = owned.has(it.id);
              const worn = deco[slotOf(it.kind)] === it.id;
              const locked = tier < it.min_tier;
              const poor = !!wallet && wallet.balance < it.price;
              return (
                <article key={it.id} className={`sh-item rar-${r.id} ${preview === it.id ? "on" : ""} ${worn ? "worn" : ""}`} style={{ "--i": i } as React.CSSProperties}
                  onClick={() => setPreview(preview === it.id ? null : it.id)}>
                  <div className="sh-item-art"><ItemArt it={it} name={name} avatar={me?.avatar ?? null} banner={publicMedia(me?.banner_path ?? null)} /></div>
                  <div className="sh-item-info">
                    <span className="sh-rar">{r.label}</span>
                    <b>{it.name}</b>
                    <small>{ABOUT[it.id]}</small>
                  </div>
                  <div className="sh-item-foot" onClick={(e) => e.stopPropagation()}>
                    {have
                      ? <button type="button" className={`sh-btn ${worn ? "ghost" : ""}`} disabled={busy === it.id} onClick={() => equip(it, !worn)}>{worn ? "Снять" : "Надеть"}</button>
                      : locked
                        ? <span className="sh-lock">🔒 с уровня «{TIERS[it.min_tier].name}»</span>
                        : !me
                          ? <Link className="sh-btn" href="/login">Войти</Link>
                          : <button type="button" className="sh-btn" disabled={busy === it.id || poor} onClick={() => buy(it)}>{poor ? "Не хватает" : "Купить"}</button>}
                    <span className="sh-price mono">{have ? (worn ? "надето" : "в коллекции") : <><i className="sh-coin sm" aria-hidden="true">C</i>{it.price}</>}</span>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
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
    const pool = items.filter((i) => i.price <= 900);
    // дешёвые попадаются чаще — как в настоящем кейсе
    const pick = () => { const r = Math.random(); const tier = r < .55 ? 200 : r < .85 ? 500 : 900; const p = pool.filter((i) => i.price < tier); return p[Math.floor(Math.random() * p.length)] ?? pool[0]; };
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
