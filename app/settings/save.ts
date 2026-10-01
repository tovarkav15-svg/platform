import { supabase } from "@/lib/supabase";
import { isUsernameTaken } from "@/lib/api";
import { NICHES } from "@/lib/niches";
import { isAccent } from "@/lib/style";
import { isBanner } from "@/lib/banners";
import { normalizeUsername, validateUsername } from "@/lib/username";

export type SettingsState = { ok?: boolean; message?: string; errors?: Record<string, string> };

const MAX_AVATAR = 300_000;
const toInt = (v: FormDataEntryValue | null) => {
  const n = parseInt(String(v ?? "").replace(/\D/g, ""), 10);
  return Number.isFinite(n) ? Math.min(n, 1_000_000_000) : 0;
};

// Проверки дублируются в базе (constraints в supabase/schema.sql), здесь — для понятных подсказок
export async function saveProfile(userId: string, currentUsername: string, form: FormData): Promise<SettingsState> {
  const displayName = String(form.get("displayName") ?? "").trim();
  const username = normalizeUsername(String(form.get("username") ?? ""));
  const bio = String(form.get("bio") ?? "").trim();
  const accent = String(form.get("accent") ?? "");
  const bannerPreset = String(form.get("bannerPreset") ?? "aurora");
  const bannerPath = String(form.get("bannerPath") ?? "") || null;
  const about = String(form.get("about") ?? "").replace(/\r/g, "").trim();
  const ring = String(form.get("ring") ?? "spin");
  const nameStyle = String(form.get("nameStyle") ?? "plain");
  const emoji = String(form.get("emoji") ?? "").slice(0, 8);
  const pageBg = String(form.get("pageBg") ?? "aurora");
  const avatar = String(form.get("avatar") ?? "");
  const telegram = String(form.get("telegram") ?? "").trim().replace(/^(https?:\/\/)?t\.me\//, "").replace(/^@/, "");
  const website = String(form.get("website") ?? "").trim();
  const nicheIds = NICHES.map((n) => n.id) as string[];
  const niches = form.getAll("niches").map(String).filter((id) => nicheIds.includes(id));
  const headline = String(form.get("headline") ?? "").trim().slice(0, 60);
  const status = String(form.get("status") ?? "").trim().slice(0, 80);
  const city = String(form.get("city") ?? "").trim().slice(0, 40);
  const skills = String(form.get("skills") ?? "").split(",").map((x) => x.trim()).filter(Boolean).slice(0, 15).join(", ").slice(0, 300);
  const sections = String(form.get("sections") ?? "").split(",").filter((x) => ["work", "projects", "goals"].includes(x)).join(",");
  const pinnedProject = String(form.get("pinnedProject") ?? "") || null;

  const errors: Record<string, string> = {};
  if (displayName.length < 2 || displayName.length > 40) errors.displayName = "От 2 до 40 символов";
  if (bio.length > 160) errors.bio = "Максимум 160 символов";
  const uErr = validateUsername(username);
  if (uErr) errors.username = uErr;
  else if (username !== currentUsername && (await isUsernameTaken(username))) errors.username = "Этот юзернейм уже занят";
  if (!isAccent(accent)) errors.accent = "Выбери цвет";
  if (!isBanner(bannerPreset)) errors.banner = "Выбери баннер";
  if (bannerPath && !bannerPath.startsWith(userId + "/")) errors.banner = "Баннер не подошёл";
  if (about.length > 1500) errors.about = "Максимум 1500 символов";
  if (avatar && (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(avatar) || avatar.length > MAX_AVATAR))
    errors.avatar = "Картинка не подошла, попробуй другую";
  if (telegram && !/^[a-zA-Z0-9_]{4,32}$/.test(telegram)) errors.telegram = "Ник в Telegram: латиница, цифры и _";
  if (website && !/^https?:\/\/[^\s]+\.[^\s]+$/.test(website)) errors.website = "Ссылка должна начинаться с https://";
  if (Object.keys(errors).length) return { errors, message: "Проверь поля, отмеченные красным" };

  const [p, e] = await Promise.all([
    supabase.from("profiles").update({
      username, display_name: displayName, bio, accent, telegram, website,
      banner_preset: bannerPreset, banner_path: bannerPath, about,
      avatar_ring: ["spin", "neon", "solid", "none"].includes(ring) ? ring : "spin",
      name_style: ["plain", "gradient", "outline"].includes(nameStyle) ? nameStyle : "plain",
      emoji, page_bg: ["aurora", "plain", "dots"].includes(pageBg) ? pageBg : "aurora",
      niches: niches.join(","), avatar: avatar || null,
      headline, status, city, skills, sections, pinned_project: pinnedProject,
      open_to_work: form.get("openToWork") === "on",
    }).eq("id", userId),
    supabase.from("earnings").update({
      amount: toInt(form.get("earnings")),
      goal: toInt(form.get("earningsGoal")),
      is_public: form.get("showEarnings") === "on",
    }).eq("user_id", userId),
  ]);

  if (p.error?.code === "23505") return { errors: { username: "Этот юзернейм уже занят" }, message: "Проверь поля, отмеченные красным" };
  if (p.error || e.error) return { message: "Не получилось сохранить. Попробуй ещё раз." };
  return { ok: true, message: "Сохранено" };
}

export async function changePassword(current: string, next: string, authEmail: string): Promise<SettingsState> {
  const check = await supabase.auth.signInWithPassword({ email: authEmail, password: current });
  if (check.error) return { errors: { current: "Неверный текущий пароль" } };
  if (next.length < 8) return { errors: { next: "Минимум 8 символов" } };
  if (!/\d/.test(next) || !/[a-zA-Zа-яА-Я]/.test(next)) return { errors: { next: "Нужны буквы и хотя бы одна цифра" } };
  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) return { message: "Не получилось сменить пароль" };
  return { ok: true, message: "Пароль изменён" };
}
