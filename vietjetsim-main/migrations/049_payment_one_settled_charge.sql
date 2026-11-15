-- 049_payment_one_settled_charge.sql
--
-- Chống thanh toán trùng ở TẦNG DATABASE cho `payments`.
--
-- Vấn đề:
--   Chống double-charge trước đây chỉ nằm ở tầng route
--   (`POST /api/thanh-toan` đọc `booking.status`, thấy `confirmed` thì 409).
--   Đó là một read-then-write: giữa lúc đọc và lúc ghi, một request thứ hai
--   có thể đọc đúng cùng giá trị `status = 'pending'` và cũng vượt qua.
--   Hai request thanh toán chạy song song (double-click, retry, tab mở hai
--   lần) ⇒ hai dòng `payments` `completed` cho CÙNG một đặt chỗ, và
--   `getBookingCashPaid` cộng cả hai vào trần hoàn tiền ⇒ trần hoàn vượt số
--   tiền đã thu.
--
--   Bảng `payments` không có ràng buộc nào chặn điều đó. Migration 020 đã
--   làm đúng thứ này cho `refund_requests`
--   (`idx_refund_requests_open_booking`), và 037 cho `wallet_transactions`
--   (`wallet_transactions_one_refund_per_reference`) — cùng một mẫu, áp ở
--   đây cho phía thu.
--
-- Hình dạng index:
--   Partial UNIQUE trên `(booking_id)` với điều kiện `status = 'completed'`.
--
--   * Partial, vì CHỈ khoản thu đã thành công mới là tiền. Một booking có
--     thể có nhiều giao dịch `failed` (khách thử lại sau khi ngân hàng từ
--     chối) và nhiều giao dịch `pending` (khách đã tải biên lai, đang chờ
--     đối soát, rồi thử thanh toán bằng cách khác) — những dòng đó không
--     phải là khoản thu và không được index chặn.
--
--   * CHỈ `completed`, KHÔNG gồm `pending`. Đây là điểm then chốt: nếu index
--     gồm cả `pending`, thì một booking đã có giao dịch `pending` (khách
--     tải biên lai) sẽ bị chặn khi khách thử thanh toán lại bằng thẻ —
--     đúng cái luồng hợp lệ mà `POST /api/thanh-toan` hỗ trợ. `pending` là
--     "đang giữ tiền chờ đối soát", không phải "đã thu", nên nó không được
--     cạnh tranh vị trí với khoản thu thật sự.
--
--     Hệ quả còn lại: index này bảo vệ LUÔN, kể cả khi admin đối soát một
--     giao dịch `pending` cũ sau khi khách đã thanh toán bằng cách khác —
--     `UPDATE payments SET status = 'completed'` lúc đó chạm index và bị
--     từ chối, nghĩa là không thể có hai khoản thu cho một đặt chỗ.
--
-- Idempotent: CI replay toàn bộ bộ migration, và mỗi câu lệnh dưới đây là
-- một transaction riêng (psql -f, không có BEGIN bao quanh).
--
-- ── 1. Dọn các bản ghi trùng đã tồn tại ────────────────────────────────────
--
-- Một index UNIQUE không thể được tạo trên một bảng đang vi phạm nó: Postgres
-- báo lỗi và ABORT, mà file này không có BEGIN nên những câu lệnh phía sau sẽ
-- không chạy. Đoạn này đóng lại khoản trống trước khi tạo index:
--
--   * Giữ lại dòng `completed` cũ nhất của mỗi booking (nó là khoản thu
--     đầu tiên, và nó là dòng mà `getBookingCashPaid` cộng vào trần hoàn —
--     giữ nó giữ cho trần hoàn khớp với những gì đã thu).
--   * Đánh dấu các dòng `completed` thừa là `failed`, để chúng không còn
--     được tính là khoản thu.
--   * `pending` và `failed` thì không đụng tới: nhiều giao dịch ở hai trạng
--     thái đó là hợp lệ (xem phần giải thích index ở trên).
DO $dedupe$
BEGIN
  UPDATE payments p
  SET status = 'failed'
  WHERE p.status = 'completed'
    AND EXISTS (
      SELECT 1 FROM payments other
      WHERE other.booking_id = p.booking_id
        AND other.status = 'completed'
        AND (
          other.created_at < p.created_at
          OR (other.created_at = p.created_at AND other.id < p.id)
        )
    );
END
$dedupe$;

-- ── 2. Index chặn double-charge ────────────────────────────────────────────
--
-- `CREATE UNIQUE INDEX` không có dạng `NOT VALID` nên không thể cài trước rồi
-- kiểm tra sau; nó phải được tạo sau khi đoạn dedupe ở trên đã dọn sạch.
--
-- `CONCURRENTLY` không dùng được ở đây: `psql -f` không có BEGIN bao quanh,
-- nên câu lệnh chạy trong transaction ngầm của nó và `CREATE INDEX
-- CONCURRENTLY` bị Postgres từ chối ("cannot run inside a transaction block").
CREATE UNIQUE INDEX IF NOT EXISTS payments_one_settled_charge_per_booking
    ON payments (booking_id)
  WHERE status = 'completed';
