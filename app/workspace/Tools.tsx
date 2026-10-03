"use client";

import { useEffect, useRef, useState } from "react";
import { NICHES } from "@/lib/niches";
import { rub } from "@/lib/workspace";

const TOOLS = [
  { id: "kp", label: "КП за минуту", sub: "Предложение клиенту", icon: "✉" },
  { id: "msg", label: "Шаблоны", sub: "Что написать клиенту", icon: "❝" },
  { id: "rate", label: "Ставка", sub: "Сколько брать за час", icon: "₽" },
  { id: "pomo", label: "Помодоро", sub: "25 минут фокуса", icon: "◔" },
] as const;
type ToolId = (typeof TOOLS)[number]["id"];
const ls = { get: (k: string, d: string) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } }, set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch {} } };

/** Инструменты фрилансера: всё считается и хранится прямо в браузере */
export function Tools({ name }: { name: string }) {
  const [tool, setTool] = useState<ToolId>("kp");
  useEffect(() => { const t = ls.get("tools:last", "kp") as ToolId; if (TOOLS.some((x) => x.id === t)) setTool(t); }, []);
  const pick = (t: ToolId) => { setTool(t); ls.set("tools:last", t); };
  return (
    <div className="tl">
      <nav className="tl-nav">
        {TOOLS.map((t) => (
          <button key={t.id} type="button" className="tl-tab" aria-current={tool === t.id ? "page" : undefined} onClick={() => pick(t.id)}>
            <i aria-hidden="true">{t.icon}</i><span><b>{t.label}</b><small>{t.sub}</small></span>
          </button>
        ))}
      </nav>
      <div className="tl-body" key={tool}>
        {tool === "kp" && <Proposal name={name} />}
        {tool === "msg" && <Templates name={name} />}
        {tool === "rate" && <RateCalc />}
        {tool === "pomo" && <Pomodoro />}
      </div>
    </div>
  );
}

/* ───────── КП ───────── */
const NICHE_PITCH: Record<string, { task: string; items: string }> = {
  montazh: { task: "Монтаж роликов для YouTube и Reels", items: "Монтаж и цветокоррекция\nДинамичные субтитры\nЗвук и музыка без авторских проблем\n2 круга правок" },
  vibecoding: { task: "Сайт под ключ", items: "Дизайн и вёрстка под мобильные\nФорма заявок и аналитика\nДомен, хостинг, SSL\nПередача доступов и инструкция" },
  ai: { task: "Внедрение ИИ в процессы", items: "Разбор задач и подбор инструментов\nНастройка ассистента под ваш бизнес\nИнструкции для команды\nМесяц поддержки" },
  media: { task: "Ведение соцсетей", items: "Контент-план на месяц\n12 постов и 8 рилс\nОформление профиля\nОтчёт по охватам" },
  producer: { task: "Продюсирование запуска", items: "Стратегия и упаковка продукта\nВоронка и прогрев\nКоманда подрядчиков\nСопровождение запуска" },
  brand: { task: "Разработка дропа одежды", items: "Концепция и мудборд\nЛекала и подбор ткани\nОбразцы и производство\nСъёмка лукбука" },
  infobiz: { task: "Упаковка онлайн-курса", items: "Структура и программа\nЛендинг и оплата\nПлатформа и доступы\nСценарий прогрева" },
  design: { task: "Дизайн сайта или айдентики", items: "Мудборд и 2 концепции\nЛоготип и фирменные цвета\nМакеты в Figma для десктопа и телефона\nИсходники и гайд по стилю" },
  infographics: { task: "Инфографика для маркетплейсов", items: "10 слайдов карточки\nТексты и иконки\nАдаптация под WB и Ozon\n2 круга правок" },
  scaling: { task: "Масштабирование бизнеса", items: "Аудит воронки и юнит-экономики\nПлан роста на 3 месяца\nНайм и регламенты\nЕженедельные созвоны" },
};

function Proposal({ name }: { name: string }) {
  const [f, setF] = useState(() => ({ niche: "montazh", client: "", task: NICHE_PITCH.montazh.task, items: NICHE_PITCH.montazh.items, days: "7", price: "30000", prepay: "50", bonus: "", contact: "" }));
  const [print, setPrint] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => { try { const s = localStorage.getItem("tools:kp"); if (s) setF((x) => ({ ...x, ...JSON.parse(s) })); } catch {} }, []);
  const set = (patch: Partial<typeof f>) => setF((x) => { const n = { ...x, ...patch }; ls.set("tools:kp", JSON.stringify(n)); return n; });
  const items = f.items.split("\n").map((s) => s.trim()).filter(Boolean);
  const price = Number(f.price) || 0;
  const pre = Math.round((price * (Number(f.prepay) || 0)) / 100);
  const text = [
    `${f.client ? `${f.client}, здравствуйте!` : "Здравствуйте!"}`,
    ``,
    `Подготовил предложение по задаче: ${f.task || "—"}.`,
    ``,
    `Что входит:`,
    ...items.map((i) => `— ${i}`),
    ``,
    `Срок: ${f.days} ${Number(f.days) % 10 === 1 && Number(f.days) % 100 !== 11 ? "день" : [2, 3, 4].includes(Number(f.days) % 10) && ![12, 13, 14].includes(Number(f.days) % 100) ? "дня" : "дней"}`,
    `Стоимость: ${rub(price)}${pre ? ` (предоплата ${f.prepay}% — ${rub(pre)})` : ""}`,
    ...(f.bonus ? [``, `Бонус: ${f.bonus}`] : []),
    ``,
    `Если всё подходит — начну сразу после предоплаты. Готов ответить на вопросы и созвониться.`,
    ``,
    `${name}${f.contact ? `\n${f.contact}` : ""}`,
  ].join("\n");
  return (
    <div className="tl-split">
      <div className="tl-card tl-form">
        <label className="field"><span>Ниша — подставит пример</span>
          <select className="mini-select" value={f.niche} onChange={(e) => set({ niche: e.target.value, ...NICHE_PITCH[e.target.value] })}>
            {NICHES.map((n) => <option key={n.id} value={n.id}>{n.title}</option>)}
          </select>
        </label>
        <label className="field"><span>Клиент</span><input className="bl-in" value={f.client} onChange={(e) => set({ client: e.target.value })} placeholder="Анна / Студия «Луч»" /></label>
        <label className="field"><span>Задача</span><input className="bl-in" value={f.task} onChange={(e) => set({ task: e.target.value })} /></label>
        <label className="field"><span>Что входит — по строке на пункт</span><textarea className="bl-in" rows={5} value={f.items} onChange={(e) => set({ items: e.target.value })} /></label>
        <div className="tl-row3">
          <label className="field"><span>Срок, дней</span><input className="bl-in mono" inputMode="numeric" value={f.days} onChange={(e) => set({ days: e.target.value.replace(/\D/g, "") })} /></label>
          <label className="field"><span>Цена, ₽</span><input className="bl-in mono" inputMode="numeric" value={f.price} onChange={(e) => set({ price: e.target.value.replace(/\D/g, "") })} /></label>
          <label className="field"><span>Предоплата, %</span><input className="bl-in mono" inputMode="numeric" value={f.prepay} onChange={(e) => set({ prepay: e.target.value.replace(/\D/g, "").slice(0, 3) })} /></label>
        </div>
        <label className="field"><span>Бонус (по желанию)</span><input className="bl-in" value={f.bonus} onChange={(e) => set({ bonus: e.target.value })} placeholder="Обложка для ролика в подарок" /></label>
        <label className="field"><span>Контакт</span><input className="bl-in" value={f.contact} onChange={(e) => set({ contact: e.target.value })} placeholder="t.me/username" /></label>
      </div>
      <div className="tl-card tl-preview">
        <div className="tl-preview-head"><b>Готовый текст</b><small>можно сразу отправить в чат</small></div>
        <pre className="tl-text">{text}</pre>
        <div className="save-row">
          <button type="button" className="btn" onClick={() => { navigator.clipboard?.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1600); }}>{copied ? "Скопировано ✓" : "Скопировать"}</button>
          <button type="button" className="btn ghost" onClick={() => setPrint(true)}>PDF-версия</button>
        </div>
      </div>
      {print && (
        <div className="bl-modal inv-wrap" role="dialog" aria-label="Коммерческое предложение" onClick={() => setPrint(false)}>
          <div className="inv-doc kp-doc" onClick={(e) => e.stopPropagation()}>
            <div className="inv-top">
              <div><span className="inv-brand">Коммерческое предложение</span><h2>{f.task}</h2><small>для {f.client || "клиента"} · {new Date().toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}</small></div>
              <div className="inv-sum"><small>Стоимость</small><b className="mono">{rub(price)}</b><small>срок {f.days} дн.</small></div>
            </div>
            <div className="kp-items">{items.map((i, k) => <div key={k}><span className="mono">{String(k + 1).padStart(2, "0")}</span>{i}</div>)}</div>
            <div className="inv-parties">
              <div><small>Предоплата</small><b>{pre ? `${f.prepay}% · ${rub(pre)}` : "без предоплаты"}</b></div>
              <div><small>Исполнитель</small><b>{name}</b>{f.contact && <small>{f.contact}</small>}</div>
            </div>
            {f.bonus && <p className="inv-note">🎁 {f.bonus}</p>}
            <div className="inv-actions"><button type="button" className="btn" onClick={() => window.print()}>Печать / сохранить PDF</button><button type="button" className="btn ghost" onClick={() => setPrint(false)}>Закрыть</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ───────── Шаблоны ───────── */
const TPL: { title: string; text: string }[] = [
  { title: "Первое сообщение", text: "{клиент}, здравствуйте! Увидел, что вам нужен(а) {услуга}. Я делаю это {опыт} — вот пара работ: {ссылка}. Расскажите подробнее о задаче? Могу предложить решение уже сегодня." },
  { title: "Уточнить бриф", text: "{клиент}, чтобы оценить точно, ответьте на 4 вопроса:\n1. Какая главная цель?\n2. Есть ли примеры, которые нравятся?\n3. Какие сроки?\n4. Какой бюджет закладываете?\nПосле этого пришлю КП." },
  { title: "Дожать после тишины", text: "{клиент}, добрый день! Возвращаюсь к нашему разговору про {услуга}. Актуально ли ещё? Если сейчас не время — скажите, напомню позже 🙂" },
  { title: "Напомнить об оплате", text: "{клиент}, здравствуйте! Напоминаю про оплату {сумма} за {услуга} — срок был {дата}. Реквизиты продублирую ниже. Если есть вопросы — на связи." },
  { title: "Поднять цену", text: "{клиент}, спасибо, что работаем вместе! С {дата} стоимость {услуга} будет {сумма}: выросли объём и качество. Все текущие договорённости сохраняю по старой цене." },
  { title: "Вежливо отказать", text: "{клиент}, спасибо за доверие! Сейчас не смогу взять {услуга} так, чтобы сделать это хорошо. Могу порекомендовать коллегу или вернуться к задаче с {дата}." },
  { title: "Попросить отзыв", text: "{клиент}, рад, что всё получилось! Если не сложно, оставьте пару слов о работе в моём профиле на Relic — это очень помогает. Спасибо!" },
  { title: "Сдать работу", text: "{клиент}, готово! Ссылка на результат: {ссылка}. В работу входило всё по договорённости, плюс небольшой бонус от меня. Жду обратную связь — правки внесу быстро." },
];

function Templates({ name }: { name: string }) {
  const [v, setV] = useState({ клиент: "", услуга: "", сумма: "", дата: "", ссылка: "", опыт: "3 года" });
  const [copied, setCopied] = useState<number | null>(null);
  const fill = (t: string) => t.replace(/\{(клиент|услуга|сумма|дата|ссылка|опыт)\}/g, (_, k: keyof typeof v) => v[k] || `[${k}]`);
  return (
    <div className="tl-tpl">
      <div className="tl-card tl-vars">
        {(Object.keys(v) as (keyof typeof v)[]).map((k) => (
          <label key={k} className="field"><span>{k}</span><input className="bl-in" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} placeholder={k === "сумма" ? "25 000 ₽" : k === "дата" ? "1 ноября" : ""} /></label>
        ))}
      </div>
      <div className="tl-tpl-grid">
        {TPL.map((t, i) => (
          <article key={t.title} className="tl-card tl-msg" style={{ "--i": i } as React.CSSProperties}>
            <b>{t.title}</b>
            <p>{fill(t.text)}</p>
            <small>— {name}</small>
            <button type="button" className="chip-btn" onClick={() => { navigator.clipboard?.writeText(fill(t.text)); setCopied(i); setTimeout(() => setCopied(null), 1500); }}>{copied === i ? "Скопировано ✓" : "Скопировать"}</button>
          </article>
        ))}
      </div>
    </div>
  );
}

/* ───────── Ставка ───────── */
function RateCalc() {
  const [income, setIncome] = useState(150000);
  const [costs, setCosts] = useState(15000);
  const [hours, setHours] = useState(5);
  const [days, setDays] = useState(5);
  const [rest, setRest] = useState(4);
  const yearHours = hours * days * (52 - rest);
  const min = yearHours ? Math.ceil((((income + costs) * 12) / yearHours) / 50) * 50 : 0;
  const safe = Math.ceil((min * 1.3) / 50) * 50;
  const num = (s: string) => Number(s.replace(/\D/g, "")) || 0;
  return (
    <div className="tl-card bl-calc">
      <div className="bl-calc-grid">
        <label className="field"><span>Хочу зарабатывать в месяц, ₽</span><input className="bl-in mono" inputMode="numeric" value={income} onChange={(e) => setIncome(num(e.target.value))} /></label>
        <label className="field"><span>Расходы на работу в месяц, ₽</span><input className="bl-in mono" inputMode="numeric" value={costs} onChange={(e) => setCosts(num(e.target.value))} /></label>
        <label className="field"><span>Оплачиваемых часов в день</span><input type="range" min={1} max={12} value={hours} onChange={(e) => setHours(+e.target.value)} /><em>{hours} ч</em></label>
        <label className="field"><span>Рабочих дней в неделю</span><input type="range" min={1} max={7} value={days} onChange={(e) => setDays(+e.target.value)} /><em>{days} дн</em></label>
        <label className="field"><span>Недель отдыха в год</span><input type="range" min={0} max={12} value={rest} onChange={(e) => setRest(+e.target.value)} /><em>{rest} нед</em></label>
      </div>
      <div className="bl-calc-out">
        <div><small>Минимум</small><b className="mono">{rub(min)}<i>/час</i></b></div>
        <div className="hot"><small>С запасом +30% на простои и налоги</small><b className="mono">{rub(safe)}<i>/час</i></b></div>
        <div><small>Проект на 20 часов</small><b className="mono">{rub(safe * 20)}</b></div>
      </div>
      <p className="bl-empty">Это {yearHours.toLocaleString("ru-RU")} оплачиваемых часов в год. Переписка, правки и поиск клиентов тоже занимают время — поэтому ставку лучше брать «с запасом».</p>
    </div>
  );
}

/* ───────── Помодоро ───────── */
const MODES = { focus: { label: "Фокус", min: 25, color: "#FF6A3D" }, short: { label: "Перерыв", min: 5, color: "#1FA67A" }, long: { label: "Длинный перерыв", min: 15, color: "#2F7BFF" } } as const;
type Mode = keyof typeof MODES;

function Pomodoro() {
  const [mode, setMode] = useState<Mode>("focus");
  const [left, setLeft] = useState(MODES.focus.min * 60);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const end = useRef<number | null>(null);
  const today = new Date().toDateString();
  useEffect(() => { try { const s = JSON.parse(localStorage.getItem("tools:pomo") ?? "{}"); if (s.day === today) setDone(s.n ?? 0); } catch {} }, [today]);

  useEffect(() => {
    if (!running) return;
    end.current = Date.now() + left * 1000;
    const t = setInterval(() => {
      const l = Math.max(0, Math.round(((end.current ?? 0) - Date.now()) / 1000));
      setLeft(l);
      if (l === 0) {
        clearInterval(t);
        setRunning(false);
        ding();
        if (mode === "focus") {
          const n = done + 1;
          setDone(n);
          ls.set("tools:pomo", JSON.stringify({ day: today, n }));
          switchMode(n % 4 === 0 ? "long" : "short");
        } else switchMode("focus");
      }
    }, 250);
    return () => clearInterval(t);
  }, [running]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const base = "Workspace · Инструменты";
    document.title = running ? `${fmt(left)} · ${MODES[mode].label}` : base;
    return () => { document.title = base; };
  }, [left, running, mode]);

  function switchMode(m: Mode) { setMode(m); setRunning(false); setLeft(MODES[m].min * 60); }
  const total = MODES[mode].min * 60;
  const pct = 1 - left / total;
  const R = 120, C = 2 * Math.PI * R;
  return (
    <div className="tl-card pm" style={{ "--pc": MODES[mode].color } as React.CSSProperties}>
      <div className="pm-modes">
        {(Object.keys(MODES) as Mode[]).map((m) => <button key={m} type="button" className="chip-btn" aria-pressed={mode === m} onClick={() => switchMode(m)}>{MODES[m].label} · {MODES[m].min}</button>)}
      </div>
      <div className={`pm-dial ${running ? "on" : ""}`}>
        <svg viewBox="0 0 280 280" aria-hidden="true">
          <circle cx="140" cy="140" r={R} fill="none" stroke="rgba(20,20,20,.07)" strokeWidth="14" />
          <circle cx="140" cy="140" r={R} fill="none" stroke="var(--pc)" strokeWidth="14" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - pct)} transform="rotate(-90 140 140)" style={{ transition: "stroke-dashoffset .3s linear, stroke .4s" }} />
        </svg>
        <div className="pm-center"><b className="mono">{fmt(left)}</b><small>{MODES[mode].label}</small></div>
      </div>
      <div className="pm-actions">
        <button type="button" className="btn pm-main" onClick={() => setRunning(!running)}>{running ? "Пауза" : left < total ? "Продолжить" : "Старт"}</button>
        <button type="button" className="btn ghost" onClick={() => switchMode(mode)}>Сброс</button>
      </div>
      <div className="pm-done">
        <span>Сегодня:</span>
        {Array.from({ length: Math.max(4, done) }, (_, i) => <i key={i} className={i < done ? "on" : ""} />)}
        <b>{done} {done % 10 === 1 && done % 100 !== 11 ? "сессия" : [2, 3, 4].includes(done % 10) && ![12, 13, 14].includes(done % 100) ? "сессии" : "сессий"} · {done * 25} мин фокуса</b>
      </div>
      <p className="bl-empty">25 минут работаешь, не отвлекаясь, 5 отдыхаешь, после четырёх кругов — длинный перерыв. Таймер видно во вкладке браузера.</p>
    </div>
  );
}

const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
function ding() {
  try {
    const ctx = new AudioContext();
    [0, 0.18, 0.36].forEach((d, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = [660, 880, 1100][i];
      g.gain.setValueAtTime(0.0001, ctx.currentTime + d);
      g.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + d + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + d + 0.4);
      o.connect(g).connect(ctx.destination); o.start(ctx.currentTime + d); o.stop(ctx.currentTime + d + 0.45);
    });
  } catch {}
}

