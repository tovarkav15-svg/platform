"use client";

import { useEffect, useState } from "react";
import { saveProfile, type SettingsState } from "./save";
import { isUsernameTaken } from "@/lib/api";
import { ProfileHeader } from "../ProfileHeader";
import { SECTION_TITLES } from "@/lib/sections";
import { NICHES } from "@/lib/niches";
import { ACCENTS } from "@/lib/style";
import { BANNERS } from "@/lib/banners";
import { publicMedia } from "@/lib/supabase";
import { uploadPublicImage } from "@/lib/upload";
import { Banner } from "../ProfileHeader";
import { normalizeUsername, validateUsername, USERNAME_MAX } from "@/lib/username";

type Initial = {
  displayName: string; username: string; bio: string; accent: string; avatar: string; bannerPath: string; bannerPreset: string; about: string;
  telegram: string; website: string; niches: string; earnings: number; earningsGoal: number; showEarnings: boolean;
  headline: string; status: string; city: string; skills: string; openToWork: boolean; sections: string; pinnedProject: string;
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

type Props = { userId: string; initial: Initial; role: string; projects: { id: string; name: string }[]; onSaved: () => Promise<void> };

export function ProfileForm({ userId, initial, role, projects, onSaved }: Props) {
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

  // Порядок и видимость разделов: включённые по порядку, затем выключенные
  const ALL = Object.keys(SECTION_TITLES);
  const activeSections = f.sections.split(",").filter((x) => ALL.includes(x));
  const orderedSections = [...activeSections, ...ALL.filter((x) => !activeSections.includes(x))];
  const toggleSection = (id: string) =>
    set("sections", (activeSections.includes(id) ? activeSections.filter((x) => x !== id) : [...activeSections, id]).join(","));
  const moveSection = (id: string, d: number) => {
    const list = [...orderedSections];
    const i = list.indexOf(id), j = i + d;
    [list[i], list[j]] = [list[j], list[i]];
    set("sections", list.filter((x) => activeSections.includes(x)).join(","));
  };

  // Баннер: своя картинка грузится сразу, в форму уходит только путь к ней
  const [bannerLocal, setBannerLocal] = useState<string | null>(null);
  const [bannerBusy, setBannerBusy] = useState(false);
  const [bannerError, setBannerError] = useState("");
  const bannerPreview = bannerLocal ?? (f.bannerPath ? publicMedia(f.bannerPath) : null);
  async function onBanner(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return setBannerError("Нужна картинка: JPG, PNG или WEBP");
    setBannerError(""); setBannerBusy(true);
    setBannerLocal(URL.createObjectURL(file));
    try { set("bannerPath", await uploadPublicImage(userId, file)); }
    catch { setBannerError("Не получилось загрузить. Попробуй другую картинку."); setBannerLocal(null); }
    setBannerBusy(false);
  }

  const earnings = num(f.earnings), goal = num(f.earningsGoal);
  const pct = goal ? Math.min(100, Math.round((earnings / goal) * 100)) : 0;

  return (
    <form onSubmit={onSubmit} className="settings">
      <div className="settings-preview">
        <div className="label">Так тебя видят другие</div>
        <ProfileHeader
          displayName={f.displayName} username={normalizeUsername(f.username)} bio={f.bio}
          headline={f.headline} status={f.status} openToWork={f.openToWork}
          accent={f.accent} avatar={f.avatar} role={role}
          banner={bannerPreview} bannerPreset={f.bannerPreset}
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
          <span>Баннер</span>
          <div className="banner-picks" style={{ "--c": ACCENTS[f.accent as keyof typeof ACCENTS]?.color } as React.CSSProperties}>
            {BANNERS.map((b) => (
              <label key={b.id} className={`banner-pick ${!f.bannerPath && f.bannerPreset === b.id ? "on" : ""}`}>
                <input type="radio" name="bannerPresetPick" checked={!f.bannerPath && f.bannerPreset === b.id}
                  onChange={() => { set("bannerPreset", b.id); set("bannerPath", ""); setBannerLocal(null); }} />
                <Banner preset={b.id} className="mini" />
                <b>{b.title}</b>
              </label>
            ))}
            <label className={`banner-pick upload ${f.bannerPath || bannerLocal ? "on" : ""}`}>
              <input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(ev) => { onBanner(ev.target.files?.[0]); ev.target.value = ""; }} />
              {bannerPreview ? <Banner image={bannerPreview} className="mini" /> : <span className="banner-upload-art">+</span>}
              <b>{bannerBusy ? "Загружаю…" : bannerPreview ? "Своё фото · заменить" : "Своё фото"}</b>
            </label>
          </div>
          <input type="hidden" name="bannerPreset" value={f.bannerPreset} />
          <input type="hidden" name="bannerPath" value={f.bannerPath} />
          <span className="hint bad">{bannerError}</span>
          <span className="hint">Готовые баннеры медленно переливаются. Для своего фото лучше горизонтальное, примерно 1600×500.</span>
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

        <div className="row2">
          <label className="field">
            <span>Кто ты одной строкой <span className="count">{f.headline.length}/60</span></span>
            <div className="input"><input id="headline" name="headline" value={f.headline} maxLength={60} placeholder="Монтажёр · Продюсер" onChange={(ev) => set("headline", ev.target.value)} /></div>
          </label>
          <label className="field">
            <span>Город</span>
            <div className="input"><input id="city" name="city" value={f.city} maxLength={40} placeholder="Москва" onChange={(ev) => set("city", ev.target.value)} /></div>
          </label>
        </div>

        <label className="field">
          <span>Статус <span className="count">чем занят сейчас · {f.status.length}/80</span></span>
          <div className="input"><input id="status" name="status" value={f.status} maxLength={80} placeholder="Собираю первый дроп, ищу фотографа" onChange={(ev) => set("status", ev.target.value)} /></div>
        </label>

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

        <label className="field" id="about">
          <span>О себе подробно <span className="count">{f.about.length}/1500</span></span>
          <div className={`input ${e.about ? "err" : ""}`}>
            <textarea id="aboutText" name="about" rows={6} maxLength={1500} value={f.about}
              placeholder={"Чем занимаешься, с кем работал, какие результаты.\n\nЧто ищешь сейчас: клиентов, команду, проекты.\n\nПустая строка начинает новый абзац."}
              onChange={(ev) => set("about", ev.target.value)} />
          </div>
          <span className="hint bad">{e.about}</span>
        </label>

        <label className="field">
          <span>Навыки <span className="count">через запятую</span></span>
          <div className="input"><input id="skills" name="skills" value={f.skills} maxLength={300} placeholder="Premiere Pro, After Effects, сторителлинг" onChange={(ev) => set("skills", ev.target.value)} /></div>
        </label>

        <label className="toggle light">
          <input id="openToWork" type="checkbox" name="openToWork" checked={f.openToWork} onChange={(ev) => set("openToWork", ev.target.checked)} />
          <span className="knob" />
          <span>{f.openToWork ? "Открыт к работе и сотрудничеству: тебя видно в фильтре People" : "Не ищу работу сейчас"}</span>
        </label>

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

      {/* Разделы профиля */}
      <section className="card">
        <h2 className="h-md caps">Разделы <span className="it">профиля</span></h2>
        <p className="lead small">Включи нужные разделы и расставь их по порядку. Первый открывается сразу.</p>
        <ul className="section-order">
          {orderedSections.map((id, i) => {
            const on = activeSections.includes(id);
            return (
              <li key={id} className={on ? "on" : ""}>
                <label className="mini-toggle">
                  <input type="checkbox" checked={on} onChange={() => toggleSection(id)} />
                  <b>{SECTION_TITLES[id].label}</b>
                  <span>{SECTION_TITLES[id].sub}</span>
                </label>
                <span className="order-btns">
                  <button type="button" className="icon-btn sm" disabled={i === 0} onClick={() => moveSection(id, -1)} aria-label="Выше">↑</button>
                  <button type="button" className="icon-btn sm" disabled={i === orderedSections.length - 1} onClick={() => moveSection(id, 1)} aria-label="Ниже">↓</button>
                </span>
              </li>
            );
          })}
        </ul>
        <input type="hidden" name="sections" value={activeSections.join(",")} />

        <label className="field">
          <span>Закреплённый проект</span>
          <div className="input">
            <select id="pinnedProject" name="pinnedProject" value={f.pinnedProject} onChange={(ev) => set("pinnedProject", ev.target.value)}>
              <option value="">Не закреплять</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          {!projects.length && <span className="hint">Сначала добавь проект во вкладке «Проекты» своего профиля.</span>}
        </label>
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
