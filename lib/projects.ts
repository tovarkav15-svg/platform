// My Projects: статусы, сроки, прогресс
import { fromIso, today } from "./plans";

export type ProjectStatus = "idea" | "active" | "review" | "done" | "paused";
export type Stage = { id: string; t: string; done: boolean; due?: string | null };
export type Project = {
  id: string; user_id: string; title: string; client: string; description: string;
  status: ProjectStatus; priority: 0 | 1 | 2 | 3; color: string;
  start_date: string | null; deadline: string | null; budget: number; paid: number; link: string;
  tasks: Stage[]; position: number; done_at: string | null; created_at: string; updated_at: string;
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
