const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

export function shortTime(iso: string) {
  const d = new Date(iso), now = new Date();
  if (sameDay(d, now)) return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (sameDay(d, y)) return "вчера";
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

export function clock(iso: string) {
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

export function dayLabel(iso: string) {
  const d = new Date(iso), now = new Date();
  if (sameDay(d, now)) return "Сегодня";
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (sameDay(d, y)) return "Вчера";
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: d.getFullYear() === now.getFullYear() ? undefined : "numeric" });
}
