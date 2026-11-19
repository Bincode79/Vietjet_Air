-- 056_booking_ancillary_payment_status.sql
--
-- `booking_ancillaries` (migration 029) trước đây không phân biệt được dòng
-- "đã nằm trong tiền vé" với dòng "khách mua thêm sau khi đặt vé". Hệ quả:
-- route `/api/dat-ve/[id]/dich-vu` ghi thêm bảo hiểm/ăn/xe vào bảng này thì
-- không có cách nào biết dòng đó đã thu tiền hay chưa — hoặc thu hai lần,
-- hoặc cho không.
--
-- `booking_baggage` đã giải đúng bài này từ migration 046/047 bằng cặp
-- `status` + `payment_id`. Migration này đưa `booking_ancillaries` về cùng
-- mô hình:
--
--   - `status = 'paid'`  — dòng được tạo cùng lúc đặt vé (CTE `inserted_ancillaries`
--     không ghi cột này nên nhận DEFAULT), tiền đã nằm trong `total_price`.
--     Đây cũng là giá trị backfill đúng cho mọi dòng đang có: chúng đều thuộc
--     một booking đã hoặc đang trong luồng thanh toán tiền vé.
--   - `status = 'pending'` — dòng do route dịch vụ ghi SAU khi đặt vé; chờ
--     `/api/dat-ve/[id]/dich-vu/thanh-toan` thu tiền rồi `markBookingAncillariesPaid`
--     lật sang 'paid' (idempotent, cùng cơ chế `markBookingBaggagePaid`).
--
-- `payment_id` trỏ tới `payments.id` để truy vết tiền về đúng giao dịch —
-- cùng lý do `booking_baggage.payment_id` tồn tại (migration 047).
--
-- ADD COLUMN đi kèm DEFAULT 'paid' là CÓ CHỦ ĐÍCH: backfill toàn bộ dòng cũ
-- sang 'paid' là đúng sự thật (chúng đã nằm trong giá vé), và CTE tạo booking
-- không cần sửa để giữ nguyên hành vi.

ALTER TABLE booking_ancillaries
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'paid';

ALTER TABLE booking_ancillaries
  ADD COLUMN IF NOT EXISTS payment_id UUID REFERENCES payments(id) ON DELETE SET NULL;

-- CHECK cài riêng bằng DO block (xem `005`/`055`): constraint đi kèm
-- `ADD COLUMN IF NOT EXISTS` không bao giờ được cài trên cột đã tồn tại.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'booking_ancillaries_status_check'
      AND conrelid = 'booking_ancillaries'::regclass
  ) THEN
    ALTER TABLE booking_ancillaries
      ADD CONSTRAINT booking_ancillaries_status_check
      CHECK (status IN ('pending', 'paid', 'cancelled'));
  END IF;
END $$;

-- Sweep "còn gì chưa thu" đọc đúng một điều kiện, nên index partial trên
-- chính điều kiện đó — giống `payments_one_settled_charge_per_booking`.
CREATE INDEX IF NOT EXISTS idx_booking_ancillaries_pending
  ON booking_ancillaries (booking_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_booking_ancillaries_payment
  ON booking_ancillaries (payment_id)
  WHERE payment_id IS NOT NULL;
