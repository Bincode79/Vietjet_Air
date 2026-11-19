-- 055_movi_credit_hold.sql
--
-- "Bay trước trả sau" (MOVI) cần hai thứ mà schema chưa có:
--
--   1. MỘT GIỮ CHỗ CÓ THỜI HẠN. Khách chọn MOVI thì đặt chỗ phải ở
--      trạng thái `pending` trong 30 phút; quá 30 phút chưa thanh toán thì
--      mã đặt chỗ phải tự hủy và ghế phải được trả lại kho. Trước đây
--      `bookings` chỉ có `status`, nên "hết hạn" là một khái niệm không
--      lưu được — không có cột nào giữ mốc hết hạn, nên không có cách nào
--      biết đơn nào phải bị hủy.
--
--   2. MỘT HỒ SƠ TÍN DỤNG. Kỳ hạn, ngày sinh, CCCD và số điện thoại
--      của người đăng ký trả góp trước đây bị nhét vào
--      `payments.transfer_note` (một chuỗi tự do) — nên hồ sơ không có
--      cấu trúc, không tra cứu được, và ở cổng `/thanh-toan/gateway/movi`
--      thì bị mất sạch (dispatcher không truyền `transfer_note`).
--
-- Cả hai đều là phần BỔ SUNG. Không `DROP`, không sửa dữ liệu cũ, không
-- đụng tới `bookings.status` (CHECK của nó đã cho phép `cancelled`, nên
-- hủy giữ chỗ không cần thêm trạng thái mới).
--
-- Vì sao `ADD COLUMN IF NOT EXISTS` đi kèm CHECK cài riêng:
--   `IF NOT EXISTS` biến CẢ câu lệnh thành no-op khi cột đã tồn tại, và
--   Postgres HỦY luôn phần định nghĩa constraint đi kèm — constraint trong
--   câu `ADD COLUMN IF NOT EXISTS` không bao giờ được cài. Xem `005`.

-- ─── 1. Giữ chỗ có thời hạn ──────────────────────────────────────────────────

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS hold_expires_at TIMESTAMPTZ;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS hold_method VARCHAR(20);

-- Sweep đọc đúng một điều kiện: `hold_expires_at IS NOT NULL AND
-- hold_expires_at <= NOW()`. Partial index trên chính cột đó để sweep không
-- phải quét cả bảng `bookings`.
CREATE INDEX IF NOT EXISTS idx_bookings_hold_expires
  ON bookings (hold_expires_at)
  WHERE hold_expires_at IS NOT NULL;

-- `hold_method` là "movi" hoặc NULL. CHECK cài bằng `DO` block + guard
-- `conrelid` (tên constraint là duy nhất theo SCHEMA, không theo bảng —
-- `023` đã từng bỏ sót vì chỉ so trên `conname`).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'bookings_hold_method_check'
      AND conrelid = 'bookings'::regclass
  ) THEN
    ALTER TABLE bookings
      ADD CONSTRAINT bookings_hold_method_check
      CHECK (hold_method IS NULL OR hold_method IN ('movi'));
  END IF;
END $$;

-- ─── 2. Hồ sơ tín dụng MOVI ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS movi_credit_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES user_profiles(id),
  full_name VARCHAR(255) NOT NULL,
  birth_date DATE,
  national_id VARCHAR(20) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  tenor_months INTEGER NOT NULL DEFAULT 3,
  amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'submitted',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- CHECK cài riêng, không đặt trong `CREATE TABLE IF NOT EXISTS`:
-- `CREATE TABLE IF NOT EXISTS` KHÔNG nâng cấp một bảng đã tồn tại, nên một
-- CHECK viết trong đó chỉ áp cho database tạo mới.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'movi_credit_applications_status_check'
      AND conrelid = 'movi_credit_applications'::regclass
  ) THEN
    ALTER TABLE movi_credit_applications
      ADD CONSTRAINT movi_credit_applications_status_check
      CHECK (status IN ('submitted', 'approved', 'rejected'));
  END IF;
END $$;

-- Một đặt chỗ chỉ có một hồ sơ tín dụng: khách thử lại sau một lần giao
-- dịch hỏng sẽ UPDATE hồ sơ cũ chứ không tạo hồ sơ thứ hai.
--
-- UNIQUE không có dạng `NOT VALID`, nên index này sẽ abort nếu bảng đang có
-- trùng. Bảng này do migration này tạo ra (rỗng), nên chưa có dữ liệu để
-- vi phạm — nhưng để index ở ngoài `CREATE TABLE` để một lần apply sau đó
-- cũng cài được, và để `ON CONFLICT (booking_id)` ở tầng ứng dụng có mục
-- tiêu xung đột để trỏ tới.
CREATE UNIQUE INDEX IF NOT EXISTS movi_credit_applications_one_per_booking
  ON movi_credit_applications (booking_id);

CREATE INDEX IF NOT EXISTS idx_movi_credit_applications_status
  ON movi_credit_applications (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_movi_credit_applications_user
  ON movi_credit_applications (user_id);
