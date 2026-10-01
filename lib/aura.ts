// AURA — очки репутации платформы. Начисляет база (функция aura_table), здесь — уровни и правила для показа

export const TIERS = [
  { min: 0, name: "Искра", color: "#9aa0a6" },
  { min: 100, name: "Пламя", color: "#FF6A3D" },
  { min: 300, name: "Сияние", color: "#E8B100" },
  { min: 700, name: "Звезда", color: "#2F7BFF" },
  { min: 1500, name: "Сверхновая", color: "#7B61FF" },
  { min: 3000, name: "Легенда", color: "#FF4F8B" },
] as const;

export function tierOf(aura: number) {
  let i = 0;
  TIERS.forEach((t, k) => { if (aura >= t.min) i = k; });
  const cur = TIERS[i], next = TIERS[i + 1];
  return { ...cur, index: i, next, progress: next ? (aura - cur.min) / (next.min - cur.min) : 1 };
}

export const RULES = [
  { key: "works", label: "Работа в Proof of Work", pts: 30, cap: "до 20 работ" },
  { key: "projects", label: "Проект в профиле", pts: 40, cap: "до 10 проектов" },
  { key: "milestones", label: "Этап проекта готов", pts: 10, cap: "до 50 этапов" },
  { key: "goals", label: "Цель покорена", pts: 50, cap: "до 20 целей" },
  { key: "tasks", label: "Задача выполнена", pts: 2, cap: "до 150 задач" },
  { key: "friends", label: "Друг на платформе", pts: 5, cap: "до 100 друзей" },
  { key: "subs", label: "Подписчик твоего канала", pts: 2, cap: "до 500 подписчиков" },
  { key: "days", label: "Активный день", pts: 3, cap: "за последние 60 дней" },
  { key: "articles", label: "Статья в Обучении", pts: 80, cap: "без ограничений" },
] as const;

/** Премиум-стикеры открываются с уровня «Сияние» */
export const PREMIUM_AURA = 300;
