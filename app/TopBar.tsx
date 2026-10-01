import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { logout } from "./actions";

export async function TopBar() {
  const me = await getCurrentUser();
  return (
    <header className="topbar">
      <Link href="/" className="logo caps">Название</Link>
      {me ? (
        <nav style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Link className="btn ghost" href={`/u/${me.username}`}>@{me.username}</Link>
          <Link className="btn ghost" href="/settings">Настройки</Link>
          <form action={logout}><button className="btn ghost" type="submit">Выйти</button></form>
        </nav>
      ) : (
        <nav style={{ display: "flex", gap: 8 }}>
          <Link className="btn ghost" href="/login">Войти</Link>
          <Link className="btn" href="/register">Регистрация</Link>
        </nav>
      )}
    </header>
  );
}
