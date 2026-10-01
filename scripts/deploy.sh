#!/usr/bin/env bash
# Собирает сайт и выкладывает его в ветку gh-pages → https://tovarkav15-svg.github.io/platform/
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$PWD/.node/bin:$PATH"

rm -rf out
npx next build
touch out/.nojekyll

tmp=$(mktemp -d)
git worktree add -f --detach "$tmp" >/dev/null
(
  cd "$tmp"
  git checkout -q --orphan gh-pages-new
  git rm -rqf . >/dev/null 2>&1 || true
  cp -R "$OLDPWD/out/." .
  git add -A
  git commit -qm "Выкладка сайта $(date '+%Y-%m-%d %H:%M')"
  for i in 1 2 3 4 5 6; do GIT_HTTP_LOW_SPEED_LIMIT=1000 GIT_HTTP_LOW_SPEED_TIME=20 git push -qf origin HEAD:gh-pages && break; sleep 5; done
)
git worktree remove -f "$tmp"
git branch -D gh-pages-new >/dev/null 2>&1 || true
echo "Готово: https://tovarkav15-svg.github.io/platform/"
