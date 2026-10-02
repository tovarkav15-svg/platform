// Без хуков: импортируется в серверный layout
const KEY = "prefs:v1";

/** Скрипт для <head>: применяет тему до первой отрисовки, чтобы не мигало */
export const PREFS_BOOT = `(function(){try{var p=JSON.parse(localStorage.getItem("${KEY}")||"{}");var t=p.theme||"light";var j=/\\/jobs(\\/|$)/.test(location.pathname)&&localStorage.getItem("jobs:theme")!=="light";var d=j||t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);var e=document.documentElement;e.dataset.theme=d?"dark":t==="warm"?"warm":"light";e.dataset.text=p.text||"md";e.dataset.motion=p.motion||"full";e.dataset.contrast=p.contrast?"hi":"";e.dataset.dots=p.dots===false?"off":"";e.dataset.chatbg=p.chatBg||"plain";e.dataset.chattext=p.chatText||"md";}catch(e){}})();`;
