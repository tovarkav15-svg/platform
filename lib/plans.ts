// Планировщик в духе TickTick: даты, быстрый ввод, повторы

export type Repeat = "" | "daily" | "weekdays" | "weekly" | "monthly" | "yearly";
export type PlanList = { id: string; user_id: string; name: string; color: string; position: number };
export type Subtask = { id: string; t: string; done: boolean };
export type PlanTask = {
  id: string; user_id: string; list_id: string | null; title: string; notes: string;
  due_date: string | null; due_time: string | null; priority: 0 | 1 | 2 | 3; tags: string[];
  subtasks: Subtask[]; repeat: Repeat; done: boolean; done_at: string | null; position: number; created_at: string;
};

export const PRIORITY = [
  { v: 0, label: "Без приоритета", c: "#B5B5B2" },
  { v: 1, label: "Низкий", c: "#2F7BFF" },
  { v: 2, label: "Средний", c: "#E8B100" },
  { v: 3, label: "Высокий", c: "#E5484D" },
] as const;

export const REPEATS: { v: Repeat; label: string }[] = [
  { v: "", label: "Не повторять" },
  { v: "daily", label: "Каждый день" },
  { v: "weekdays", label: "По будням" },
  { v: "weekly", label: "Каждую неделю" },
  { v: "monthly", label: "Каждый месяц" },
  { v: "yearly", label: "Каждый год" },
];

export const pad = (n: number) => String(n).padStart(2, "0");
export const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromIso = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
export const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const today = () => iso(new Date());

export function dueLabel(date: string | null, time?: string | null) {
  if (!date) return "";
  const t = time ? ` ${time.slice(0, 5)}` : "";
  const d = fromIso(date), now = new Date();
  const diff = Math.round((d.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86400000);
  if (diff === 0) return "Сегодня" + t;
  if (diff === 1) return "Завтра" + t;
  if (diff === -1) return "Вчера" + t;
  if (diff > 1 && diff < 7) return d.toLocaleDateString("ru-RU", { weekday: "short" }) + t;
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: d.getFullYear() === now.getFullYear() ? undefined : "numeric" }) + t;
}

/** Следующая дата для повторяющейся задачи */
export function nextDue(date: string, repeat: Repeat): string {
  const d = fromIso(date);
  switch (repeat) {
    case "daily": return iso(addDays(d, 1));
    case "weekly": return iso(addDays(d, 7));
    case "weekdays": { let x = addDays(d, 1); while (x.getDay() === 0 || x.getDay() === 6) x = addDays(x, 1); return iso(x); }
    case "monthly": { const x = new Date(d); x.setMonth(x.getMonth() + 1); return iso(x); }
    case "yearly": { const x = new Date(d); x.setFullYear(x.getFullYear() + 1); return iso(x); }
    default: return date;
  }
}

const WEEKDAYS: Record<string, number> = { вс: 0, пн: 1, вт: 2, ср: 3, чт: 4, пт: 5, сб: 6,
  воскресенье: 0, понедельник: 1, вторник: 2, среду: 3, среда: 3, четверг: 4, пятницу: 5, пятница: 5, субботу: 6, суббота: 6 };
const MONTHS = ["январ", "феврал", "март", "апрел", "ма", "июн", "июл", "август", "сентябр", "октябр", "ноябр", "декабр"];

export type Parsed = { title: string; due_date: string | null; due_time: string | null; priority: 0 | 1 | 2 | 3; tags: string[]; listName: string | null; repeat: Repeat; chips: string[] };

/**
 * Быстрый ввод: «Позвонить Ане завтра в 15:00 !3 #клиенты ~Работа каждую неделю»
 * Понимает: сегодня/завтра/послезавтра, дни недели, «через 3 дня», 12.10, «12 октября»,
 * время «в 15:00» / «15:00», приоритет !1–!3 или !!!, #теги, ~список, повторы.
 */
export function parseQuick(input: string): Parsed {
  let s = ` ${input} `;
  const chips: string[] = [];
  const now = new Date();
  let date: Date | null = null, time: string | null = null, priority: 0 | 1 | 2 | 3 = 0, repeat: Repeat = "";
  const tags: string[] = [];
  let listName: string | null = null;

  const take = (re: RegExp, fn: (m: RegExpMatchArray) => void) => {
    const m = s.match(re);
    if (m) { fn(m); s = s.replace(m[0], " "); }
  };

  take(/\s(каждый день|ежедневно)\s/i, () => { repeat = "daily"; chips.push("каждый день"); });
  take(/\s(по будням)\s/i, () => { repeat = "weekdays"; chips.push("по будням"); });
  take(/\s(каждую неделю|еженедельно)\s/i, () => { repeat = "weekly"; chips.push("каждую неделю"); });
  take(/\s(каждый месяц|ежемесячно)\s/i, () => { repeat = "monthly"; chips.push("каждый месяц"); });
  take(/\s(каждый год|ежегодно)\s/i, () => { repeat = "yearly"; chips.push("каждый год"); });

  take(/\s(послезавтра)\s/i, () => { date = addDays(now, 2); });
  take(/\s(сегодня)\s/i, () => { date = now; });
  take(/\s(завтра)\s/i, () => { date = addDays(now, 1); });
  take(/\sчерез\s(\d{1,3})\s(дн|день|дня|дней)\S*\s/i, (m) => { date = addDays(now, Number(m[1])); });
  take(/\sчерез\s(неделю)\s/i, () => { date = addDays(now, 7); });
  take(/\s(?:в\s|во\s)?(пн|вт|ср|чт|пт|сб|вс|понедельник|вторник|среду|среда|четверг|пятницу|пятница|субботу|суббота|воскресенье)\s/i, (m) => {
    const target = WEEKDAYS[m[1].toLowerCase()];
    let diff = (target - now.getDay() + 7) % 7;
    if (diff === 0) diff = 7;
    date = addDays(now, diff);
  });
  take(/\s(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?\s/, (m) => {
    const y = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : now.getFullYear();
    let d = new Date(y, Number(m[2]) - 1, Number(m[1]));
    if (!m[3] && d < new Date(now.getFullYear(), now.getMonth(), now.getDate())) d = new Date(y + 1, Number(m[2]) - 1, Number(m[1]));
    date = d;
  });
  take(/\s(\d{1,2})\s(январ|феврал|март|апрел|ма[яй]|июн|июл|август|сентябр|октябр|ноябр|декабр)[а-я]*\s/i, (m) => {
    const mi = MONTHS.findIndex((x) => m[2].toLowerCase().startsWith(x));
    let d = new Date(now.getFullYear(), mi, Number(m[1]));
    if (d < new Date(now.getFullYear(), now.getMonth(), now.getDate())) d = new Date(now.getFullYear() + 1, mi, Number(m[1]));
    date = d;
  });
  take(/\s(?:в\s)?([01]?\d|2[0-3])[:.]([0-5]\d)\s/, (m) => { time = `${pad(Number(m[1]))}:${m[2]}`; if (!date) date = now; });

  take(/\s!(!!?|[1-3])\s/, (m) => { priority = (m[1] === "!!" ? 3 : m[1] === "!" ? 2 : Number(m[1])) as 0 | 1 | 2 | 3; });
  let tm: RegExpMatchArray | null;
  while ((tm = s.match(/\s#([\p{L}\d_-]{1,30})/u))) { tags.push(tm[1].toLowerCase()); s = s.replace(tm[0], " "); }
  take(/\s~([\p{L}\d_-]{1,40})/u, (m) => { listName = m[1].replace(/_/g, " "); });

  const due_date = date ? iso(date) : null;
  if (due_date) chips.unshift(dueLabel(due_date, time));
  if (priority) chips.push(PRIORITY[priority].label.toLowerCase() + " приоритет");
  tags.forEach((t) => chips.push("#" + t));
  if (listName) chips.push("в список " + listName);

  return { title: s.replace(/\s+/g, " ").trim(), due_date, due_time: time, priority, tags, listName, repeat, chips };
}

export type SmartId = "today" | "tomorrow" | "week" | "inbox" | "all" | "done";
export const SMART: { id: SmartId; label: string }[] = [
  { id: "today", label: "Сегодня" },
  { id: "tomorrow", label: "Завтра" },
  { id: "week", label: "7 дней" },
  { id: "inbox", label: "Входящие" },
  { id: "all", label: "Все" },
  { id: "done", label: "Выполненные" },
];

export function inSmart(t: PlanTask, id: SmartId) {
  const td = today(), tm = iso(addDays(new Date(), 1)), wk = iso(addDays(new Date(), 6));
  if (id === "done") return t.done;
  if (t.done) return false;
  switch (id) {
    case "today": return !!t.due_date && t.due_date <= td;
    case "tomorrow": return t.due_date === tm;
    case "week": return !!t.due_date && t.due_date <= wk;
    case "inbox": return !t.list_id;
    case "all": return true;
  }
}

/** Группы как в TickTick: Просрочено, Сегодня, Завтра, Дальше, Без даты */
export function groupTasks(list: PlanTask[]) {
  const td = today(), tm = iso(addDays(new Date(), 1));
  const groups: { id: string; label: string; items: PlanTask[] }[] = [
    { id: "overdue", label: "Просрочено", items: [] },
    { id: "today", label: "Сегодня", items: [] },
    { id: "tomorrow", label: "Завтра", items: [] },
    { id: "later", label: "Дальше", items: [] },
    { id: "nodate", label: "Без даты", items: [] },
    { id: "done", label: "Выполнено", items: [] },
  ];
  const at = (id: string) => groups.find((g) => g.id === id)!.items;
  for (const t of list) {
    if (t.done) at("done").push(t);
    else if (!t.due_date) at("nodate").push(t);
    else if (t.due_date < td) at("overdue").push(t);
    else if (t.due_date === td) at("today").push(t);
    else if (t.due_date === tm) at("tomorrow").push(t);
    else at("later").push(t);
  }
  const sorter = (a: PlanTask, b: PlanTask) =>
    (a.due_date ?? "9").localeCompare(b.due_date ?? "9") || b.priority - a.priority ||
    (a.due_time ?? "99").localeCompare(b.due_time ?? "99") || a.position - b.position;
  groups.forEach((g) => g.items.sort(g.id === "done" ? (a, b) => (b.done_at ?? "").localeCompare(a.done_at ?? "") : sorter));
  return groups.filter((g) => g.items.length);
}
