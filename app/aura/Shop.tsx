"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, publicMedia } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import { TIERS } from "@/lib/aura";
import { ABOUT, KINDS, TIER_COINS, loadCatalog, rarity, type Deco, type ShopItem, type ShopKind, type Wallet } from "@/lib/shop";
import { ProfileHeader } from "../ProfileHeader";
import { BannerFx, RingFx, TitleChip } from "../Deco";
import { CountUp } from "../CountUp";

type Slot = keyof Omit<Deco, "user_id">;
const EMPTY: Omit<Deco, "user_id"> = { banner: null, ring: null, name_fx: null, title: null };

export function Shop() {
  const { ready, me } = useSession();
  const [items, setItems] = useState<ShopItem[]>([]);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [owned, setOwned] = useState<Set<string>>(new Set());
  const [deco, setDeco] = useState(EMPTY);
  const [kind, setKind] = useState<ShopKind>("banner");
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; bad?: boolean } | null>(null);

  const loadMine = useCallback(async () => {
    if (!me) return;
    const [{ data: w }, { data: own }, { data: d }] = await Promise.all([
      supabase.rpc("my_wallet"),
      supabase.from("user_items").select("item_id"),
      supabase.from("profile_deco").select("banner, ring, name_fx, title").eq("user_id", me.id).maybeSingle(),
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

  const shown = items.filter((i) => i.kind === kind);
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
                <b>{t.name}</b>
                <span className="mono">{t.min}+ AURA</span>
                <em className="mono">+{TIER_COINS[i]}</em>
              </li>
            );
          })}
          <li className="sh-ladder-note">и ещё +1 Coin за каждые 5 AURA</li>
        </ol>
      </div>

      <div className="sh-body">
        <aside className="sh-preview">
          <span className="label">Примерка</span>
          <div className="sh-preview-card">
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
          <div className="sh-grid" key={kind}>
            {shown.map((it, i) => {
              const r = rarity(it.price);
              const have = owned.has(it.id);
              const worn = deco[slotOf(it.kind)] === it.id;
              const locked = tier < it.min_tier;
              const poor = !!wallet && wallet.balance < it.price;
              return (
                <article key={it.id} className={`sh-item rar-${r.id} ${preview === it.id ? "on" : ""} ${worn ? "worn" : ""}`} style={{ "--i": i } as React.CSSProperties}
                  onClick={() => setPreview(preview === it.id ? null : it.id)}>
                  <div className="sh-item-art"><ItemArt it={it} name={name} avatar={me?.avatar ?? null} /></div>
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
      {toast && <div className={`sh-toast ${toast.bad ? "bad" : ""}`} role="status">{toast.text}</div>}
    </section>
  );
}

function ItemArt({ it, name, avatar }: { it: ShopItem; name: string; avatar: string | null }) {
  if (it.kind === "banner") return <div className="sh-art-banner"><BannerFx id={it.id} /><em /><em /><em /></div>;
  if (it.kind === "ring") return (
    <span className="fx-host sh-art-ava"><RingFx id={it.id} /><span className="ava" style={{ width: 64, height: 64, fontSize: 24 }}>{avatar ? <img src={avatar} alt="" /> : name.slice(0, 1)}</span></span>
  );
  if (it.kind === "name") return <span className={`sh-art-name caps fx-name ${it.id}`}>{name.split(" ")[0]}</span>;
  return <TitleChip id={it.id} />;
}
