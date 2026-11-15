#!/usr/bin/env bash
#
# run-ui-check.sh — chạy ui-check (68 màn hình × 3 viewport) với production build.
#
# Vì sao PHẢI dùng production build (không dùng `npm run dev`): xem AGENTS.md
# §"UI check". `next dev` không prefetch, nên `router.prefetch('/dat-ve')` cho
# route không tồn tại (chỉ có `/dat-ve/[id]`) trả 404 ở MỌI trang trong
# `next start` mà không hề xảy ra ở dev; thêm nữa dev server biên dịch route
# theo yêu cầu nên một sleep cố định sẽ chụp ảnh lúc còn skeleton. Cổng debug
# CDP cũng phải khác để không tranh với một phiên ui-check khác trên cùng máy.
#
# Biến môi trường:
#   UI_CHECK_PORT      cổng server (mặc định 4029)
#   UI_CHECK_CDP_PORT  cổng debug CDP (mặc định 9345)
#   UI_CHECK_DIST_DIR  thư mục build (mặc định .next-uicheck)
#   UI_CHECK_SKIP_BUILD=1  dùng lại bản build đã có, không build lại
set -uo pipefail
cd "$(dirname "$0")/.."

PORT="${UI_CHECK_PORT:-4029}"
CDP_PORT="${UI_CHECK_CDP_PORT:-9345}"
DIST_DIR="${UI_CHECK_DIST_DIR:-.next-uicheck}"
BASE_URL="http://127.0.0.1:${PORT}"
LOG="${UI_CHECK_LOG:-/tmp/vietjet-ui-check-server.log}"

export JWT_SECRET="${JWT_SECRET:-ci-ui-check-secret}"
export JWT_REFRESH_SECRET="${JWT_REFRESH_SECRET:-ci-ui-check-refresh-secret}"

# Mock in-memory database — không cần DB thật cho kiểm tra giao diện.
#
# `next start` chạy NODE_ENV=production, và `src/lib/neon.ts` CỐ Ý ném lỗi khi
# production mà thiếu `DATABASE_URL` — để không ai lỡ phục vụ dữ liệu in-memory
# thay cho DB thật. `ALLOW_MOCK_DB=1` là ngoại lệ duy nhất, dành riêng cho cổng
# này: thiếu nó thì mọi API trả 500 và 42/68 ảnh bị đánh lỗi, trông như hồi quy
# giao diện trong khi thật ra chỉ là thiếu database. Chỉ script này export biến
# đó; KHÔNG đặt nó trên server.
export DATABASE_URL=""
export NEON_FETCH_ENDPOINT=""
export ALLOW_MOCK_DB=1

if [ "${UI_CHECK_SKIP_BUILD:-0}" != "1" ]; then
  echo "▸ Đang build production (DIST_DIR=$DIST_DIR)…"
  DIST_DIR="$DIST_DIR" npm run build > "$LOG.build" 2>&1 || {
    echo "❌ Build thất bại. Log:" >&2
    tail -40 "$LOG.build" >&2
    exit 1
  }
fi

# `next build` ghi lại `next-env.d.ts` và định dạng lại `tsconfig.json` để trỏ
# tới distDir vừa dùng — cần trả lại để repo không bị bẩn (xem AGENTS.md).
cleanup_files() {
  git checkout -- next-env.d.ts tsconfig.json 2>/dev/null || true
}
trap cleanup_files EXIT INT TERM

echo "▸ Đang khởi động production server…"
: > "$LOG"
DIST_DIR="$DIST_DIR" npx next start -p "$PORT" > "$LOG" 2>&1 &
SERVER_PID=$!

cleanup() {
  kill -- -"$SERVER_PID" 2>/dev/null || kill "$SERVER_PID" 2>/dev/null || true
  wait "$SERVER_PID" 2>/dev/null || true
}
trap 'cleanup; cleanup_files' EXIT INT TERM

READY=0
for _ in $(seq 1 90); do
  if curl -fsS "${BASE_URL}/api/csrf" >/dev/null 2>&1; then
    READY=1
    break
  fi
  sleep 1
done

if [ "$READY" -ne 1 ]; then
  echo "❌ Server không sẵn sàng sau 90s. Log:" >&2
  tail -40 "$LOG" >&2
  exit 1
fi

UI_CHECK_BASE_URL="$BASE_URL" UI_CHECK_CDP_PORT="$CDP_PORT" node scripts/ui-check.cjs
