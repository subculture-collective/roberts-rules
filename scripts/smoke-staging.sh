#!/usr/bin/env bash
set -euo pipefail

base_url="${1:?usage: smoke-staging.sh BASE_URL}"
base_url="${base_url%/}"

health="$(curl --fail --silent --show-error --max-time 10 "${base_url}/health")"
ready="$(curl --fail --silent --show-error --max-time 10 "${base_url}/ready")"
headers="$(curl --fail --silent --show-error --max-time 10 --head "${base_url}/")"

[[ "$health" == '{"status":"ok"}' ]] || { printf 'unexpected health response\n' >&2; exit 1; }
[[ "$ready" == '{"status":"ready"}' ]] || { printf 'unexpected readiness response\n' >&2; exit 1; }
grep -qi '^content-security-policy:' <<<"$headers" || { printf 'missing content security policy\n' >&2; exit 1; }
grep -qi '^x-content-type-options: nosniff' <<<"$headers" || { printf 'missing nosniff header\n' >&2; exit 1; }

printf 'staging smoke passed for %s\n' "$base_url"
