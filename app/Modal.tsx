"use client";

import { useEffect, useRef } from "react";

// Окно поверх страницы на нативном <dialog>: Esc и клик по фону закрывают
export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: React.ReactNode; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="modal"
      onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}
    >
      {open && (
        <div className="modal-body">
          <header className="modal-head">
            <h2 className="h-md caps">{title}</h2>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть">×</button>
          </header>
          {children}
        </div>
      )}
    </dialog>
  );
}
