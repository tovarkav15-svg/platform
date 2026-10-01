import { accentColor } from "@/lib/style";

type Props = { name: string; avatar?: string | null; accent?: string; size?: number };

export function Avatar({ name, avatar, accent = "edit", size = 40 }: Props) {
  return (
    <span
      className="ava"
      style={{ width: size, height: size, fontSize: size * 0.4, "--c": accentColor(accent) } as React.CSSProperties}
    >
      {avatar ? <img src={avatar} alt="" /> : (name || "?").slice(0, 1).toUpperCase()}
    </span>
  );
}
