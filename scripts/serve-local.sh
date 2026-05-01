#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-5173}"
HOST="${HOST:-0.0.0.0}"
PID_FILE="${PID_FILE:-/tmp/diagram-generation-tool-vite-${PORT}.pid}"
LOG_FILE="${LOG_FILE:-/tmp/diagram-generation-tool-vite-${PORT}.log}"
URL="http://localhost:${PORT}/"

cd "$(dirname "$0")/.."

if curl -fsS "$URL" >/dev/null 2>&1; then
  echo "already running: ${URL}"
  echo "log: ${LOG_FILE}"
  exit 0
fi

if [[ -f "$PID_FILE" ]]; then
  old_pid="$(cat "$PID_FILE")"
  if [[ -n "$old_pid" ]] && kill -0 "$old_pid" 2>/dev/null; then
    kill "$old_pid" 2>/dev/null || true
    sleep 1
  fi
  rm -f "$PID_FILE"
fi

nohup setsid ./node_modules/.bin/vite --host "$HOST" --port "$PORT" --strictPort >"$LOG_FILE" 2>&1 </dev/null &
pid="$!"
echo "$pid" >"$PID_FILE"

for _ in 1 2 3 4 5; do
  if curl -fsS "$URL" >/dev/null 2>&1; then
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
