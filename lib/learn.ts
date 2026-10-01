// Обучение: описания ниш, статьи и безопасный разбор Markdown

export const NICHE_INFO: Record<string, { tagline: string; topics: string[] }> = {
  montazh: { tagline: "Ритм, звук, цвет. От рилсов до клипов", topics: ["Монтаж рилсов", "Цветокоррекция", "Звук и музыка", "Субтитры"] },
  vibecoding: { tagline: "Собираешь сайты и ботов вместе с ИИ", topics: ["Первый лендинг", "Телеграм-боты", "Промпты для кода", "Деплой"] },
  ai: { tagline: "Нейросети для работы и денег", topics: ["Промпт-инжиниринг", "Генерация картинок", "Автоматизация", "ИИ-ассистенты"] },
  media: { tagline: "Блог, охваты, контент-план", topics: ["Контент-план", "Охваты", "Сторителлинг", "Аналитика"] },
  producer: { tagline: "Запуски, команда, упаковка эксперта", topics: ["Упаковка эксперта", "Запуск продукта", "Команда", "Воронки"] },
  brand: { tagline: "Производство, дропы, мерч", topics: ["Производство", "Дропы", "Фотосъёмка", "Маркетплейсы"] },
  infobiz: { tagline: "Продукты, воронки, продажи", topics: ["Продуктовая линейка", "Вебинары", "Продажи", "Чат-боты"] },
  infographics: { tagline: "Карточки для маркетплейсов", topics: ["Карточки WB/Ozon", "Figma", "Конверсия", "Инфографика"] },
  scaling: { tagline: "Системы, делегирование, рост", topics: ["Делегирование", "Регламенты", "Найм", "Финансы"] },
};

export type Article = {
  id: string; niche: string; slug: string; title: string; summary: string; body: string; cover_path: string | null;
  level: "start" | "middle" | "pro"; author_id: string | null; published: boolean; position: number; created_at: string; updated_at: string;
};

export const LEVELS = { start: "С нуля", middle: "Практика", pro: "Профи" } as const;

export const readMinutes = (body: string) => Math.max(1, Math.round(body.trim().split(/\s+/).length / 180));

const TRANSLIT: Record<string, string> = { а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya" };
export function slugify(s: string) {
  return s.toLowerCase().split("").map((c) => TRANSLIT[c] ?? c).join("").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70) || "statya";
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Строчная разметка: **жирный**, *курсив*, `код`, [ссылка](https://…). Всё экранируется до разбора */
function inline(raw: string) {
  let s = esc(raw);
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer nofollow">$1</a>');
  return s;
}

/** Небольшой Markdown: заголовки, абзацы, списки, цитаты, картинки, разделители, блоки кода, выноски «> !» */
export function renderMarkdown(md: string): { html: string; toc: { id: string; text: string }[] } {
  const lines = md.replace(/\r/g, "").split("\n");
  const out: string[] = [];
  const toc: { id: string; text: string }[] = [];
  let list: "ul" | "ol" | null = null;
  let para: string[] = [];
  let code: string[] | null = null;

  const flushPara = () => { if (para.length) { out.push(`<p>${inline(para.join(" "))}</p>`); para = []; } };
  const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };

  for (const line of lines) {
    if (code) {
      if (line.startsWith("```")) { out.push(`<pre><code>${esc(code.join("\n"))}</code></pre>`); code = null; } else code.push(line);
      continue;
    }
    if (line.startsWith("```")) { flushPara(); closeList(); code = []; continue; }
    const t = line.trim();
    if (!t) { flushPara(); closeList(); continue; }
    let m: RegExpMatchArray | null;
    if ((m = t.match(/^(#{1,3})\s+(.+)$/))) {
      flushPara(); closeList();
      const level = m[1].length + 1; // # → h2
      const id = slugify(m[2]);
      if (level === 2) toc.push({ id, text: m[2] });
      out.push(`<h${level} id="${id}">${inline(m[2])}</h${level}>`);
    } else if (/^(-{3,}|\*{3,})$/.test(t)) {
      flushPara(); closeList(); out.push("<hr />");
    } else if ((m = t.match(/^!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)$/))) {
      flushPara(); closeList(); out.push(`<figure><img src="${esc(m[2])}" alt="${esc(m[1])}" loading="lazy" />${m[1] ? `<figcaption>${esc(m[1])}</figcaption>` : ""}</figure>`);
    } else if ((m = t.match(/^>\s?!\s?(.+)$/))) {
      flushPara(); closeList(); out.push(`<aside class="callout">${inline(m[1])}</aside>`);
    } else if ((m = t.match(/^>\s?(.+)$/))) {
      flushPara(); closeList(); out.push(`<blockquote>${inline(m[1])}</blockquote>`);
    } else if ((m = t.match(/^[-*]\s+(.+)$/))) {
      flushPara(); if (list !== "ul") { closeList(); out.push("<ul>"); list = "ul"; } out.push(`<li>${inline(m[1])}</li>`);
    } else if ((m = t.match(/^\d+[.)]\s+(.+)$/))) {
      flushPara(); if (list !== "ol") { closeList(); out.push("<ol>"); list = "ol"; } out.push(`<li>${inline(m[1])}</li>`);
    } else {
      closeList(); para.push(t);
    }
  }
  if (code) out.push(`<pre><code>${esc(code.join("\n"))}</code></pre>`);
  flushPara(); closeList();
  return { html: out.join("\n"), toc };
}

export const articleHref = (slug: string) => `/learn/article/?a=${encodeURIComponent(slug)}`;
export const nicheHref = (id: string) => `/learn/niche/?n=${encodeURIComponent(id)}`;
