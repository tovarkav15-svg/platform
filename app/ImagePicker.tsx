"use client";

import { useRef } from "react";

// Выбор обложки для работы или проекта: показывает превью, загрузка происходит при сохранении
export function ImagePicker({ preview, onPick, onClear }: { preview: string | null; onPick: (f: File) => void; onClear: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="image-picker">
      {preview ? (
        <div className="image-preview">
          <img src={preview} alt="" />
          <div className="image-preview-actions">
            <button type="button" className="btn light sm" onClick={() => input.current?.click()}>Заменить</button>
            <button type="button" className="btn light sm" onClick={onClear}>Убрать</button>
          </div>
        </div>
      ) : (
        <button type="button" className="image-drop" onClick={() => input.current?.click()}>
          <b>Добавить обложку</b>
          <span>JPG, PNG или WEBP до 10 МБ</span>
        </button>
      )}
      <input
        ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); e.target.value = ""; }}
      />
    </div>
  );
}
