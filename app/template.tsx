// Перемонтируется при переходе между разделами — даёт плавное появление каждой страницы
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
