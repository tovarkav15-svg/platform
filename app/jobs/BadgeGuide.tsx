"use client";

import { useState } from "react";
import { JobBadge, type JobRow } from "./JobCard";

// Пример бейджа: заполнен как надо, чтобы было на что равняться
const EXAMPLE: JobRow = {
  id: "example", user_id: "example", service: "Монтаж рилсов для экспертов и брендов", niche: "montazh",
  description: "Сценарий, монтаж, цветокоррекция, субтитры и обложка. Первый ролик за 2 дня, правки бесплатно. Работал с брендами одежды и экспертами в нише фитнеса.",
  avg_check: 15000, photo_path: null, active: true, created_at: "", updated_at: "",
  cases: [
    { title: "Рилс для бренда одежды · 2,4 млн просмотров", link: "https://example.com" },
    { title: "Серия из 10 роликов для фитнес-эксперта", link: "https://example.com" },
    { title: "Подкаст: нарезка в 30 шортсов", link: "https://example.com" },
  ],
  author: { id: "example", username: "montazher", display_name: "Иван", avatar: null, accent: "edit", niches: "montazh", role: "user", headline: "", open_to_work: true, city: "", skills: "" },
};

const STEPS = [
  { key: "photo", title: "Фото", text: "Лицо или кадр из работы. Без фото возьмём аватар, но с фото откликаются чаще." },
  { key: "niche", title: "Ниша", text: "Одна главная. По ней тебя найдут в фильтре." },
  { key: "service", title: "Услуга", text: "Что именно делаешь, одной строкой. Не «монтаж», а «монтаж рилсов для экспертов»." },
  { key: "check", title: "Средний чек", text: "Сколько обычно стоит заказ. Если цена разная, укажи типичную, а детали допиши в описании." },
  { key: "cases", title: "Кейсы", text: "2–3 лучшие работы со ссылками и цифрами: просмотры, продажи, сроки." },
];

/** «Как выглядит бейдж и как его составить»: пример слева, шаги справа. Наведение на шаг подсвечивает часть бейджа */
export function BadgeGuide({ onCreate }: { onCreate?: () => void }) {
  const [hl, setHl] = useState<string | null>(null);
  const [open, setOpen] = useState(true);
  return (
    <section className={`guide ${open ? "" : "closed"}`}>
      <header className="guide-head">
        <div>
          <span className="label">Пример</span>
          <h2 className="h-md caps">Как <span className="it">составить</span> бейдж</h2>
        </div>
        <button type="button" className="link-btn" onClick={() => setOpen((v) => !v)}>{open ? "Свернуть" : "Показать пример"}</button>
      </header>
      {open && (
        <div className="guide-body">
          <div className={`guide-badge ${hl ? `hl-${hl}` : ""}`}>
            <span className="guide-stamp">пример</span>
            <JobBadge job={EXAMPLE} i={0} onOpen={() => {}} />
          </div>
          <ol className="guide-steps">
            {STEPS.map((s, i) => (
              <li key={s.key} onMouseEnter={() => setHl(s.key)} onMouseLeave={() => setHl(null)} onFocus={() => setHl(s.key)} onBlur={() => setHl(null)} tabIndex={0}
                style={{ "--i": i } as React.CSSProperties} className={hl === s.key ? "on" : ""}>
                <span className="guide-n mono">{i + 1}</span>
                <span><b>{s.title}</b><small>{s.text}</small></span>
              </li>
            ))}
            {onCreate && <li className="guide-cta"><button type="button" className="btn" onClick={onCreate}>Составить свой бейдж</button></li>}
          </ol>
        </div>
      )}
    </section>
  );
}
