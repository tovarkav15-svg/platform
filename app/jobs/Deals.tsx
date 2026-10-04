"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { supabase, type Profile } from "@/lib/supabase";
import { DEAL_SELECT, DEAL_STATUS, dealHref, dealTodo, rub, type Deal } from "@/lib/deals";
import { useLive } from "@/lib/live";
import { Avatar } from "../Avatar";

/** Все мои сделки — и как заказчика, и как исполнителя */
export function MyDeals({ me }: { me: Profile }) {
  const [rows, setRows] = useState<Deal[] | null>(null);
  const load = useCallback(async () => {
    const { data } = await supabase.from("deals").select(DEAL_SELECT).or(`client_id.eq.${me.id},executor_id.eq.${me.id}`).order("updated_at", { ascending: false });
    setRows((data as unknown as Deal[]) ?? []);
  }, [me.id]);
  useEffect(() => { load(); }, [load]);
  useLive(["deals", "deal_steps"], load);

  if (rows === null) return <div className="skeleton list-skeleton" />;
  if (!rows.length) return (
    <div className="pf-empty">
      <p className="lead">Сделок пока нет. Сделка открывается, когда заказчик выбирает исполнителя: дальше вы вместе согласуете цену, срок и этапы, а после сдачи оставляете друг другу проверенные отзывы.</p>
      <Link className="btn" href="/jobs/?tab=orders">Смотреть заказы</Link>
    </div>
  );
  const live = rows.filter((d) => d.status !== "done" && d.status !== "cancelled");
  const past = rows.filter((d) => d.status === "done" || d.status === "cancelled");
  const Row = ({ d }: { d: Deal }) => {
    const client = d.client_id === me.id;
    const other = client ? d.executor : d.client;
    const todo = dealTodo(d, me.id);
    return (
      <li>
        <Link href={dealHref(d.id)} className={`dl-row st-${d.status} ${todo ? "todo" : ""}`}>
          {other && <Avatar name={other.display_name} avatar={other.avatar} accent={other.accent} size={38} userId={other.id} />}
          <span className="dl-row-main">
            <b>{d.order?.title ?? "Заказ"}</b>
            <small>{client ? "Исполнитель" : "Заказчик"}: {other?.display_name ?? "—"} · {d.price ? rub(d.price) : "цена не указана"}{d.deadline ? ` · до ${new Date(d.deadline).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}` : ""}</small>
          </span>
          {todo ? <span className="dl-todo">{todo}</span> : <span className={`dl-st st-${d.status}`}>{DEAL_STATUS[d.status]}</span>}
        </Link>
      </li>
    );
  };
  return (
    <section className="dl-list">
      {live.length > 0 && <><span className="label">Идут сейчас · {live.length}</span><ul>{live.map((d) => <Row key={d.id} d={d} />)}</ul></>}
      {past.length > 0 && <><span className="label">Завершённые · {past.length}</span><ul>{past.map((d) => <Row key={d.id} d={d} />)}</ul></>}
    </section>
  );
}
