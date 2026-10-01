"use client";

import { useEffect, useState } from "react";
import { saveProfile, type SettingsState } from "./save";
import { isUsernameTaken } from "@/lib/api";
import { ProfileHeader } from "../ProfileHeader";
import { NICHES } from "@/lib/niches";
import { ACCENTS, COVERS } from "@/lib/style";
import { normalizeUsername, validateUsername, USERNAME_MAX } from "@/lib/username";

type Initial = {
  displayName: string; username: string; bio: string; accent: string; cover: string; avatar: string;
  telegram: string; website: string; niches: string; earnings: number; earningsGoal: number; showEarnings: boolean;
};

const fmt = (n: number) => (n ? n.toLocaleString("ru-RU").replace(/ /g, " ") : "");
const num = (s: string) => parseInt(s.replace(/\D/g, ""), 10) || 0;

// Уменьшаем картинку в браузере до 256×256, чтобы не хранить тяжёлые файлы
function resizeImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const size = 256;
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = size;
      const s = Math.min(img.width, img.height);
      canvas.getContext("2d")!.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      URL.revokeObjectURL(img.src);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

type Props = { userId: string; initial: Initial; founder: boolean; onSaved: () => Promise<void> };

export function ProfileForm({ userId, initial, founder, onSaved }: Props) {
  const [state, setState] = useState<SettingsState>({});
  const [pending, setPending] = useState(false);
  const e = state.errors ?? {};

  async function onSubmit(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    setPending(true);
    const result = await saveProfile(userId, initial.username, new FormData(ev.currentTarget));
    if (result.ok) await onSaved();
    setState(result);
    setPending(false);
  }

  const [f, setF] = useState({ ...initial, earnings: fmt(initial.earnings), earningsGoal: fmt(initial.earningsGoal) });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));
  const niches = f.niches.split(",").filter(Boolean);

  const [uCheck, setUCheck] = useState<{ cls: string; msg: string }>({ cls: "", msg: "" });
  useEffect(() => {
    const u = normalizeUsername(f.username);
    if (u === initial.username) return setUCheck({ cls: "", msg: "Твой текущий юзернейм" });
    const local = validateUsername(u);
    if (local) return setUCheck({ cls: "bad", msg: local });
    setUCheck({ cls: "", msg: "Проверяю…" });
    let alive = true;
    const t = setTimeout(async () => {
      const taken = await isUsernameTaken(u);
      if (alive) setUCheck(taken ? { cls: "bad", msg: "Уже занят" } : { cls: "good", msg: `@${u} свободен` });
    }, 350);
    return () => { alive = false; clearTimeout(t); };
  }, [f.username, initial.username]);

  const [avatarError, setAvatarError] = useState("");
  async function onAvatar(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return setAvatarError("Нужна картинка: JPG, PNG или WEBP");
    try { set("avatar", await resizeImage(file)); setAvatarError(""); }
    catch { setAvatarError("Не получилось открыть картинку"); }
  }

  const earnings = num(f.earnings), goal = num(f.earningsGoal);
  const pct = goal ? Math.min(100, Math.round((earnings / goal) * 100)) : 0;

  return (
    <form onSubmit={onSubmit} className="settings">
      <div className="settings-preview">
        <div className="label">Так тебя видят другие</div>
        <ProfileHeader
          displayName={f.displayName} username={normalizeUsername(f.username)} bio={f.bio}
          accent={f.accent} cover={f.cover} avatar={f.avatar} founder={founder}
        />
      </div>

      {/* Внешний вид */}
      <section className="card">
        <h2 className="h-md caps">Внешний <span className="it">вид</span></h2>

        <div className="field">
          <span>Аватар</span>
          <div className="avatar-row">
            <div className="avatar small" style={{ "--c": ACCENTS[f.accent as keyof typeof ACCENTS]?.color } as React.CSSProperties}>
              {f.avatar ? <img src={f.avatar} alt="" /> : (f.displayName || "?").slice(0, 1).toUpperCase()}
            </div>
            <label className="btn ghost" htmlFor="avatarFile">Загрузить фото</label>
            <input id="avatarFile" type="file" accept="image/*" hidden onChange={(ev) => onAvatar(ev.target.files?.[0])} />
            {f.avatar && <button type="button" className="btn ghost" onClick={() => set("avatar", "")}>Убрать</button>}
          </div>
          <input type="hidden" name="avatar" value={f.avatar} />
          <span className="hint bad">{avatarError || e.avatar}</span>
        </div>

        <fieldset className="field plain">
          <span>Акцентный цвет</span>
          <div className="swatches">
            {Object.entries(ACCENTS).map(([id, a]) => (
              <label key={id} className="swatch" title={a.title} style={{ "--c": a.color } as React.CSSProperties}>
                <input type="radio" name="accent" value={id} checked={f.accent === id} onChange={() => set("accent", id)} aria-label={a.title} />
                <span />
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="field plain">
          <span>Обложка</span>
          <div className="covers">
            {Object.entries(COVERS).map(([id, title]) => (
              <label key={id} className="cover-opt" data-cover={id} style={{ "--c": ACCENTS[f.accent as keyof typeof ACCENTS]?.color } as React.CSSProperties}>
                <input type="radio" name="cover" value={id} checked={f.cover === id} onChange={() => set("cover", id)} />
                <span className="cover-swatch" />
                <b>{title}</b>
              </label>
            ))}
          </div>
        </fieldset>
      </section>

      {/* О себе */}
      <section className="card">
        <h2 className="h-md caps">О <span className="it">себе</span></h2>
        <div className="row2">
          <label className="field">
            <span>Имя</span>
            <div className={`input ${e.displayName ? "err" : ""}`}><input id="displayName" name="displayName" value={f.displayName} maxLength={40} onChange={(ev) => set("displayName", ev.target.value)} /></div>
            <span className="hint bad">{e.displayName}</span>
          </label>
          <label className="field">
            <span>Юзернейм</span>
            <div className={`input ${e.username || uCheck.cls === "bad" ? "err" : ""}`}>
              <span className="at">@</span>
              <input id="username" name="username" value={f.username} maxLength={USERNAME_MAX} autoCapitalize="none" spellCheck={false}
                onChange={(ev) => set("username", ev.target.value.replace(/^@+/, "").toLowerCase())} />
            </div>
            <span className={`hint ${e.username ? "bad" : uCheck.cls}`}>{e.username || uCheck.msg}</span>
          </label>
        </div>

        <label className="field">
          <span>Описание <span className="count">{f.bio.length}/160</span></span>
          <div className={`input ${e.bio ? "err" : ""}`}>
            <textarea id="bio" name="bio" rows={3} maxLength={160} value={f.bio} placeholder="Чем занимаешься и к чему идёшь" onChange={(ev) => set("bio", ev.target.value)} />
          </div>
          <span className="hint bad">{e.bio}</span>
        </label>

        <fieldset className="field plain">
          <span>Ниши</span>
          <div className="chips">
            {NICHES.map((n) => (
              <label key={n.id} className="chip" style={{ "--c": n.color } as React.CSSProperties}>
                <input type="checkbox" name="niches" value={n.id} checked={niches.includes(n.id)}
                  onChange={(ev) => set("niches", (ev.target.checked ? [...niches, n.id] : niches.filter((x) => x !== n.id)).join(","))} />
                <span>{n.title}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="row2">
          <label className="field">
            <span>Telegram</span>
            <div className={`input ${e.telegram ? "err" : ""}`}><span className="at">@</span><input id="telegram" name="telegram" value={f.telegram} placeholder="username" onChange={(ev) => set("telegram", ev.target.value)} /></div>
            <span className="hint bad">{e.telegram}</span>
          </label>
          <label className="field">
            <span>Сайт или портфолио</span>
            <div className={`input ${e.website ? "err" : ""}`}><input id="website" name="website" value={f.website} placeholder="https://" onChange={(ev) => set("website", ev.target.value)} /></div>
            <span className="hint bad">{e.website}</span>
          </label>
        </div>
      </section>

      {/* Доход */}
      <section className="card money">
        <h2 className="h-md caps" style={{ position: "relative", zIndex: 1 }}>Сколько ты <span className="it">заработал</span></h2>
        <div className="row2" style={{ position: "relative", zIndex: 1 }}>
          <label className="field dark">
            <span>Заработал в этом месяце, ₽</span>
            <div className="input"><input id="earnings" name="earnings" inputMode="numeric" value={f.earnings} placeholder="0" onChange={(ev) => set("earnings", fmt(num(ev.target.value)))} /></div>
          </label>
          <label className="field dark">
            <span>Цель на месяц, ₽</span>
            <div className="input"><input id="earningsGoal" name="earningsGoal" inputMode="numeric" value={f.earningsGoal} placeholder="0" onChange={(ev) => set("earningsGoal", fmt(num(ev.target.value)))} /></div>
          </label>
        </div>
        {goal > 0 && (
          <>
            <div className="bar"><b style={{ width: `${pct}%` }} /></div>
            <div className="money-row"><span>Прогресс до цели</span><span>{pct}%</span></div>
          </>
        )}
        <label className="toggle">
          <input id="showEarnings" type="checkbox" name="showEarnings" checked={f.showEarnings} onChange={(ev) => set("showEarnings", ev.target.checked)} />
          <span className="knob" />
          <span>{f.showEarnings ? "Сумму видят все, кто открыл профиль" : "Сумму видишь только ты"}</span>
        </label>
      </section>

      <div className="save-bar">
        <span className={`hint ${state.ok ? "good" : "bad"}`}>{state.message}</span>
        <button className="btn" type="submit" disabled={pending}>{pending ? "Сохраняю…" : "Сохранить"}</button>
      </div>
    </form>
  );
}
