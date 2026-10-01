export const NICHES = [
  { id: "montazh", title: "Монтаж", color: "var(--c-edit)" },
  { id: "vibecoding", title: "Вайбкодинг", color: "var(--c-vibe)" },
  { id: "ai", title: "ИИ", color: "var(--c-ai)" },
  { id: "media", title: "Медиасфера", color: "var(--c-media)" },
  { id: "producer", title: "Продюсер", color: "var(--c-prod)" },
  { id: "brand", title: "Бренд одежды", color: "var(--c-brand)" },
  { id: "infobiz", title: "Инфобиз", color: "var(--c-info)" },
  { id: "infographics", title: "Инфографика", color: "var(--c-graph)" },
  { id: "scaling", title: "Масштабирование", color: "var(--c-scale)" },
] as const;

export type NicheId = (typeof NICHES)[number]["id"];

export function parseNiches(value: string) {
  const ids = value.split(",").filter(Boolean);
  return NICHES.filter((n) => ids.includes(n.id));
}
