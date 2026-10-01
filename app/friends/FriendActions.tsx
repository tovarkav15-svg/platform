import type { FriendState } from "@/lib/social";
import { acceptRequest, openChat, removeFriend, sendRequest } from "./actions";
import { SubmitButton } from "../SubmitButton";

// Кнопки дружбы: одинаковые в профиле и в списках
export function FriendActions({ userId, state, compact }: { userId: string; state: FriendState; compact?: boolean }) {
  if (state === "self") return null;
  const cls = compact ? "sm" : "";
  const hidden = <input type="hidden" name="userId" value={userId} />;

  return (
    <div className="friend-actions">
      {state === "none" && (
        <form action={sendRequest}>{hidden}<SubmitButton className={`btn ${cls}`} pending="Отправляю…">Добавить в друзья</SubmitButton></form>
      )}
      {state === "outgoing" && (
        <form action={removeFriend}>{hidden}<SubmitButton className={`btn ghost ${cls}`} pending="Отменяю…">Заявка отправлена · отменить</SubmitButton></form>
      )}
      {state === "incoming" && (
        <>
          <form action={acceptRequest}>{hidden}<SubmitButton className={`btn ${cls}`} pending="Принимаю…">Принять</SubmitButton></form>
          <form action={removeFriend}>{hidden}<SubmitButton className={`btn ghost ${cls}`} pending="…">Отклонить</SubmitButton></form>
        </>
      )}
      {state === "friends" && !compact && (
        <form action={removeFriend}>{hidden}<SubmitButton className={`btn ghost ${cls}`} pending="Удаляю…">Удалить из друзей</SubmitButton></form>
      )}
      <form action={openChat}>{hidden}<SubmitButton className={`btn ${state === "friends" ? "" : "ghost"} ${cls}`} pending="Открываю…">Написать</SubmitButton></form>
    </div>
  );
}
