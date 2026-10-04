import { titleName } from "@/lib/shop";
import { BannerArt } from "./BannerArt";

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
      {Array.from({ length: 14 }, (_, i) => <i key={i} style={{ "--k": i } as React.CSSProperties} />)}
      <BannerArt id={id} />
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

/** Живой фон всей страницы профиля */
export function PageFx({ id }: { id?: string | null }) {
  if (!id) return null;
  return (
    <div className={`fx-page ${id}`} aria-hidden="true">
      {Array.from({ length: 14 }, (_, i) => <i key={i} />)}
    </div>
  );
}
