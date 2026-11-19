# Kế Hoạch Phân Công Công Việc Giữa 2 Công Cụ (Giai Đoạn Hoàn Thiện Dịch Vụ Bổ Sung & Thanh Toán Sau Đặt Vé)

**Ngày lập:** 19/11/2026  
**Dự án:** Hệ thống mô phỏng Vietjet Air (`vietjetsim`)  
**Mục tiêu:** Hoàn thiện 100% tính toàn vẹn dữ liệu, định giá máy chủ chuẩn Vietjet, cơ chế mock in-memory PostgreSQL (`neon.ts`), phân hệ thanh toán dịch vụ riêng biệt (`dich-vu/thanh-toan`), và kiểm thử hồi quy trực quan (Visual Regression) khớp với bộ 8 ảnh thực tế của Vietjet Air.

---

## I. Nguyên Tắc Phân Chia (Zero-Conflict Contract)

1. **Phạm vi file độc lập tuyệt đối:** Mỗi công cụ có quyền sở hữu (ownership) riêng đối với danh sách file được chỉ định; tuyệt đối không chỉnh sửa đồng thời trên cùng một file để tránh conflict git.
2. **Nguyên tắc Single Source of Truth:** Mọi phép tính giá (hành lý, ghế, suất ăn, bảo hiểm, taxi) bắt buộc tập trung tại `src/features/bookings/pricing.ts`. Phía client hay route API không được hardcode con số giá riêng lẻ.
3. **Cổng kiểm tra chất lượng (Quality Gate):** Mọi thay đổi từ bất kỳ công cụ nào đều phải đảm bảo `npm run type-check` đạt 0 lỗi, `npm test` pass 100%, và dev server cổng 4028 phản hồi bình thường trước khi bàn giao.

---

## II. 🛠️ Công Cụ 1 (Antigravity): Backend Architecture, Data Integrity, Pricing Catalog & Test Harness

> **Trọng tâm:** Cơ sở dữ liệu Neon, Mock in-memory DB, Chuẩn hóa bảng giá `pricing.ts`, Route API nghiệp vụ, Tính toán `pendingAmount`, Endpoint thanh toán dịch vụ và Bộ test tự động.

### 1. Danh Sách File Phụ Trách Độc Quyền
- `src/features/bookings/pricing.ts`
- `src/lib/db.ts`
- `src/lib/neon.ts`
- `src/app/api/dat-ve/[id]/dich-vu/route.ts`
- `src/app/api/dat-ve/[id]/dich-vu/thanh-toan/route.ts`
- `src/test/post-booking-services.test.ts`
- `src/test/neon-ancillary-mock.test.ts`

### 2. Các Đầu Việc Chi Tiết

#### Việc 1: Chuẩn hóa Catalog Định Giá Server-Side (`pricing.ts`)
- Mở rộng bảng `ANCILLARY_OPTIONS` bao quát đầy đủ 7 hạng mục dịch vụ theo thực tế Ảnh #6:
  - `insurance`: 44.000 VND (Bảo hiểm Vietjet Travel Safe / BaoViet).
  - `meal`: 85.000 VND (Suất ăn nóng Jet Café).
  - `taxi`: 150.000 VND (Dịch vụ đón tiễn sân bay).
  - Ghế ngồi: Tích hợp hàm `getSeatPrice(seatNumber)` (SkyBoss 150k, Chỗ rộng 90k, Phía trước 60k, Tiêu chuẩn 40k).
  - Hành lý ký gửi: Giữ vững liên kết với `BAGGAGE_PACKAGES` (20kg: 200k, 30kg: 300k, 40kg: 400k) và `OVERSIZED_BAGGAGE`.
- Cung cấp hàm tra cứu `calculateAncillaryTotal(services)` trả về tổng tiền chính xác để cả server route lẫn client import dùng chung.

#### Việc 2: Tinh Chỉnh Data Layer & Sửa Lỗi Cột (`src/lib/db.ts`)
- Khắc phục hàm `updateBookingTotalAmount`: Đổi sang cập nhật đúng cột `total_price` trong bảng `bookings` (`UPDATE bookings SET total_price = ...`).
- Bổ sung hàm `recalcBookingTotal(bookingId: string)`: Tự động tổng hợp `flight_fare + seat_fee + baggage_fees + ancillary_fees` và cập nhật vào `bookings.total_price`.
- Bổ sung hàm `getPendingAncillaryAmount(bookingId: string)`: Tính tổng tiền các dịch vụ bổ sung chưa thanh toán.

#### Việc 3: Hỗ Trợ Mock In-Memory Neon (`src/lib/neon.ts`)
- Thêm cơ chế xử lý bộ nhớ cho bảng `booking_ancillaries` trong chế độ mock test:
  - Xử lý cú pháp `INSERT INTO booking_ancillaries ... ON CONFLICT (booking_id, option_id) DO UPDATE`.
  - Xử lý cú pháp `DELETE FROM booking_ancillaries WHERE booking_id = ... AND option_id = ...`.
  - Xử lý `SELECT ... FROM booking_ancillaries WHERE booking_id = ...`.
- Đảm bảo toàn bộ test Vitest chạy offline độc lập không phụ thuộc kết nối Neon internet.

#### Việc 4: Nghiệp Vụ Route API & Kiểm Soát Trạng Thái (`api/dat-ve/[id]/dich-vu/route.ts`)
- Chuyển toàn bộ các giá trị literal (44000, 85000, 150000) sang đọc trực tiếp từ `ANCILLARY_OPTIONS` trong `pricing.ts`.
- Đặt bộ lọc trạng thái booking (State Guard) nghiêm ngặt:
  - Chấp thuận cho đặt dịch vụ: `pending` (đang giữ chỗ 30 phút), `pending_hold`, `confirmed`, `completed`.
  - Từ chối: `cancelled`, `refunded` với HTTP 409 Conflict và thông báo song ngữ / tiếng Việt rõ ràng.
- Hỗ trợ cơ chế gỡ dịch vụ (remove contract đối xứng): Cho phép truyền `insurance: false`, `meal: false`, `taxi: false`, `seat_number: null` để hoàn tác lựa chọn.
- Trả về `pendingAmount` bao gồm cả hành lý và dịch vụ bổ sung để client hiển thị thanh toán chính xác.

#### Việc 5: Endpoint Thanh Toán Dịch Vụ Mới (`api/dat-ve/[id]/dich-vu/thanh-toan/route.ts`)
- Khởi tạo route chuyên biệt xử lý thanh toán giỏ dịch vụ bổ sung sau đặt vé:
  - Hỗ trợ các phương thức: `vietqr`, `vnpay`, `credit_card`, `momo`, `zalopay`.
  - Khi thanh toán thành công: Chuyển trạng thái các mục hành lý và ancillaries từ `pending` sang `confirmed`/`paid`.

#### Việc 6: Bộ Test Tự Động Toàn Diện
- Mở rộng [post-booking-services.test.ts](file:///Users/user/orca/vietjet/Vietjet/vietjetsim-main/src/test/post-booking-services.test.ts): Kiểm tra upsert, update, xóa dịch vụ, kiểm tra guard trạng thái, kiểm tra tính toán tổng tiền `pendingAmount`.

---

## III. 💻 Công Cụ 2 (OpenCode): Frontend Experience, UI Polish, Payment Portal & Visual QA

> **Trọng tâm:** Hoàn thiện giao diện người dùng, đồng bộ thiết kế trực quan theo 8 ảnh thực tế, loại bỏ warning linter, xây dựng trang thanh toán dịch vụ riêng biệt và kiểm thử thị giác.

### 1. Danh Sách File Phụ Trách Độc Quyền
- `src/app/dat-ve/[id]/dich-vu/page.tsx`
- `src/app/dat-ve/[id]/dich-vu/thanh-toan/page.tsx`
- `src/features/payments/components/PaymentClient.tsx`
- `scripts/test-complete-bnpl-journey.cjs`
- `docs/qa/bnpl-journey/` (Artifacts và screenshots đối soát giao diện)

### 2. Các Đầu Việc Chi Tiết

#### Việc 1: Tối Ưu Hóa & Dọn Sạch Linter Trang Dịch Vụ (`dich-vu/page.tsx`)
- Dọn dẹp triệt để các biến/import chưa dùng (`Link`, `Icon`, `SeatDef`, `error`, `setInsurancePrice`, `ancillaryTotal`, kiểu `any`).
- Hiển thị badge thời gian giữ chỗ còn lại (Countdown timer) nếu booking đang ở trạng thái `pending`/`pending_hold` (khớp với dải vàng trên Ảnh #6).
- Đồng bộ hiển thị giỏ dịch vụ sang sidebar phải và thanh action bar đáy (`[ Quay lại ]` và `[ Đi tiếp ]`).
- Chuyển hướng nút `[ Đi tiếp ]` trực tiếp sang trang thanh toán `/dat-ve/[id]/dich-vu/thanh-toan` khi có phát sinh chi phí dịch vụ mới.

#### Việc 2: Xây Dựng Trang Thanh Toán Dịch Vụ (`dich-vu/thanh-toan/page.tsx`)
- Thiết kế giao diện thanh toán riêng cho dịch vụ bổ sung theo chuẩn thiết kế Galaxy Pay / Vietjet Air (khớp phong cách của Ảnh #8):
  - Hiển thị tóm tắt khoản tiền dịch vụ cần thanh toán (`chi tiết: Hành lý, Chỗ ngồi, Suất ăn...`).
  - Lưới phương thức thanh toán: VietQR, Thẻ ATM/Napas, Thẻ quốc tế Visa/Master, VNPay, Ví MoMo/ZaloPay.
  - Xử lý xác nhận thanh toán và cập nhật giao diện thành công.

#### Việc 3: Tinh Chỉnh Payment Client Quản Lý Đặt Chỗ (`PaymentClient.tsx`)
- Đảm bảo hiển thị đúng nhãn `Yêu cầu thanh toán trước ...` đối với vé giữ chỗ 30 phút theo chuẩn Ảnh #8.
- Đồng bộ logic chuyển tiếp giữa tra cứu "Chuyến bay của tôi" và thanh toán hóa đơn giữ chỗ.

#### Việc 4: Bộ Kịch Bản Kiểm Thử Thị Giác Visual QA (`scripts/test-complete-bnpl-journey.cjs`)
- Mở rộng script chụp ảnh toàn trình:
  - Chụp màn hình luồng dịch vụ bổ sung desktop + mobile.
  - Chụp màn hình trang thanh toán dịch vụ `/dich-vu/thanh-toan`.
  - Lưu trữ ảnh đối chiếu vào thư mục `docs/qa/bnpl-journey/` từ `01` đến `15`.

---

## IV. Ma Trận Phối Hợp & Kiểm Tra Chéo (Cross-Validation Matrix)

| Tiêu Chí Đối Soát | Công Cụ 1 (Antigravity) | Công Cụ 2 (OpenCode) |
| :--- | :--- | :--- |
| **Phân vùng mã nguồn** | `src/features/bookings/pricing.ts`, `src/lib/`, `src/app/api/` | `src/app/dat-ve/[id]/dich-vu/`, `src/features/payments/` |
| **Xung đột Git (Conflict)** | **0 file trùng lặp** | **0 file trùng lặp** |
| **Nguyên tắc định giá** | Cung cấp hàm & export `ANCILLARY_OPTIONS` | Nhận giá từ API và `pricing.ts`, không hardcode |
| **Lệnh xác thực bắt buộc** | `npm run type-check` && `npm test` | `npm run lint` && `npm run type-check` |
| **Bàn giao trung gian** | API sẵn sàng tại `/api/dat-ve/[id]/dich-vu` | Giao diện `/dat-ve/[id]/dich-vu` gọi đúng API |
| **Kiểm thử cuối cùng** | 100% unit tests pass | 100% kịch bản E2E visual pass |
