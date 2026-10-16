"use client";

import { useEffect, useMemo, useState } from "react";
import { parseTable } from "@/lib/workspace";

export type AiCol = { key: string; title: string; type: string; options?: { v: string }[] };
export type AiPlan = { error?: string; updated: number; created: number; newCols: string[]; skipped: string[] };

type Preset = { id: string; label: string; task: string; answer?: (c: (key: string) => AiCol | undefined) => { cols: string[]; note?: string } };

const opts = (c?: AiCol) => (c?.options?.length ? ` Варианты для «${c.title}»: ${c.options.map((o) => o.v).join(", ")}.` : "");

// Готовые задачи. Если нужен ответ таблицей, просим колонки с теми же названиями, что и у пользователя
const PRESETS: Preset[] = [
  {
    id: "qualify", label: "Квалифицировать",
    task: "Оцени каждого клиента: насколько он готов купить и подходит ли под мои услуги. Для каждого коротко сформулируй гипотезу, чем его зацепить.",
    answer: (c) => ({ cols: ["qualify", "hypothesis"], note: opts(c("qualify")) }),
  },
  {
    id: "messages", label: "Первые сообщения",
    task: "Напиши каждому клиенту короткое первое сообщение в Telegram (до 400 знаков): лично, по его сфере, без шаблонных фраз, с одним понятным вопросом в конце.",
    answer: () => ({ cols: ["Сообщение"] }),
  },
  {
    id: "next", label: "Следующие шаги",
    task: "Для каждого клиента предложи один конкретный следующий шаг, чтобы довести его до сделки, с учётом квалифая, гипотезы и итога сделки.",
    answer: () => ({ cols: ["comment"] }),
  },
  {
    id: "analysis", label: "Анализ базы",
    task: "Проанализируй мою базу клиентов: какие сферы самые перспективные, где я теряю клиентов, кому написать в первую очередь и почему. Дай 5–7 конкретных выводов и план на неделю.",
  },
  { id: "custom", label: "Свой запрос", task: "" },
];

const cell = (s: string) => s.replace(/\|/g, "/").replace(/\s*\n\s*/g, " ").trim();

/** Таблица в Markdown: нейронки читают её лучше всего */
function markdown(cols: AiCol[], rows: string[][]) {
  return [
    `| ${cols.map((c) => cell(c.title)).join(" | ")} |`,
    `| ${cols.map(() => "---").join(" | ")} |`,
    ...rows.map((r) => `| ${r.map((v) => cell(v) || " ").join(" | ")} |`),
  ].join("\n");
}

/** Ответ нейронки: Markdown-таблица, TSV из Excel или CSV */
export function parseAnswer(text: string): string[][] {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const md = lines.filter((l) => l.startsWith("|"));
  if (md.length >= 2) {
    return md
      .filter((l) => !/^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/.test(l))
      .map((l) => l.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim().replace(/^\*\*(.*)\*\*$/, "$1")));
  }
  return parseTable(text.trim());
}

const URL_LIMIT = 7000;
const plural = (n: number, one: string, few: string, many: string) => {
  const a = n % 100, b = n % 10;
  return a > 10 && a < 20 ? many : b === 1 ? one : b >= 2 && b <= 4 ? few : many;
};

export function ClientsAi({ columns, allColumns, rows, selected, getRow, keyTitle, onPlan, onApply, onClose }: {
  columns: AiCol[]; allColumns: AiCol[]; rows: number; selected: number;
  getRow: (onlySelected: boolean) => string[][]; keyTitle: string;
  onPlan: (t: string[][]) => AiPlan; onApply: (t: string[][], addNew: boolean) => Promise<string>; onClose: () => void;
}) {
  const [step, setStep] = useState<"send" | "back">("send");
  const [preset, setPreset] = useState<Preset>(PRESETS[0]);
  const [task, setTask] = useState(PRESETS[0].task);
  const [onlySel, setOnlySel] = useState(selected > 0);
  const [note, setNote] = useState("");
  const [answer, setAnswer] = useState("");
  const [addNew, setAddNew] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onClose]);

  const byKey = (k: string) => allColumns.find((c) => c.key === k);
  const prompt = useMemo(() => {
    const data = getRow(onlySel);
    const ans = preset.answer?.(byKey);
    const titles = ans?.cols.map((k) => byKey(k)?.title ?? k) ?? [];
    const format = ans
      ? `Ответь только таблицей в формате Markdown с колонками: ${[keyTitle, ...titles].join(" | ")}. Колонку «${keyTitle}» перепиши без изменений: по ней я вставлю ответ обратно в свою таблицу.${ans.note ?? ""}`
      : "Ответ дай по-русски, коротко и по делу.";
    return [
      "Я фрилансер, веду базу клиентов. Ниже моя таблица клиентов.",
      "",
      `Задача: ${task.trim() || "(опиши задачу)"}`,
      "",
      `Таблица (${data.length} ${plural(data.length, "строка", "строки", "строк")}):`,
      markdown(columns, data),
      "",
      format,
    ].join("\n");
  }, [preset, task, onlySel, columns]);

  const count = onlySel ? selected : rows;
  const plan = useMemo(() => {
    const t = parseAnswer(answer);
    return t.length >= 2 ? onPlan(t) : null;
  }, [answer]);

  async function copy() {
    try { await navigator.clipboard.writeText(prompt); return true; } catch { return false; }
  }
  async function openIn(site: "chatgpt" | "claude") {
    const base = site === "chatgpt" ? "https://chatgpt.com/" : "https://claude.ai/new";
    const q = encodeURIComponent(prompt);
    const ok = await copy();
    if (q.length <= URL_LIMIT) {
      window.open(`${base}?q=${q}`, "_blank", "noopener");
      setNote(ok ? "Запрос открылся в новой вкладке и скопирован на всякий случай." : "Запрос открылся в новой вкладке.");
    } else {
      window.open(base, "_blank", "noopener");
      setNote(ok ? "Таблица большая, поэтому запрос скопирован. Вставь его в чат: ⌘V или Ctrl+V." : "Таблица большая: скопируй запрос из поля ниже и вставь в чат.");
    }
    setStep("back");
  }

  return (
    <div className="sheet-modal" role="dialog" aria-label="Клиенты и нейронка" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-body card ai-modal">
        <header className="modal-head">
          <h2 className="h-md caps">Клиенты <span className="it">и</span> нейронка</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть">×</button>
        </header>

        <div className="seg small" role="tablist" aria-label="Шаг">
          <button type="button" role="tab" className="seg-item" aria-current={step === "send" ? "page" : undefined} onClick={() => setStep("send")}>1. Отправить</button>
          <button type="button" role="tab" className="seg-item" aria-current={step === "back" ? "page" : undefined} onClick={() => setStep("back")}>2. Вставить ответ</button>
        </div>

        {step === "send" ? (
          <>
            <div className="ai-presets" role="radiogroup" aria-label="Задача">
              {PRESETS.map((p) => (
                <button key={p.id} type="button" role="radio" aria-checked={preset.id === p.id} className={preset.id === p.id ? "on" : ""}
                  onClick={() => { setPreset(p); setTask(p.task); }}>{p.label}</button>
              ))}
            </div>
            <label className="cd-field" htmlFor="ai-task">
              <span className="label">Что сделать</span>
              <textarea id="ai-task" className="cd-input" rows={3} value={task} onChange={(e) => setTask(e.target.value)}
                placeholder="Например: найди клиентов из сферы ИИ и напиши им предложение про монтаж" />
            </label>
            <div className="ai-scope">
              <label className="mini-toggle"><input type="radio" name="ai-scope" checked={!onlySel} onChange={() => setOnlySel(false)} />Все строки в таблице <span>{rows}</span></label>
              <label className="mini-toggle"><input type="radio" name="ai-scope" checked={onlySel} disabled={!selected} onChange={() => setOnlySel(true)} />Только отмеченные <span>{selected || "отметь галочками"}</span></label>
            </div>
            <details className="ai-preview">
              <summary>Посмотреть запрос · {prompt.length.toLocaleString("ru-RU")} знаков</summary>
              <textarea readOnly value={prompt} rows={8} className="cd-input mono" aria-label="Текст запроса" onFocus={(e) => e.currentTarget.select()} />
            </details>
            <p className="hint ai-privacy">В запрос попадут только видимые колонки и {count} {plural(count, "клиент", "клиента", "клиентов")}. Данные уйдут в выбранную нейронку под твоим аккаунтом там.</p>
            <div className="ai-actions">
              <button type="button" className="btn" disabled={!count} onClick={() => openIn("chatgpt")}>Открыть в ChatGPT</button>
              <button type="button" className="btn" disabled={!count} onClick={() => openIn("claude")}>Открыть в Claude</button>
              <button type="button" className="btn ghost" disabled={!count} onClick={async () => { setNote((await copy()) ? "Запрос скопирован. Вставь его в любую нейронку: DeepSeek, Gemini, Perplexity." : "Не получилось скопировать: открой «Посмотреть запрос» и скопируй вручную."); }}>Скопировать для другой</button>
            </div>
            {note && <p className="hint good">{note}</p>}
          </>
        ) : (
          <>
            <p className="lead small">Скопируй ответ нейронки целиком и вставь сюда. Строки найдутся по колонке «{keyTitle}», а значения встанут в колонки с такими же названиями.</p>
            <textarea className="cd-input mono ai-answer" rows={9} value={answer} onChange={(e) => setAnswer(e.target.value)} aria-label="Ответ нейронки"
              placeholder={`| ${keyTitle} | Квалифай | Гипотеза |\n| --- | --- | --- |\n| @username | Тёплый | ... |`} />
            {answer.trim() && (
              plan?.error || !plan ? <p className="hint bad">{plan?.error ?? "Не вижу таблицы. Попроси нейронку ответить таблицей в Markdown."}</p> : (
                <div className="ai-plan">
                  <span>Обновится клиентов: <b>{plan.updated}</b></span>
                  {plan.created > 0 && (
                    <label className="mini-toggle"><input type="checkbox" checked={addNew} onChange={(e) => setAddNew(e.target.checked)} />Добавить новых: <b>{plan.created}</b></label>
                  )}
                  {plan.newCols.length > 0 && <span>Новые колонки: <b>{plan.newCols.join(", ")}</b></span>}
                  {plan.skipped.length > 0 && <span className="hint">Пустые значения не трогают таблицу.</span>}
                </div>
              )
            )}
            <div className="ai-actions">
              <button type="button" className="btn" disabled={!plan || !!plan.error || busy || (!plan.updated && !(addNew && plan.created))}
                onClick={async () => { setBusy(true); const msg = await onApply(parseAnswer(answer), addNew); setBusy(false); setNote(msg); setAnswer(""); }}>
                Вставить в таблицу
              </button>
              <button type="button" className="btn ghost" onClick={() => setStep("send")}>Назад</button>
            </div>
            {note && step === "back" && <p className="hint good">{note}</p>}
          </>
        )}
      </div>
    </div>
  );
}
