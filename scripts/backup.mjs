// Резервная копия базы Supabase без Docker и pg_dump: каждая таблица выгружается в JSON
// через `supabase db query --linked`. Схема базы — это миграции, их тоже кладём в копию.
// Запуск: node scripts/backup.mjs   → ~/platforma-backups/relic-ГГГГ-ММ-ДД_ЧЧ-ММ.zip
// Копия содержит личные данные (почты, переписки, хэши паролей) — храни её только у себя.
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const now = new Date();
const pad = (n) => String(n).padStart(2, "0");
const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}`; // местное время
const root = join(homedir(), "platforma-backups");
const dir = join(root, `relic-${stamp}`);
mkdirSync(join(dir, "data"), { recursive: true });

function query(sql) {
  for (let i = 1; i <= 5; i++) {
    try {
      const out = execFileSync("supabase", ["db", "query", "--linked", sql], { encoding: "utf8", maxBuffer: 1 << 30, stdio: ["ignore", "pipe", "pipe"] });
      return JSON.parse(out.slice(out.indexOf("{"))).rows;
    } catch (e) {
      if (i === 5) throw e;
      execFileSync("sleep", [String(i * 2)]);
    }
  }
}

// Все свои таблицы + аккаунты (auth) + описание файлов в хранилище (сами файлы не входят)
const tables = query(`
  select table_schema s, table_name t from information_schema.tables
  where table_type = 'BASE TABLE' and (
    table_schema = 'public'
    or (table_schema = 'auth' and table_name in ('users', 'identities'))
    or (table_schema = 'storage' and table_name in ('buckets', 'objects')))
  order by 1, 2`);

const manifest = { created_at: new Date().toISOString(), tables: {} };
for (const { s, t } of tables) {
  const name = `${s}.${t}`;
  const [{ d }] = query(`select coalesce(json_agg(x), '[]'::json) d from "${s}"."${t}" x`);
  writeFileSync(join(dir, "data", `${name}.json`), JSON.stringify(d));
  manifest.tables[name] = d.length;
  process.stdout.write(`${name}: ${d.length}\n`);
}
writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
cpSync("supabase/migrations", join(dir, "migrations"), { recursive: true });

execFileSync("ditto", ["-c", "-k", "--keepParent", dir, `${dir}.zip`]);
rmSync(dir, { recursive: true });
console.log(`\nГотово: ${dir}.zip — таблиц ${tables.length}, строк ${Object.values(manifest.tables).reduce((a, b) => a + b, 0)}`);
