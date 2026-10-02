"use client";

import { useSearchParams } from "next/navigation";
import { useEffect } from "react";

// ?focus=… в ссылке: прокрутить к нужному полю, подсветить и поставить курсор (переходы из заданий AURA)
const TARGETS: Record<string, string> = {
  avatar: 'label[for="avatarFile"]',
  banner: ".banner-picks",
  bio: "#bio",
  niches: "#niches",
  about: "#about textarea",
  looking: "#looking textarea",
  "new-task": ".quick-add input",
  "new-goal": ".gs-new-title",
  "new-milestone": 'input[aria-label="Новый этап"]',
  search: ".pp-input input",
};

export function JumpLayer() {
  const focus = useSearchParams().get("focus");
  useEffect(() => {
    const sel = focus && TARGETS[focus];
    if (!sel) return;
    let tries = 0;
    const t = setInterval(() => {
      const el = document.querySelector<HTMLElement>(sel);
      if (!el && ++tries < 40) return;
      clearInterval(t);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      const box = el.closest(".field, fieldset, form, .banner-picks") as HTMLElement | null ?? el;
      box.classList.add("jump-hl");
      setTimeout(() => box.classList.remove("jump-hl"), 2600);
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) setTimeout(() => el.focus({ preventScroll: true }), 450);
    }, 150);
    return () => clearInterval(t);
  }, [focus]);
  return null;
}
