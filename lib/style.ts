// Персонализация профиля: акцентный цвет и обложка
export const ACCENTS = {
  edit: { title: "Оранжевый", color: "#FF6A3D" },
  vibe: { title: "Фиолетовый", color: "#7B61FF" },
  ai: { title: "Синий", color: "#2F7BFF" },
  media: { title: "Розовый", color: "#FF4F8B" },
  prod: { title: "Золотой", color: "#E8B100" },
  brand: { title: "Изумрудный", color: "#1FA67A" },
  info: { title: "Кирпичный", color: "#C2410C" },
  graph: { title: "Бирюзовый", color: "#0EA5B7" },
  scale: { title: "Графит", color: "#3A3A3A" },
} as const;

export const COVERS = {
  light: "Светлая",
  accent: "Цветная",
  night: "Ночь",
} as const;

export type AccentId = keyof typeof ACCENTS;
export type CoverId = keyof typeof COVERS;

export const accentColor = (id: string) => (ACCENTS[id as AccentId] ?? ACCENTS.edit).color;
export const isAccent = (id: string): id is AccentId => id in ACCENTS;
export const isCover = (id: string): id is CoverId => id in COVERS;
