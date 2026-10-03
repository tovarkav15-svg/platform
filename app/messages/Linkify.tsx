import Link from "next/link";
import { profileHref } from "@/lib/links";

// Ссылки и упоминания в тексте сообщения становятся кликабельными. Текст не превращается в HTML — только в React-элементы
const RE = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+|\b(?:[a-z0-9-]+\.)+(?:ru|com|net|org|io|me|app|dev|online|site|store|pro|info|рф|su|ai|gg|tv|co|xyz|tech|shop)\b(?:\/[^\s<>"']*)?|@[a-z0-9][a-z0-9._]{2,19})/gi;
const TRAIL = /[.,!?;:)»"'\]]+$/;

export function Linkify({ text }: { text: string }) {
  const out: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(RE)) {
    let token = m[0];
    const start = m.index ?? 0;
    // знаки препинания в конце — не часть ссылки
    const tail = token.match(TRAIL)?.[0] ?? "";
    if (tail) token = token.slice(0, -tail.length);
    // e-mail вида name@mail.ru не трогаем
    if (token.startsWith("@") && start > 0 && /[a-z0-9._-]/i.test(text[start - 1])) continue;
    if (start > last) out.push(text.slice(last, start));
    if (token.startsWith("@")) {
      out.push(<Link key={start} className="msg-mention" href={profileHref(token.slice(1).toLowerCase())}>{token}</Link>);
    } else {
      const href = /^https?:\/\//i.test(token) ? token : `https://${token}`;
      out.push(<a key={start} className="msg-link" href={href} target="_blank" rel="noopener noreferrer nofollow">{token}</a>);
    }
    if (tail) out.push(tail);
    last = start + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}
