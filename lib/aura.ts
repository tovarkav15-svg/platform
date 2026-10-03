// AURA — очки репутации платформы. Начисляет база (функция aura_table), здесь — уровни и правила для показа

export const TIERS = [
  { min: 0, name: "Искра", color: "#9aa0a6", icon: "·" },
  { min: 50, name: "Огонёк", color: "#E8925A", icon: "◦" },
  { min: 100, name: "Пламя", color: "#FF6A3D", icon: "▲" },
  { min: 175, name: "Жар", color: "#E5484D", icon: "◆" },
  { min: 250, name: "Сияние", color: "#E8B100", icon: "✦" },
  { min: 400, name: "Луч", color: "#1FA67A", icon: "⟋" },
  { min: 600, name: "Звезда", color: "#2F7BFF", icon: "★" },
  { min: 900, name: "Созвездие", color: "#0EA5B7", icon: "⁂" },
  { min: 1200, name: "Сверхновая", color: "#7B61FF", icon: "✺" },
  { min: 1800, name: "Галактика", color: "#A64DFF", icon: "◎" },
  { min: 2500, name: "Легенда", color: "#FF4F8B", icon: "♛" },
  { min: 4000, name: "Миф", color: "#C98A00", icon: "∞" },
] as const;

const ROMAN = ["I", "II", "III"];

/** Уровень и ступень внутри него (I → II → III). На «Мифе» ступени каждые 1500 AURA */
export function tierOf(aura: number) {
  let i = 0;
  TIERS.forEach((t, k) => { if (aura >= t.min) i = k; });
  const cur = TIERS[i], next = TIERS[i + 1];
  const span = next ? next.min - cur.min : 1500;
  const div = next ? Math.min(2, Math.floor(((aura - cur.min) / span) * 3)) : Math.min(2, Math.floor((aura - cur.min) / span));
  const divMin = next ? cur.min + Math.round((span / 3) * div) : cur.min + span * div;
  const divNext = next ? (div < 2 ? cur.min + Math.round((span / 3) * (div + 1)) : next.min) : div < 2 ? cur.min + span * (div + 1) : null;
  return {
    ...cur, index: i, next,
    progress: next ? (aura - cur.min) / span : 1,
    division: ROMAN[div],
    fullName: `${cur.name} ${ROMAN[div]}`,
    /** до следующей ступени (или уровня) */
    stepNext: divNext,
    stepProgress: divNext ? (aura - divMin) / (divNext - divMin) : 1,
  };
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

/** Премиум-стикеры открываются с уровня «Сияние» (порог тот же — 250) */
export const PREMIUM_AURA = 250;
