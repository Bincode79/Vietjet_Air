-- Migration 051: `seat_locks` do SERVER sở hữu, không còn do client tự sinh
--
-- Vấn đề (P0-4 — "khóa ghế tạm bị cưỡng chiếm"):
--
--   `seat_locks.session_id` là chuỗi do CLIENT tự sinh trong `sessionStorage`
--   và gửi lên. Hệ quả:
--     * ai cũng tự nhận được quyền sở hữu một lock — không cần chứng minh
--       gì cả;
--     * endpoint SSE trả `session_id` cho MỌI người xem, nên chỉ cần đọc
--       được giá trị đó là cướng được ghế của người khác;
--     * và nghiêm trọng hơn: KHÔNG chỗ nào trong luồng tạo booking đọc bảng
--       này, nên lock chỉ mang tính thông báo — hai khách vẫn đặt được cùng
--       một số ghế.
--
-- Mô hình mới:
--
--   * `vj_seat_session` là cookie httpOnly do SERVER cấp (xem `src/proxy.ts`).
--     Client không đọc được, không tự dựng được, và không ai khác biết giá
--     trị của nó.
--   * `owner_token` là SHA-256 của cookie đó. Đây là thứ được LƯU trong DB,
--     nên đọc được database cũng không dùng được làm cookie để giả mạo chủ
--     sở hữu (hash không đảo ngược được).
--   * Server tự tính cờ `mine` khi trả SSE, nên `owner_token` không bao giờ
--     rời khỏi server.
--
-- Vì sao `session_id` cũ bị bỏ chứ không giữ lại làm cột thứ hai:
--
--   Nó chứa giá trị mà client tự sinh, tức là thông tin KHÔNG bí mật. Giữ
--   nó cạnh `owner_token` chỉ để lấy lại giá trị đã băm. Nên đổi tên cột và
--   dùng lại luôn.
--
-- Re-applyable (AGENTS.md): mỗi câu đều idempotent, và `UPDATE` chỉ chạm
-- vào những dòng KHÔNG có dạng hash — nên lượt replay thứ hai KHÔNG xoá
-- `owner_token` của những lock đang sống.

-- ─── 1) Đổi tên `session_id` → `owner_token` ─────────────────────────────────
--
-- Đổi tên (chứ không thêm cột mới) vì cột cũ không còn giá trị gì: mọi
-- thứ nó từng chứa — quyền sở hữu — giờ nằm ở `owner_token`.
--
-- `DO $$` + kiểm tra `information_schema` vì `ALTER TABLE ... RENAME COLUMN`
-- không có dạng `IF EXISTS` cho tên cột: chạy lại lần hai sẽ lỗi "column
-- does not exist" và dừng cả file.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'seat_locks' AND column_name = 'session_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'seat_locks' AND column_name = 'owner_token'
  ) THEN
    ALTER TABLE seat_locks RENAME COLUMN session_id TO owner_token;
  END IF;
END $$;

-- ─── 2) Dòng lock cũ không còn chủ sở hữu xác định ───────────────────────────
--
-- Lock do client cũ tạo có `session_id` là chuỗi tự sinh — không ai chứng
-- minh được quyền sở hữu chúng, và client mới không thể trình ra giá trị đó
-- nữa. Để chúng ở dạng NULL nghĩa là "không ai giữ" ⇒ chúng không chặn ai,
-- và tự biến mất sau 10 phút theo `expires_at`.
--
-- Cột phải cho phép NULL để chỗ trống "không ai giữ" tồn tại. Việc này phải
-- đi TRƯỚC câu `UPDATE` bên dưới: `session_id` cũ là `NOT NULL`, nên một
-- câu `SET owner_token = NULL` trên cột đó sẽ lỗi và dừng cả file.
ALTER TABLE seat_locks ALTER COLUMN owner_token DROP NOT NULL;

-- Chỉ chạm vào dòng KHÔNG có dạng SHA-256 hex: một lượt replay phải KHÔNG
-- xoá `owner_token` của những lock đang sống (mà chúng luôn có dạng hash).
UPDATE seat_locks
SET owner_token = NULL
WHERE owner_token IS NOT NULL
  AND owner_token !~ '^[0-9a-f]{64}$';

-- ─── 3) Ràng buộc hình dạng ──────────────────────────────────────────────────
--
-- `owner_token` chỉ được chứa SHA-256 hex. Nhờ vậy cột này KHÔNG THỂ chứa
-- `session_id` thô của client — tức là không có đường nào để đưa một giá
-- trị tự chọn vào cột "chủ sở hữu" nữa. Ràng buộc được cài RIÊNG (không
-- khai báo trong `CREATE TABLE`), vì `CREATE TABLE IF NOT EXISTS` không áp
-- dụng ràng buộc lên bảng đã tồn tại.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'seat_locks_owner_token_shape'
      AND conrelid = 'seat_locks'::regclass
  ) THEN
    ALTER TABLE seat_locks
      ADD CONSTRAINT seat_locks_owner_token_shape
      CHECK (owner_token IS NULL OR owner_token ~ '^[0-9a-f]{64}$');
  END IF;
END $$;

-- Truy vấn "ghế nào đang bị ai giữ" lọc theo `owner_token` khi huỷ lock và
-- khi kiểm tra chủ sở hữu lúc tạo booking.
CREATE INDEX IF NOT EXISTS idx_seat_locks_owner_token
  ON seat_locks (owner_token);

-- ─── Bảng mới phải được đo trong harness migration ──────────────────────────
--
-- `seat_locks` KHÔNG được đưa vào `OPERATING_TABLES_SQL` của
-- `scripts/test-migrations.cjs`: bảng này chỉ chứa lock tạm (10 phút), nên
-- một bảng luôn rỗng sau mỗi lượt replay là ĐÚNG — đo nó như một bảng dữ
-- liệu khách hàng sẽ báo động giả. Điều cần đo là cấu trúc: tên cột và
-- ràng buộc hình dạng — chúng được kiểm tra bằng `checkInvariants()`.
