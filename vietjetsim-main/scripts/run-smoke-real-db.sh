#!/usr/bin/env bash
# Chạy smoke test trên một Postgres THẬT (không phải bộ nhớ in-memory).
#
# Vì sao file này tồn tại
# -------------------
# `scripts/run-smoke.sh` (bộ nhớ) xanh 36/36, nhưng nó xanh vì một lý do mà
# chính nó cũng nói ra: dòng mẫu `VJSMOKE` chỉ tồn tại trong `src/lib/neon.ts`
# — tức trong RAM. Chạy cùng bộ khẳng định đó với `DATABASE_URL` thật thì
# route `/api/dat-ve/[id]/ve-dien-tu` trả 404, vì trong DB không có dòng mẫu
# nào. Hệ quả: đường sinh vé điện tử — thứ khách nhận ra ngoài đời — chưa
# từng được cổng HTTP nào canh giữ khi app chạy với database thật.
#
# Script này dựng đúng cái còn thiếu: một Postgres thật trong Docker, toàn bộ
# migration được replay lên nó, một đặt chỗ mẫu có hành khách được seed vào
# đó, rồi chạy đúng bộ khẳng định của `smoke-test.cjs` lên app đang nối tới
# database đó.
#
# Vì sao cần cầu nối HTTP
# -----------------------
# App dùng `@neondatabase/serverless` — driver này CHỈ nói HTTP, nó POST
# `{query, params}` tới `https://<host>/sql`. Một `docker run postgres` không
# có endpoint HTTP, nên app không tới được câu SQL nào. `scripts/neon-http-bridge.cjs`
# là cầu nối đó: nó nói đúng giao thức Neon HTTP, nhưng xuống Postgres thật.
#
# Mọi bước đều tự dọn: container, bridge và server đều bị hạ trong `trap`, kể
# cả khi script bị Ctrl-C.
#
# Chạy:
#   bash scripts/run-smoke-real-db.sh
#
# Biến môi trường:
#   SMOKE_DB_PORT   cổng Postgres trên máy (mặc định 55432)
#   SMOKE_BRIDGE_PORT  cổng của cầu nối HTTP (mặc định 4444)
#   SMOKE_PORT      cổng của app (mặc định 4029)
#   KEEP_SMOKE_DB=1 giữ container Postgres sau khi chạy (để dòn dữ liệu)

set -uo pipefail

cd "$(dirname "$0")/.."

DB_CONTAINER="vj-smoke-real-pg"
DB_IMAGE="postgres:16-alpine"
DB_PORT="${SMOKE_DB_PORT:-55432}"
BRIDGE_PORT="${SMOKE_BRIDGE_PORT:-4444}"
APP_PORT="${SMOKE_PORT:-4029}"
DB_NAME="app"
DB_USER="postgres"
DB_PASSWORD="pw"
PG_URL="postgresql://${DB_USER}:${DB_PASSWORD}@127.0.0.1:${DB_PORT}/${DB_NAME}"

LOG_DIR="$(mktemp -d /tmp/vietjet-smoke-real.XXXXXX)"
BRIDGE_LOG="$LOG_DIR/bridge.log"
APP_LOG="$LOG_DIR/app.log"

export JWT_SECRET="${JWT_SECRET:-smoke-real-db-secret}"
export JWT_REFRESH_SECRET="${JWT_REFRESH_SECRET:-smoke-real-db-refresh-secret}"

cleanup() {
  # Hạ server trước: nó giữ kết nối tới Postgres, và để container sống khi
  # app còn chạy sẽ để lại một Postgres "đang bận" sau khi script kết thúc.
  [ -n "${APP_PID:-}" ] && kill "$APP_PID" 2>/dev/null
  [ -n "${BRIDGE_PID:-}" ] && kill "$BRIDGE_PID" 2>/dev/null
  wait "${APP_PID:-}" 2>/dev/null
  wait "${BRIDGE_PID:-}" 2>/dev/null
  if [ "${KEEP_SMOKE_DB:-0}" = "1" ]; then
    echo "Giữ container $DB_CONTAINER (KEEP_SMOKE_DB=1). Xoá bằng: docker rm -f $DB_CONTAINER"
  else
    docker rm -f "$DB_CONTAINER" >/dev/null 2>&1
  fi
}
trap cleanup EXIT INT TERM

fail() {
  echo "" >&2
  echo "✗ $1" >&2
  echo "--- log thư mục: $LOG_DIR" >&2
  [ -f "$APP_LOG" ] && { echo "--- app log (20 dòng cuối) ---" >&2; tail -20 "$APP_LOG" >&2; }
  [ -f "$BRIDGE_LOG" ] && { echo "--- bridge log (20 dòng cuối) ---" >&2; tail -20 "$BRIDGE_LOG" >&2; }
  exit 1
}

command -v docker >/dev/null 2>&1 || fail "Không có `docker` trên PATH — cần Docker để dựng Postgres thật."
docker info >/dev/null 2>&1 || fail "Docker daemon chưa chạy (thử `colima start`)."

# Script này chạy app ở chế độ PRODUCTION (`scripts/start-standalone.cjs`), không
# phải `next dev`. Đó là điều bắt buộc, không phải sở thích: lỗi "pdfkit không
# tìm thấy font Helvetica.afm" chỉ xuất hiện ở bản build (khi `pdfkit` bị bundle
# vào server chunk, `__dirname` trỏ sai chỗ) — unit test chạy trên source vẫn
# xanh. Chạy `next dev` ở đây sẽ báo xanh mà không hề chạm vào đường sinh file.
[ -d ".next/server" ] || fail "Chưa có bản build. Chạy `npm run build` trước (script này đo bản production)."

# ── 1. Postgres ──────────────────────────────────────────────────────────────
echo "▸ Dựng Postgres $DB_IMAGE trên cổng $DB_PORT"
docker rm -f "$DB_CONTAINER" >/dev/null 2>&1
docker run -d --name "$DB_CONTAINER" \
  -e "POSTGRES_PASSWORD=$DB_PASSWORD" \
  -e "POSTGRES_DB=$DB_NAME" \
  -p "${DB_PORT}:5432" \
  "$DB_IMAGE" >/dev/null || fail "Không dựng được container Postgres."

# `pg_isready` trả lời "ready" ngay cả với server tạm của initdb, nên bài kiểm
# tra phải là một câu hỏi thật — cùng lý do `test-migrations.cjs` làm vậy.
READY=0
for _ in $(seq 1 60); do
  if docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -tAc "SELECT 1" 2>/dev/null | grep -q 1; then
    READY=1
    break
  fi
  sleep 1
done
[ "$READY" = "1" ] || fail "Postgres không sẵn sàng sau 60s."
echo "  ok Postgres sẵn sàng"

# ── 2. Migration ─────────────────────────────────────────────────────────────
# Replay TOÀN BỘ migration, đúng thứ tự tên file, mỗi file một transaction
# riêng (`psql -f` không có BEGIN). Đây là cùng cách `test-migrations.cjs` và
# CI làm — nên schema của Postgres ở đây y hệt schema production.
echo "▸ Replay migration"
MIGRATION_COUNT=0
for file in $(ls migrations/*.sql | sort); do
  if ! docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" \
      -v ON_ERROR_STOP=1 -q -f - < "$file" >/dev/null 2>&1; then
    echo "  ✗ migration lỗi: $file" >&2
    docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -f - < "$file" 2>&1 | tail -10 >&2
    fail "Migration $file không áp dụng được."
  fi
  MIGRATION_COUNT=$((MIGRATION_COUNT + 1))
done
echo "  ok $MIGRATION_COUNT migration đã áp dụng"

# ── 3. Seed đặt chỗ mẫu ──────────────────────────────────────────────────────
# Đặt chỗ mẫu PHẢI tồn tại trong DB thật, không phải trong RAM: đó mới là
# điều làm cho đường sinh PDF được kiểm thử. Nó cần:
#   - một hành khách (route lọc `legs.filter(l => l.passengers.length > 0)`)
#   - một `trip_id` (route cần `booking.trip_id` để lấy chặng)
#   - một chuyến bay thật (getBookingById JOIN flights)
#
# `VJSMOKE` là mã 7 ký tự, còn `generate_booking_code()` sinh mã 6 ký tự — nhưng
# cột `bookings.booking_code` không có CHECK về độ dài (chỉ có UNIQUE), và
# bộ khẳng định cần đúng tên file `ve-dien-tu-VJSMOKE.pdf`, nên mã được seed
# tường minh thay vì để cột DEFAULT sinh ra.
echo "▸ Seed đặt chỗ mẫu VJSMOKE"
docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -q <<'SQL' >/dev/null || fail "Seed đặt chỗ mẫu lỗi."
-- Người dùng mẫu: migration 022 đổi tên miền demo từ `@vietjetsim.vn` sang
-- `@vietjetair.vn`, nên phải bắt theo vai trò chứ không theo miền — miền đổi
-- theo thời gian còn PNR thì không.
WITH u AS (
  SELECT id FROM user_profiles WHERE role = 'user' ORDER BY created_at LIMIT 1
), f AS (
  SELECT id FROM flights ORDER BY depart_time LIMIT 1
), b AS (
  INSERT INTO bookings (user_id, flight_id, status, total_price, booking_code, trip_id, leg_role)
  SELECT u.id, f.id, 'confirmed', 899000, 'VJSMOKE', gen_random_uuid(), 'outbound'
    FROM u, f
  RETURNING id
)
INSERT INTO passengers (booking_id, name, dob, id_number, gender, country_code, phone, email, passenger_type, seat_number)
SELECT b.id, 'Nguyễn Văn Anh', '1990-01-01', 'C1234567', 'male', 'VN', '0900000001',
       'khach@vietjetsim.vn', 'adult', '12A'
  FROM b;
SQL
echo "  ok đặt chỗ VJSMOKE đã có hành khách"

# ── 4. Cầu nối Neon HTTP → Postgres ──────────────────────────────────────────
echo "▸ Khởi động cầu nối Neon HTTP trên cổng $BRIDGE_PORT"
PORT="$BRIDGE_PORT" PG_URL="$PG_URL" node scripts/neon-http-bridge.cjs > "$BRIDGE_LOG" 2>&1 &
BRIDGE_PID=$!
BRIDGE_READY=0
for _ in $(seq 1 30); do
  if curl -s -o /dev/null -X POST -H 'Content-Type: application/json' \
      -d '{"query":"SELECT 1","params":[]}' "http://127.0.0.1:${BRIDGE_PORT}/sql" 2>/dev/null; then
    BRIDGE_READY=1
    break
  fi
  sleep 1
done
[ "$BRIDGE_READY" = "1" ] || fail "Cầu nối Neon HTTP không sẵn sàng."

# ── 5. App nối vào Postgres qua cầu nối ─────────────────────────────────────
# `DATABASE_URL` trỏ vào Postgres (nên `hasRealDb` là true ⇒ app KHÔNG dùng
# mock), còn `NEON_FETCH_ENDPOINT` trỏ vào cầu nối (nên driver Neon gửi câu
# hỏi của nó xuống Postgres thật).
echo "▸ Khởi động app trên cổng $APP_PORT, nối Postgres thật"
DATABASE_URL="$PG_URL" \
NEON_FETCH_ENDPOINT="http://127.0.0.1:${BRIDGE_PORT}/sql" \
  node scripts/start-standalone.cjs --port "$APP_PORT" > "$APP_LOG" 2>&1 &
APP_PID=$!

APP_READY=0
for _ in $(seq 1 60); do
  if ! kill -0 "$APP_PID" 2>/dev/null; then
    break
  fi
  code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${APP_PORT}/api/csrf" 2>/dev/null)
  if [ "$code" = "200" ]; then
    APP_READY=1
    break
  fi
  sleep 1
done
[ "$APP_READY" = "1" ] || fail "App không dậy được trong 60s."

# ── 6. Chạy bộ khẳng định ────────────────────────────────────────────────────
echo "▸ Chạy smoke test trên DB thật"
echo ""
SMOKE_BASE_URL="http://127.0.0.1:${APP_PORT}" node scripts/smoke-test.cjs
STATUS=$?

echo ""
if [ "$STATUS" -ne 0 ]; then
  fail "Smoke test trên DB thật đỏ $STATUS assertion."
fi
echo "✓ Smoke test trên Postgres thật: xanh toàn bộ."
exit 0
