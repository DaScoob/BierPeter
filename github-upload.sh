#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
command -v git >/dev/null
command -v gh >/dev/null
gh auth status
git var GIT_AUTHOR_IDENT >/dev/null
git var GIT_COMMITTER_IDENT >/dev/null
if [[ -d .git ]]; then
  printf '%s\n' 'Abbruch: Hier existiert bereits eine Git-Arbeitskopie. Keine automatische Änderung.' >&2
  exit 1
fi
git init -b main
git add .
git commit -m "BierPeter Alpha: Sessions und Race-Vorbereitung"
gh repo create BierPeter --public --description 'BierPeter: autonome Spielgeräte und selbst hostbare Web-App (Alpha)' --source . --remote origin --push
