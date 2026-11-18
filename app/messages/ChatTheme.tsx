"use client";

import { useEffect, useState } from "react";

// Оформление переписки: обои и цвет своих сообщений. Своё у каждого чата, хранится на этом устройстве
export const THEMES = [
  { id: "classic", name: "Классика" },
  { id: "lavender", name: "Лаванда" },
  { id: "ocean", name: "Океан" },
  { id: "sunset", name: "Закат" },
  { id: "mint", name: "Мята" },
  { id: "peach", name: "Персик" },
  { id: "night", name: "Ночь" },
  { id: "neon", name: "Неон" },
] as const;
export type ThemeId = (typeof THEMES)[number]["id"];

const key = (chatId: string) => `chat:theme:${chatId}`;
const DEF = "chat:theme:default";

export function useChatTheme(chatId: string) {
  const [theme, setThemeState] = useState<ThemeId>("classic");
  useEffect(() => {
    try { setThemeState((localStorage.getItem(key(chatId)) || localStorage.getItem(DEF) || "classic") as ThemeId); } catch { setThemeState("classic"); }
  }, [chatId]);
  function setTheme(id: ThemeId, all = false) {
    setThemeState(id);
    try {
      localStorage.setItem(key(chatId), id);
      if (all) localStorage.setItem(DEF, id);
    } catch { /* приватный режим — просто без запоминания */ }
  }
  return [theme, setTheme] as const;
}

/** Обои: мягкие цветные пятна медленно перетекают, сверху лёгкий узор */
export function Wallpaper() {
  return (
    <div className="th-wall" aria-hidden="true">
      <i /><i /><i /><i />
      <span className="th-pattern" />
    </div>
  );
}

export function ThemePicker({ value, onPick, onClose }: { value: ThemeId; onPick: (id: ThemeId, all: boolean) => void; onClose: () => void }) {
  const [all, setAll] = useState(false);
  return (
    <div className="th-sheet" role="dialog" aria-label="Оформление чата">
      <header><b>Оформление чата</b><button type="button" className="icon-btn sm" onClick={onClose} aria-label="Закрыть">×</button></header>
      <div className="th-grid">
        {THEMES.map((t) => (
          <button key={t.id} type="button" className={`th-tile th-${t.id}`} aria-pressed={value === t.id} onClick={() => onPick(t.id, all)}>
            <span className="th-mini">
              <Wallpaper />
              <em className="in" /><em className="out" /><em className="out s" />
            </span>
            <small>{t.name}</small>
          </button>
        ))}
      </div>
      <label className="th-all"><input type="checkbox" checked={all} onChange={(e) => { setAll(e.target.checked); if (e.target.checked) onPick(value, true); }} />Сделать оформлением для всех чатов</label>
    </div>
  );
}
