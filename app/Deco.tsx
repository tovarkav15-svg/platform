import { titleName } from "@/lib/shop";

// Слои декора из AURA Shop. Сами по себе ничего не меняют, пока предмет не надет

export function RingFx({ id }: { id?: string | null }) {
  if (!id) return null;
  return (
    <span className={`fx-ring ${id}`} aria-hidden="true">
      <i /><i /><i /><i /><i /><i />
      {id === "r-crown" && <b>♛</b>}
    </span>
  );
}

export function BannerFx({ id }: { id?: string | null }) {
  if (!id) return null;
  return (
    <span className={`fx-banner ${id}`} aria-hidden="true">
      {Array.from({ length: 10 }, (_, i) => <i key={i} style={{ "--k": i } as React.CSSProperties} />)}
    </span>
  );
}

export function TitleChip({ id, small }: { id?: string | null; small?: boolean }) {
  const name = titleName(id);
  if (!id || !name) return null;
  return <span className={`fx-title ${id} ${small ? "sm" : ""}`}>{name}</span>;
}

/** Аватар любого размера с надетой аурой вокруг */
export function WithRing({ id, children }: { id?: string | null; children: React.ReactNode }) {
  if (!id) return <>{children}</>;
  return <span className="fx-host"><RingFx id={id} />{children}</span>;
}
