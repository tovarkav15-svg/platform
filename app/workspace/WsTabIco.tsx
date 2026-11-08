/** Значки разделов Workspace — тонкие линии, как в меню сайта */
const P: Record<string, React.ReactNode> = {
  overview: <><rect x="4" y="4" width="7" height="7" rx="2" /><rect x="13" y="4" width="7" height="7" rx="2" /><rect x="4" y="13" width="7" height="7" rx="2" /><rect x="13" y="13" width="7" height="7" rx="2" /></>,
  day: <><circle cx="12" cy="12" r="8" /><path d="M12 7.5V12l3 2" /></>,
  clients: <><circle cx="9" cy="9" r="3" /><circle cx="16.5" cy="10" r="2.5" /><path d="M3.5 18.5c.9-2.8 3-4.3 5.5-4.3s4.6 1.5 5.5 4.3M14.5 15c2.6-.6 4.9.6 6 3.5" /></>,
  projects: <><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H10l2 2h5.5A2.5 2.5 0 0 1 20 9.5v7a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z" /></>,
  plans: <><rect x="4" y="4" width="16" height="16" rx="4" /><path d="m8.5 12.2 2.4 2.4 4.6-5" /></>,
  finance: <><rect x="3.5" y="6" width="17" height="12.5" rx="3" /><path d="M3.5 10.5h17M7.5 15h3" /></>,
  notes: <><path d="M6.5 4h8l3.5 3.5v10A2.5 2.5 0 0 1 15.5 20h-9A2.5 2.5 0 0 1 4 17.5v-11A2.5 2.5 0 0 1 6.5 4z" /><path d="M8 11h8M8 14.5h5" /></>,
};
export function WsTabIco({ id }: { id: string }) {
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{P[id]}</svg>;
}
