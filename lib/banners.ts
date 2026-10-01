// Готовые баннеры профиля: светлые, с медленно плывущим градиентом
export const BANNERS = [
  { id: "accent", title: "Мой цвет" },
  { id: "aurora", title: "Аврора" },
  { id: "sunset", title: "Закат" },
  { id: "mint", title: "Мята" },
  { id: "grid", title: "Сетка" },
  { id: "dots", title: "Точки" },
] as const;

export type BannerId = (typeof BANNERS)[number]["id"];
export const isBanner = (id: string): id is BannerId => BANNERS.some((b) => b.id === id);
