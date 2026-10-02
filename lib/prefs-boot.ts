// Без хуков: импортируется в серверный layout
const KEY = "prefs:v1";

/** Скрипт для <head>: применяет тему до первой отрисовки, чтобы не мигало */
export const PREFS_BOOT = `(function(){try{var p=JSON.parse(localStorage.getItem("${KEY}")||"{}");var t=p.theme||"light";var d=t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);var e=document.documentElement;e.dataset.theme=d?"dark":t==="warm"?"warm":"light";e.dataset.text=p.text||"md";e.dataset.motion=p.motion||"full";}catch(e){}})();`;
