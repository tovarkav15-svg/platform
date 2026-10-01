import type { Metadata } from "next";

export const metadata: Metadata = { title: "Мессенджер" };

export default function MessagesIndex() {
  return (
    <div className="chat-placeholder">
      <h2 className="h-xl caps">Выбери <span className="it">чат</span></h2>
      <p className="lead">Или найди друга и напиши первым.</p>
    </div>
  );
}
