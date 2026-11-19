# Kế hoạch dịch vụ bổ sung sau đặt vé (`/dat-ve/[id]/dich-vu`)

Ngày lập: 2026-11-19
Phạm vi: trang chọn ghế / hành lý / ăn / bảo hiểm / taxi sau khi đặt vé,
API `POST/GET /api/dat-ve/[id]/dich-vu` nhánh `body.services`, và đường
thanh toán phần dịch vụ (`dich-vu/thanh-toan`).

## 1. Bối cảnh và phát hiện

Tính năng đang được triển khai dở trên working tree (chưa commit):

- `src/lib/db.ts` thêm 4 hàm cuối file: `upsertBookingAncillary`,
  `removeBookingAncillary`, `getBookingAncillaries`,
  `updateBookingTotalAmount` (bảng `booking_ancillaries` đã có từ
  migration `029`).
- `src/app/api/dat-ve/[id]/dich-vu/route.ts` thêm nhánh `body.services`
  gọi các hàm trên cùng `setPassengerSeatNumber`, `addBookingBaggage`,
  `getBookingBaggage`, `getPendingBaggageAmount`; GET trả thêm
  `ancillaries`.
- `src/app/dat-ve/[id]/dich-vu/page.tsx` đang được viết (từng lỗi
  `TS1128` do file sửa dở).

Các vấn đề đã đo được trong code hiện tại:

1. **`updateBookingTotalAmount` ghi sai cột.** `bookings` có
   `total_price` (migration `000`), không có `total_amount`. Hàm này
   hiện chưa có caller — hoặc sửa cột, hoặc bỏ hẳn.
2. **Giá hardcode trong route, lệch `pricing.ts`.** Nhánh `services`
   ghi `insurance = 44000`, `meal = 85000`, `taxi = 150000`, trong khi
   `ANCILLARY_OPTIONS` định nghĩa `insurance = 60000`,
   `meal = 100000`, và `taxi` không nằm trong catalog. Chính comment
   của route nói "Giá luôn do SERVER tính lại từ `pricing.ts`" — code
   mới vi phạm nguyên tắc đó.
3. **Nhánh `services` chạy trước guard trạng thái.** Hiện nó return sớm
   trước check `status === 'confirmed' | 'completed'`, nghĩa là booking
   `cancelled`/`refunded` cũng sửa được dịch vụ. Cần chính sách trạng
   thái rõ ràng (đề xuất: `pending` đang giữ chỗ + `confirmed` +
   `completed`; chặn `cancelled`/`refunded`).
4. **`neon.ts` mock chưa hỗ trợ.** Mock chỉ xử lý `booking_ancillaries`
   bên trong CTE tạo booking; các câu `INSERT ... ON CONFLICT`,
   `DELETE ... RETURNING`, `SELECT` đơn lẻ sẽ rơi vào fallback → dev
   local và toàn bộ vitest chạy sai.
5. **Contract remove không đối xứng.** `insurance` là boolean
   (toggle được), `meal`/`taxi` chỉ thêm không gỡ, `seat` chỉ set.
   Client không biết gửi gì để bỏ món ăn/xe.
6. **`pendingAmount` chưa tính ancillaries.** `getPendingBaggageAmount`
   chỉ cộng hành lý; nếu trang thanh toán dịch vụ dùng con số này thì
   khách trả thiếu phần ăn/bảo hiểm/xe.
7. `page.tsx` còn lỗi cú pháp tạm thời (`TS1128` tại dòng ~1112) — cần
   hoàn thiện hoặc revert phần chưa xong.

## 2. Mục tiêu

1. Khách chọn được dịch vụ bổ sung trên `/dat-ve/[id]/dich-vu` cho cả
   booking giữ chỗ (`pending`) lẫn đã thanh toán (`confirmed`), và số
   tiền phải thu phản ánh đúng mọi dịch vụ đã chọn.
2. Giá dịch vụ chỉ đến từ `pricing.ts` — route không chứa con số giá.
3. Mock `neon.ts` xử lý đúng các câu SQL mới để unit test và dev local
   chạy được.
4. Không regression: luồng mua hành lý cũ (`package_id` không kèm
   `services`) giữ nguyên hành vi.

## 3. Kế hoạch thực hiện

### Giai đoạn A — Data layer (`src/lib/db.ts`, `src/lib/neon.ts`)

1. Sửa hoặc xoá `updateBookingTotalAmount`: nếu trang dịch vụ cần cập
   nhật tổng thì ghi `total_price`, và cân nhắc gộp vào một hàm
   `recalcBookingTotal` duy nhất thay vì để caller tự cộng.
2. Mock `neon.ts`: thêm nhánh cho
   - `insert into booking_ancillaries ... on conflict` → upsert vào
     mảng mock, trả row;
   - `delete from booking_ancillaries` → xoá và trả `id` nếu có;
   - `from booking_ancillaries where booking_id` → lọc theo booking;
   - `update bookings set total_price` (nếu giữ hàm total).
   Kiểm tra mock `bookings`/`booking_baggage` đã có sẵn pattern tương
   tự để bắt chước.
3. Bổ sung unit test cho 3 hàm ancillary qua mock (upsert → get →
   remove → get rỗng; upsert lần hai update chứ không nhân đôi —
   `UNIQUE (booking_id, option_id)`).

### Giai đoạn B — API route

1. Đưa check trạng thái lên trước mọi mutation: cho phép `pending`
   (giữ chỗ MOVI/ngân hàng), `confirmed`, `completed`; từ chối
   `cancelled`, `refunded` với 409 + message tiếng Việt.
2. Đưa giá về `pricing.ts`: mở rộng `ANCILLARY_OPTIONS` (thêm `taxi`
   nếu nghiệp vụ cần, hoặc bỏ `taxi` khỏi route nếu không bán) và đọc
   `option.price` thay vì literal. Sửa luôn lệch giá insurance/meal.
3. Chuẩn hoá contract remove: mọi option nhận `true/false`
   (insurance/meal/taxi) hoặc `null` để gỡ; seat nhận `null`/`''` để bỏ
   chọn. Document ngay trên route.
4. Sau khi áp dụng `services`, tính lại số tiền phải thu gồm
   `getPendingBaggageAmount` + tổng `booking_ancillaries` chưa thanh
   toán, trả trong response (`pendingAmount` mới) — không để client tự
   cộng.
5. Kiểm tra `dich-vu/thanh-toan/route.ts`: nó phải đọc cùng nguồn
   (baggage pending + ancillaries) khi tạo payment, tránh thu khác
   nhau giữa hai endpoint.

### Giai đoạn C — UI (`dich-vu/page.tsx`)

1. Hoàn thiện trang: danh sách hành khách → chọn ghế (dùng
   `SeatMap`/`ghe/khoa` hiện có), gói hành lý, toggle bảo hiểm/ăn/xe,
   tổng tiền cập nhật từ response server (không tính phía client).
2. Xử lý trạng thái: booking `pending` hiển thị cảnh báo giữ chỗ còn
   bao lâu (nếu `hold_expires_at`), `cancelled`/`refunded` read-only.
3. Nối nút thanh toán sang `dich-vu/thanh-toan` với đúng số tiền server
   trả.
4. Sửa các warning lint có sẵn trên file (unused `Link`, `Icon`,
   `SeatDef`, `error`, `setInsurancePrice`, `ancillaryTotal`, `any`).

### Giai đoạn D — Kiểm thử và QA

1. `npm run type-check`, `npm run lint`, `npm test` (ít nhất các file
   test booking/payment/dich-vu), `npm run build`.
2. `npm run test:migrations` không cần migration mới — nhưng xác nhận
   `booking_ancillaries` đã nằm trong `OPERATING_TABLES_SQL` của
   `test-migrations.cjs` (nếu chưa thì bổ sung canary).
3. Script QA `scripts/` chụp màn hình `/dat-ve/[id]/dich-vu` desktop +
   mobile vào `docs/qa/` theo pattern `bnpl-journey`.

## 4. Tiêu chí đạt

- `type-check`/`lint`/`build` sạch; unit test mới pass; `test:migrations`
  4/4 pass.
- Trên mock: chọn insurance + meal + taxi → GET trả đúng 3 dòng
  `booking_ancillaries`; bỏ insurance → còn 2; `pendingAmount` tăng
  đúng tổng.
- Booking `cancelled` gọi `POST services` → 409, không ghi gì.
- Giá hiển thị và giá lưu DB trùng `pricing.ts`, không literal trong
  route.
- Trang dịch vụ thao tác được end-to-end trên dev server và ảnh QA lưu
  vào `docs/qa/`.

## 5. Rủi ro / lưu ý

- Tiến trình khác đang sửa cùng file (`db.ts`, `route.ts`,
  `page.tsx`): cần chốt ai là owner trước khi viết, tránh ghi đè.
- `booking_ancillaries.option_id` là TEXT tự do — nếu mở rộng catalog
  phải kiểm soát giá trị hợp lệ ở route, không tin client.
- `seats`/ghế theo hành khách (migration `046`) đã có luồng riêng qua
  `/api/dat-ve/[id]/ghe`; tránh hai đường ghi `passengers.seat_number`
  lệch nhau — route `services` nên tái dùng đúng hàm
  `setPassengerSeatNumber` và cùng rule kiểm tra ghế trống.
- `hold_expires_at` sweep (lazy, trong `db.ts`) sẽ hủy booking `pending`
  quá hạn — dịch vụ chọn trên booking sắp hết hạn phải phản ánh đúng
  trạng thái sau sweep.
