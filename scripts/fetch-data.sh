#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

if [[ -z "${SOURCE_URL:-}" ]]; then
  echo "SOURCE_URL is required." >&2
  exit 1
fi

if [[ -z "${FILE_NAME:-}" ]]; then
  echo "FILE_NAME is required." >&2
  exit 1
fi

IFS=',' read -r -a SOURCE_URL_LIST <<< "${SOURCE_URL}"
IFS=',' read -r -a FILE_NAME_LIST <<< "${FILE_NAME}"

if [[ ${#SOURCE_URL_LIST[@]} -ne ${#FILE_NAME_LIST[@]} ]]; then
  echo "SOURCE_URL and FILE_NAME must contain the same number of entries." >&2
  exit 1
fi

for idx in "${!SOURCE_URL_LIST[@]}"; do
  url="${SOURCE_URL_LIST[$idx]}"
  file="${FILE_NAME_LIST[$idx]}"

  url="${url#"${url%%[![:space:]]*}"}"
  url="${url%"${url##*[![:space:]]}"}"
  file="${file#"${file%%[![:space:]]*}"}"
  file="${file%"${file##*[![:space:]]}"}"

  if [[ -z "$url" || -z "$file" ]]; then
    echo "Empty SOURCE_URL or FILE_NAME entry detected." >&2
    exit 1
  fi

  dir_path="$(dirname "$file")"
  if [[ "$dir_path" != "." ]]; then
    mkdir -p "$dir_path"
  fi

  echo "Downloading ${url} -> ${file}"
  wget "$url" -O "$file"
done
