#!/usr/bin/env bash
set -euo pipefail
firmware_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
target="${1:-}"
port="${2:-}"
case "$target" in
  esp8266|esp32|esp32-s3) ;;
  *) printf '%s\n' 'Aufruf: bash firmware/FLASH.sh esp8266|esp32|esp32-s3 /dev/ttyUSB0' >&2; exit 2 ;;
esac
if [[ -z "$port" ]]; then
  printf '%s\n' 'Seriellen Anschluss ausdrücklich angeben; es wird kein Gerät automatisch überschrieben.' >&2
  exit 2
fi
python3 -m venv "$firmware_dir/.venv"
"$firmware_dir/.venv/bin/python" -m pip install 'platformio==6.2.0'
"$firmware_dir/.venv/bin/pio" run -d "$firmware_dir" -e "$target" -t upload --upload-port "$port"
printf '%s\n' 'Firmware übertragen. Der Dateisystembereich wurde nicht neu beschrieben.'
