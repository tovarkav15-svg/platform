// AURA Shop: цены и уровни лежат в базе (shop_items), здесь описание и оформление витрины
import { useEffect, useState } from "react";
import { supabase } from "./supabase";

export type ShopKind = "banner" | "ring" | "name" | "title" | "bg";
export type ShopItem = { id: string; kind: ShopKind; name: string; price: number; min_tier: number; sort: number };
export type Deco = { user_id: string; banner: string | null; ring: string | null; name_fx: string | null; title: string | null; page_bg: string | null };
export type Wallet = { aura: number; peak: number; tier: number; earned: number; spent: number; balance: number };

export const KINDS: { id: ShopKind; label: string; sub: string; slot: keyof Omit<Deco, "user_id"> }[] = [
  { id: "banner", label: "Нижние баннеры", sub: "Живой фон под шапкой профиля", slot: "banner" },
  { id: "ring", label: "Ауры аватара", sub: "Анимация вокруг аватарки", slot: "ring" },
  { id: "name", label: "Эффекты имени", sub: "Как переливается твоё имя", slot: "name_fx" },
  { id: "title", label: "Титулы", sub: "Подпись рядом с именем", slot: "title" },
  { id: "bg", label: "Фон профиля", sub: "Живой фон всей страницы", slot: "page_bg" },
];

export const ABOUT: Record<string, string> = {
  "b-sunset": "Персиковый закат медленно перетекает в лаванду",
  "b-aurora": "Мягкие ленты сияния плывут за текстом",
  "b-waves": "Спокойные волны катятся по низу карточки",
  "b-stars": "Россыпь мерцающих искр",
  "b-grid": "Ретро-сетка уходит к горизонту",
  "b-holo": "Перламутр переливается всеми оттенками",
  "b-petals": "Лепестки кружатся и падают",
  "b-gold": "Тёплая золотая пыль поднимается вверх",
  "r-pulse": "Волны расходятся от аватарки",
  "r-rainbow": "Радужное кольцо вращается",
  "r-orbit": "Две луны кружат по орбите",
  "r-flame": "Живое тёплое пламя",
  "r-sparks": "Искры вспыхивают вокруг",
  "r-saturn": "Наклонные кольца, как у планеты",
  "r-crown": "Золото и корона, только для Легенд",
  "n-shine": "По имени пробегает блик",
  "n-ink": "Чернила переливаются в фиолет",
  "n-glow": "Имя мягко светится",
  "n-gold": "Имя из золота с отблеском",
  "t-first": "Для тех, кто пришёл первым",
  "t-flow": "Когда работа идёт",
  "t-owl": "Лучшие идеи приходят ночью",
  "t-deadline": "Сдаёт вовремя. Всегда",
  "t-vision": "Видит дальше остальных",
  "t-mentor": "Помогает другим расти",
  "t-legend": "Высший титул платформы",
  "b-rain": "Косые капли тихо скользят вниз",
  "b-bubbles": "Пузырьки поднимаются и лопаются",
  "b-snow": "Мягкий снег под шапкой",
  "b-confetti": "Праздник каждый день",
  "b-film": "Плёнка бежит, как на монтажном столе",
  "b-matrix": "Строки кода текут сверху вниз",
  "b-fireflies": "Тёплые огоньки летают в тишине",
  "b-mesh": "Цветной градиент перетекает как жидкость",
  "r-dash": "Пунктирное кольцо медленно вращается",
  "r-double": "Два неоновых кольца навстречу друг другу",
  "r-hearts": "Сердечки всплывают вокруг",
  "r-ice": "Холодное кристальное свечение",
  "r-glitch": "Цифровой сбой по краю",
  "r-galaxy": "Спиральная галактика вокруг тебя",
  "r-eclipse": "Тёмный диск и сияющая корона",
  "n-rainbow": "Имя переливается всеми цветами",
  "n-neon": "Вывеска с неоновым свечением",
  "n-fire": "Языки огня бегут по буквам",
  "n-ice": "Холодный голубой отблеск",
  "n-glitch": "Буквы иногда сбоят",
  "t-early": "Встаёт раньше всех",
  "t-editor": "Для монтажёров",
  "t-coder": "Для тех, кто кодит с ИИ",
  "t-eye": "Для дизайнеров",
  "t-calm": "Спокойствие и порядок",
  "t-hits": "Для продюсеров",
  "t-hustle": "Работает, пока другие отдыхают",
  "t-soul": "С ним всегда весело",
  "t-marathon": "Доводит до конца",
  "t-boss": "Строит своё дело",
  "p-dots": "Мягкие точки плывут по странице",
  "p-pastel": "Пастельные пятна дышат на фоне",
  "p-grid": "Тонкая сетка, как в чертеже",
  "p-waves": "Медленные волны внизу страницы",
  "p-stars": "Звёзды мерцают на светлом небе",
  "p-sunrise": "Тёплый рассвет за профилем",
  "p-cosmos": "Глубокий космос с туманностями",
};

export function rarity(price: number) {
  if (price >= 1000) return { id: "legend", label: "Легендарный" };
  if (price >= 500) return { id: "epic", label: "Эпический" };
  if (price >= 200) return { id: "rare", label: "Редкий" };
  return { id: "common", label: "Обычный" };
}

/** Сколько Coins даёт каждый уровень (как в базе: coins_earned) */
export const TIER_COINS = [100, 250, 500, 900, 1600, 3000];

let catalogCache: ShopItem[] | null = null;
export async function loadCatalog() {
  if (catalogCache) return catalogCache;
  const { data } = await supabase.from("shop_items").select("*").order("kind").order("sort");
  catalogCache = (data as ShopItem[]) ?? [];
  return catalogCache;
}

export function titleName(id: string | null | undefined) {
  if (!id) return null;
  return catalogCache?.find((i) => i.id === id)?.name ?? TITLE_FALLBACK[id] ?? null;
}
const TITLE_FALLBACK: Record<string, string> = {
  "t-first": "Первопроходец", "t-flow": "В потоке", "t-owl": "Ночная сова", "t-deadline": "Мастер дедлайнов",
  "t-vision": "Визионер", "t-mentor": "Наставник", "t-legend": "Легенда платформы",
  "t-early": "Ранняя пташка", "t-editor": "Монтажёр от бога", "t-coder": "Вайбкодер", "t-eye": "Глаз-алмаз", "t-calm": "Дзен",
  "t-hits": "Делает хиты", "t-hustle": "Без выходных", "t-soul": "Душа компании", "t-marathon": "Марафонец", "t-boss": "Босс",
};

/** Надетый декор для списка людей одним запросом */
export function useDecos(ids: string[]) {
  const [map, setMap] = useState<Record<string, Deco>>({});
  const key = ids.slice().sort().join(",");
  useEffect(() => {
    if (!key) return;
    supabase.from("profile_deco").select("user_id, banner, ring, name_fx, title, page_bg").in("user_id", key.split(","))
      .then(({ data }) => setMap(Object.fromEntries(((data as Deco[]) ?? []).map((d) => [d.user_id, d]))));
  }, [key]);
  return map;
}

export const CHEST_PRICE = 150;
