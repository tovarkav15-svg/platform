// Правка ошибки Next.js 15.5 для статического сайта (output: "export").
// Когда сайт обновился, а у человека открыта старая вкладка, Next при переходе делает полную перезагрузку,
// но передаёт адрес служебного файла (…/workspace/index.txt?_rsc=…) вместо адреса страницы — и браузер
// показывает сырые данные. Соседняя ветка того же кода уже чистит адрес через responseUrl — делаем так же.
// Запускается из scripts/deploy.sh перед сборкой; повторный запуск ничего не ломает.
import { readFileSync, writeFileSync } from "node:fs";

const files = [
  "node_modules/next/dist/client/components/router-reducer/fetch-server-response.js",
  "node_modules/next/dist/esm/client/components/router-reducer/fetch-server-response.js",
];
const BUG = "return doMpaNavigation(res.url);";
const FIX = "return doMpaNavigation(responseUrl.toString()); /* relic: patch-next */";

for (const f of files) {
  const src = readFileSync(f, "utf8");
  if (src.includes(FIX)) { console.log(`patch-next: уже исправлено — ${f}`); continue; }
  if (!src.includes(BUG)) throw new Error(`patch-next: не нашёл место для правки в ${f} — проверь версию Next.js`);
  writeFileSync(f, src.replace(BUG, FIX));
  console.log(`patch-next: исправлено — ${f}`);
}
