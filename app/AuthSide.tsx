import Link from "next/link";
import { NICHES } from "@/lib/niches";

export function AuthSide({ title, text }: { title: React.ReactNode; text: string }) {
  return (
    <aside className="auth-side">
      <Link href="/" className="logo caps">Название</Link>
      <div style={{ display: "flex", flexDirection: "column", gap: 16, position: "relative", zIndex: 1 }}>
        <h2 className="h-xl caps">{title}</h2>
        <p>{text}</p>
      </div>
      <div className="side-dots">
        {NICHES.map((n) => (
          <span key={n.id} style={{ "--c": n.id === "scaling" ? "#fff" : n.color } as React.CSSProperties}>{n.title}</span>
        ))}
      </div>
    </aside>
  );
}
