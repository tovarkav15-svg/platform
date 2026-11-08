/** «iPhone · Safari», «Mac · Chrome» — коротко из строки браузера, как в списке устройств Telegram */
export function deviceName(ua: string | null | undefined): string {
  const s = ua ?? "";
  if (!s) return "Неизвестное устройство";
  const os = /iPhone/.test(s) ? "iPhone" : /iPad/.test(s) ? "iPad" : /Android/.test(s) ? "Android" : /Mac OS X|Macintosh/.test(s) ? "Mac"
    : /Windows/.test(s) ? "Windows" : /Linux/.test(s) ? "Linux" : "Устройство";
  const app = /Relic|Electron/.test(s) ? "приложение Relic" : /YaBrowser/.test(s) ? "Яндекс Браузер" : /Edg\//.test(s) ? "Edge" : /OPR\//.test(s) ? "Opera"
    : /Firefox|FxiOS/.test(s) ? "Firefox" : /CriOS|Chrome/.test(s) ? "Chrome" : /Safari/.test(s) ? "Safari" : "браузер";
  return `${os} · ${app}`;
}
