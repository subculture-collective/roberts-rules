#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
generated="$root/packages/meeting-publication/src/generated"
temporary=$(mktemp -d)
trap 'rm -rf "$temporary"' EXIT

cd "$root"
pnpm exec lex install --ci --manifest lexicons.json --lexicons lexicons
pnpm exec lex build --lexicons lexicons --out "$temporary" --clear --index-file --no-pretty
diff -ru "$generated" "$temporary"
