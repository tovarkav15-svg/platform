// My Projects: статусы, сроки, прогресс
import { fromIso, today } from "./plans";

export type ProjectStatus = "idea" | "active" | "review" | "done" | "paused";
export type Stage = { id: string; t: string; done: boolean; due?: string | null };
export type Project = {
  id: string; user_id: string; title: string; client: string; description: string;
  status: ProjectStatus; priority: 0 | 1 | 2 | 3; color: string;
  start_date: string | null; deadline: string | null; budget: number; paid: number; link: string;
  tasks: Stage[]; position: number; done_at: string | null; created_at: string; updated_at: string;
  time_spent: number; timer_started_at: string | null;
};

export const STATUSES: { v: ProjectStatus; label: string; c: string }[] = [
  { v: "idea", label: "Идея", c: "#7B61FF" },
  { v: "active", label: "В работе", c: "#2F7BFF" },
  { v: "review", label: "На проверке", c: "#E8B100" },
  { v: "done", label: "Готово", c: "#1FA67A" },
  { v: "paused", label: "Пауза", c: "#8A8A87" },
];
export const statusOf = (v: ProjectStatus) => STATUSES.find((s) => s.v === v) ?? STATUSES[0];

export const PROJECT_COLORS = ["#FF6A3D", "#2F7BFF", "#7B61FF", "#1FA67A", "#E8B100", "#FF4F8B", "#0EA5B7", "#141414"];

/** Открытый проект: всё, кроме готовых и поставленных на паузу */
export const isOpen = (p: Pick<Project, "status">) => p.status !== "done" && p.status !== "paused";

/** Сколько дней до дедлайна: 0 — сегодня, меньше нуля — просрочен */
export function daysLeft(deadline: string | null) {
  if (!deadline) return null;
  return Math.round((fromIso(deadline).getTime() - fromIso(today()).getTime()) / 86400000);
}

const plural = (n: number, one: string, few: string, many: string) => {
  const a = Math.abs(n) % 100, b = a % 10;
  return a > 10 && a < 20 ? many : b === 1 ? one : b >= 2 && b <= 4 ? few : many;
};
export const daysWord = (n: number) => `${n} ${plural(n, "день", "дня", "дней")}`;

/** Подпись и тон дедлайна для карточки */
export function deadlineInfo(p: Pick<Project, "deadline" | "status">): { text: string; tone: "" | "soon" | "late" | "ok" } {
  const d = daysLeft(p.deadline);
  if (d === null) return { text: "Без дедлайна", tone: "" };
  const date = fromIso(p.deadline!).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
  if (p.status === "done") return { text: `Сдан · ${date}`, tone: "ok" };
  if (d < 0) return { text: `Просрочен на ${daysWord(-d)}`, tone: "late" };
  if (d === 0) return { text: "Дедлайн сегодня", tone: "late" };
  if (d === 1) return { text: "Дедлайн завтра", tone: "soon" };
  if (d <= 3) return { text: `Через ${daysWord(d)}`, tone: "soon" };
  return { text: `${date} · через ${daysWord(d)}`, tone: "" };
}

/** Прогресс по этапам; у готового проекта всегда 100% */
export function progress(p: Pick<Project, "tasks" | "status">) {
  if (p.status === "done") return 1;
  const all = p.tasks?.length ?? 0;
  return all ? p.tasks.filter((t) => t.done).length / all : 0;
}

/** Следующий незакрытый этап — то, что делать дальше */
export const nextStage = (p: Pick<Project, "tasks">) => p.tasks.find((t) => !t.done) ?? null;

/** Сколько дней проект не трогали (по последнему изменению) */
export const staleDays = (p: Pick<Project, "updated_at">) => Math.floor((Date.now() - new Date(p.updated_at).getTime()) / 86400000);
export const STALE_AFTER = 7;
export const isStale = (p: Project) => (p.status === "active" || p.status === "review") && staleDays(p) >= STALE_AFTER;

/** Потраченное время в секундах, с учётом идущего таймера */
export const spent = (p: Pick<Project, "time_spent" | "timer_started_at">, now = Date.now()) =>
  (p.time_spent ?? 0) + (p.timer_started_at ? Math.max(0, Math.floor((now - new Date(p.timer_started_at).getTime()) / 1000)) : 0);

export function fmtDur(sec: number) {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return h ? `${h} ч${m ? ` ${m} мин` : ""}` : `${m} мин`;
}
export function fmtClock(sec: number) {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Группа срочности для списка */
export type Bucket = "late" | "soon" | "week" | "later" | "nodate" | "paused" | "done";
export const BUCKETS: { v: Bucket; label: string }[] = [
  { v: "late", label: "Просрочено" },
  { v: "soon", label: "Ближайшие 3 дня" },
  { v: "week", label: "На этой неделе" },
  { v: "later", label: "Позже" },
  { v: "nodate", label: "Без дедлайна" },
  { v: "paused", label: "На паузе" },
  { v: "done", label: "Готово" },
];
export function bucketOf(p: Project): Bucket {
  if (p.status === "done") return "done";
  if (p.status === "paused") return "paused";
  const d = daysLeft(p.deadline);
  if (d === null) return "nodate";
  if (d < 0) return "late";
  if (d <= 3) return "soon";
  if (d <= 7) return "week";
  return "later";
}

/** Готовые наборы этапов */
export const STAGE_TEMPLATES: { label: string; stages: string[] }[] = [
  { label: "Сайт", stages: ["Бриф", "Прототип", "Дизайн", "Вёрстка", "Правки", "Сдача"] },
  { label: "Монтаж", stages: ["Материалы", "Черновой монтаж", "Цвет и звук", "Правки", "Сдача"] },
  { label: "Дизайн", stages: ["Бриф", "Референсы", "Концепт", "Правки", "Исходники"] },
  { label: "Контент", stages: ["Контент-план", "Съёмка", "Монтаж", "Публикация"] },
];
