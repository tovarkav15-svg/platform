import { supabase } from "./supabase";

const ext = (file: File) => {
  const fromName = file.name.split(".").pop()?.toLowerCase();
  if (fromName && fromName.length <= 5 && fromName !== file.name.toLowerCase()) return fromName;
  return file.type.split("/")[1]?.split(";")[0] || "bin";
};

/** Уменьшает фото в браузере, чтобы не грузить мегабайты с телефона */
export function compressImage(file: File, max = 1600, quality = 0.85): Promise<Blob> {
  if (file.type === "image/gif") return Promise.resolve(file);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * k);
      canvas.height = Math.round(img.height * k);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(img.src);
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("compress"))), "image/jpeg", quality);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

/** Картинка для работы или проекта: public-media/<user_id>/… */
export async function uploadPublicImage(userId: string, file: File) {
  const blob = await compressImage(file);
  const path = `${userId}/${crypto.randomUUID()}.${blob.type === "image/gif" ? "gif" : "jpg"}`;
  const { error } = await supabase.storage.from("public-media").upload(path, blob, { contentType: blob.type, upsert: false });
  if (error) throw error;
  return path;
}

export const CHAT_MAX_BYTES = 50 * 1024 * 1024;

/** Файл в чат: chat-media/<chat_id>/… — видят только участники чата */
export async function uploadChatFile(chatId: string, file: Blob, name: string, onProgress?: (p: number) => void) {
  const extension = ext(new File([], name, { type: file.type }));
  const path = `${chatId}/${crypto.randomUUID()}.${extension}`;
  onProgress?.(0.1);
  const { error } = await supabase.storage.from("chat-media").upload(path, file, { contentType: file.type || "application/octet-stream" });
  if (error) throw error;
  onProgress?.(1);
  return path;
}

const signedCache = new Map<string, { url: string; until: number }>();

/** Временная ссылка на файл из чата (живёт час) */
export async function chatFileUrl(path: string) {
  const hit = signedCache.get(path);
  if (hit && hit.until > Date.now()) return hit.url;
  const { data } = await supabase.storage.from("chat-media").createSignedUrl(path, 3600);
  if (!data) return null;
  signedCache.set(path, { url: data.signedUrl, until: Date.now() + 55 * 60 * 1000 });
  return data.signedUrl;
}

export function kindOf(file: File): "image" | "video" | "voice" | "file" {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "voice";
  return "file";
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} Б`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} КБ`;
  return `${(n / 1024 / 1024).toFixed(1)} МБ`;
}
