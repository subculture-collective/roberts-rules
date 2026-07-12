#!/usr/bin/env bash

die() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

require_env() {
  local name=$1
  [[ -n ${!name:-} ]] || die "$name is required"
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "$1 is required"
}

sha256_write() {
  local file=$1 manifest=$2 recorded_filename=$3 digest
  if command -v sha256sum >/dev/null 2>&1; then
    digest=$(sha256sum "$file" | awk '{print $1}')
  elif command -v shasum >/dev/null 2>&1; then
    digest=$(shasum -a 256 "$file" | awk '{print $1}')
  else
    die 'sha256sum or shasum is required'
  fi
  printf '%s  %s\n' "$digest" "$recorded_filename" >"$manifest"
}

sha256_verify() {
  local manifest=$1 directory filename
  directory=$(dirname "$manifest")
  filename=$(basename "$manifest")
  if command -v sha256sum >/dev/null 2>&1; then
    (cd "$directory" && sha256sum -c "$filename") >/dev/null
  elif command -v shasum >/dev/null 2>&1; then
    (cd "$directory" && shasum -a 256 --check "$filename") >/dev/null
  else
    die 'sha256sum or shasum is required'
  fi
}
