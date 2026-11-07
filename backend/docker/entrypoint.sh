#!/bin/sh
# 1) 檢查設定  2) 等待資料庫並套用 migration  3) 啟動 API
set -e
python -m memora.preflight

tries=0
until alembic upgrade head; do
  tries=$((tries + 1))
  if [ "$tries" -ge 30 ]; then
    echo "[MEMORA] 資料庫 migration 失敗：請檢查 db 容器是否正常，以及 POSTGRES_PASSWORD 是否與資料庫初始化時相同" >&2
    exit 1
  fi
  echo "[MEMORA] 等待資料庫就緒…（$tries）"
  sleep 2
done
exec "$@"
