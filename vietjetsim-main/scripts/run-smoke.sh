#!/usr/bin/env bash
# Chạy smoke test với dev server tự quản lý trong cùng một tiến trình.
#
# Script này tồn tại vì CI cần một lệnh duy nhất: dựng server, chờ nó sẵn
# sàng, chạy smoke test, rồi dọn dọn. Ở local, chạy nó sẽ giữ server sống
# suốt quá trình test (không phụ thuộc vào việc terminal còn mở).
set -uo pipefail

cd "$(dirname "$0")/.."

LOG="${SMOKE_LOG:-/tmp/vietjet-smoke-server.log}"
PORT="${SMOKE_PORT:-4028}"

export JWT_SECRET="${JWT_SECRET:-ci-smoke-test-secret}"
export JWT_REFRESH_SECRET="${JWT_REFRESH_SECRET:-ci-smoke-test-refresh-secret}"

# Smoke test PHẢI chạy trên bộ nhớ in-memory, không phải database thật.
#
# Lý do: smoke test khẳng định *hành vi guard* (401 khi không có phiên, 403 khi
# thiếu CSRF, 404 khi đặt chỗ không tồn tại) và *đường sinh file* — những thứ
# phải giống nhau mọi lần chạy. Nếu nối vào database thật thì kết quả phụ thuộc
# vào dữ liệu đang có (và trong CI sẽ không có database nào cả).
#
# `.env.local` ở local có `DATABASE_URL` thật. `unset` KHÔNG đủ: Next nạp
# `.env.local` vào `process.env` khi khởi động server, nên biến bị unset lại
# được gán lại giá trị thật. Phải gán chuỗi RỖNG — `hasRealDb` kiểm tra
# `!!process.env.DATABASE_URL`, nên rỗng là falsy ⇒ mock in-memory được dùng,
# và Next không ghi đè biến đã tồn tại.
export DATABASE_URL=""
export NEON_FETCH_ENDPOINT=""

: > "$LOG"
npm run dev > "$LOG" 2>&1 &
SERVER_PID=$!

cleanup() {
  # `kill -- -$SERVER_PID` giết cả nhóm tiến trình (npm → next dev →
  # next-server). Giết riêng pid của npm sẽ để lại next-server giữ cổng.
  kill -- -"$SERVER_PID" 2>/dev/null || kill "$SERVER_PID" 2>/dev/null || true
  wait "$SERVER_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# Chờ server trả lời — `scripts/smoke-test.cjs` cũng tự poll, nhưng ở đây ta
# dừng sớm nếu server không dậy được, để báo lỗi kèm log thay vì chờ 90s.
for _ in $(seq 1 60); do
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "dev server đã thoát. Log:" >&2
    cat "$LOG" >&2
    exit 1
  fi
  code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORT}/api/csrf" || true)
  if [ "$code" = "200" ]; then
    break
  fi
  sleep 1
done

SMOKE_BASE_URL="http://127.0.0.1:${PORT}" node scripts/smoke-test.cjs
STATUS=$?

if [ "$STATUS" -ne 0 ]; then
  echo "--- server log ---" >&2
  tail -50 "$LOG" >&2
fi

exit "$STATUS"
