#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-5173}"
HOST="${HOST:-0.0.0.0}"
PID_FILE="${PID_FILE:-/tmp/diagram-generation-tool-vite-${PORT}.pid}"
LOG_FILE="${LOG_FILE:-/tmp/diagram-generation-tool-vite-${PORT}.log}"
URL="http://localhost:${PORT}/"
CSS_URL="${URL}src/index.css"

cd "$(dirname "$0")/.."

is_server_healthy() {
  curl -fsS "$URL" >/dev/null 2>&1 &&
    curl -fsS "$CSS_URL" 2>/dev/null | grep -q "tailwindcss v"
}

if is_server_healthy; then
  echo "already running: ${URL}"
  echo "log: ${LOG_FILE}"
  exit 0
fi

if curl -fsS "$URL" >/dev/null 2>&1; then
  echo "existing server on ${URL} is not healthy; restarting"
fi

if [[ -f "$PID_FILE" ]]; then
  old_pid="$(cat "$PID_FILE")"
  if [[ -n "$old_pid" ]] && kill -0 "$old_pid" 2>/dev/null; then
    kill "$old_pid" 2>/dev/null || true
    sleep 1
  fi
  rm -f "$PID_FILE"
fi

if command -v fuser >/dev/null 2>&1; then
  fuser -k "${PORT}/tcp" >/dev/null 2>&1 || true
fi

nohup setsid ./node_modules/.bin/vite --host "$HOST" --port "$PORT" --strictPort >"$LOG_FILE" 2>&1 </dev/null &
pid="$!"
echo "$pid" >"$PID_FILE"

for _ in 1 2 3 4 5; do
  if is_server_healthy; then
    echo "started: ${URL}"
    echo "pid: ${pid}"
    echo "log: ${LOG_FILE}"
    exit 0
  fi
  sleep 1
done

echo "failed to start dev server at ${URL}. log: ${LOG_FILE}" >&2
tail -n 80 "$LOG_FILE" >&2 || true
exit 1
