// AURA — очки репутации платформы. Начисляет база (функция aura_table), здесь — уровни и правила для показа

export const TIERS = [
  { min: 0, name: "Искра", color: "#9aa0a6" },
  { min: 100, name: "Пламя", color: "#FF6A3D" },
  { min: 250, name: "Сияние", color: "#E8B100" },
  { min: 600, name: "Звезда", color: "#2F7BFF" },
  { min: 1200, name: "Сверхновая", color: "#7B61FF" },
  { min: 2500, name: "Легенда", color: "#FF4F8B" },
] as const;

export function tierOf(aura: number) {
  let i = 0;
  TIERS.forEach((t, k) => { if (aura >= t.min) i = k; });
  const cur = TIERS[i], next = TIERS[i + 1];
  return { ...cur, index: i, next, progress: next ? (aura - cur.min) / (next.min - cur.min) : 1 };
}

export const RULES = [
  { key: "profile", label: "Заполненное поле профиля", pts: 15, cap: "до 6 полей" },
  { key: "works", label: "Работа в Proof of Work", pts: 50, cap: "до 30 работ" },
  { key: "projects", label: "Проект в профиле", pts: 60, cap: "до 15 проектов" },
  { key: "milestones", label: "Этап проекта готов", pts: 20, cap: "до 100 этапов" },
  { key: "goals", label: "Цель покорена", pts: 60, cap: "до 30 целей" },
  { key: "tasks", label: "Задача выполнена", pts: 5, cap: "до 300 задач" },
  { key: "friends", label: "Друг на платформе", pts: 10, cap: "до 150 друзей" },
  { key: "subs", label: "Подписчик твоего канала", pts: 3, cap: "до 1000 подписчиков" },
  { key: "days", label: "Активный день", pts: 10, cap: "за последние 60 дней" },
  { key: "articles", label: "Статья в Обучении", pts: 100, cap: "без ограничений" },
] as const;

/** Премиум-стикеры открываются с уровня «Сияние» */
export const PREMIUM_AURA = 250;
