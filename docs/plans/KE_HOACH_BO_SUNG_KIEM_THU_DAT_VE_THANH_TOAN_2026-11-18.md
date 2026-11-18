# Kế hoạch bổ sung kiểm thử đặt vé và thanh toán

Ngày lập: 2026-11-18  
Phạm vi: luồng khứ hồi từ chọn chuyến bay đến thanh toán VietQR trên ứng dụng Vietjet Air mô phỏng.

## 1. Bối cảnh và phát hiện

Lượt chạy `scripts/e2e-roundtrip-test.cjs` trên dev server cổng 4028 đã chọn
được hai chặng và hiển thị tổng tiền `3.143.162 VND`. Tuy nhiên, kịch bản không
tạo được booking nên không thể kiểm tra thanh toán thực:

- Form hành khách yêu cầu `CCCD / Hộ chiếu`, nhưng script chưa điền trường này.
- Script gọi `requestSubmit()` rồi tiếp tục ngay cả khi form bị browser chặn bởi
  validation; URL vẫn là `/tim-ve` thay vì `/thanh-toan?bookingId=...`.
- Các bước sau vẫn được ghi là `OK`, kể cả khi `createdBookingId` là `null` và
  ảnh mobile hiển thị “Chưa có đơn đặt vé để thanh toán”.
- Test tích hợp hiện hành đã pass 142/142, nhưng dùng mock database vì không có
  `DATABASE_URL`; do đó chưa chứng minh transaction với Postgres thật.

## 2. Mục tiêu

1. Làm cho kịch bản E2E thất bại chính xác khi không tạo được booking hoặc khi
   không vào được trang thanh toán có `bookingId`.
2. Hoàn tất luồng khách vãng lai khứ hồi với dữ liệu hành khách hợp lệ.
3. Xác minh thanh toán VietQR: tạo QR, khởi tạo payment, webhook hợp lệ, trạng
   thái hoàn tất và tính idempotency khi nhận webhook lần hai.
4. Chạy lại luồng trên Postgres tạm/cục bộ, không dùng Neon production.

## 3. Kế hoạch thực hiện

### Giai đoạn A — Sửa độ tin cậy của script E2E

1. Cập nhật `scripts/e2e-roundtrip-test.cjs` để điền toàn bộ trường bắt buộc
   của `PassengerInfoStep`: danh xưng/giới tính, họ tên, ngày sinh đúng định
   dạng input, số điện thoại, email, `idNumber` (CCCD/Hộ chiếu) và điều khoản.
2. Dùng selector ổn định (`id`, `name`, `data-testid`) cho từng trường; không
   chọn phần tử bằng nội dung bao quát toàn trang.
3. Sau submit, chờ một trong hai điều kiện rõ ràng:
   - URL khớp `/thanh-toan?bookingId=<id>`; hoặc
   - thông báo validation/lỗi API xuất hiện, sau đó kết thúc với exit code khác 0.
4. Chỉ tạo screenshot “payment” khi `bookingId` tồn tại và trang chứa thông tin
   booking hoặc phương thức thanh toán. Ghi kết quả `failed` cho mọi bước không
   thỏa điều kiện.
5. Kiểm tra `report.json` trước khi kết thúc: không có lỗi console ngoài danh
   sách cho phép, desktop/mobile đều có booking ID và tổng tiền dương.

Tiêu chí đạt: script trả exit code 0 chỉ khi tạo booking thành công và cả hai
ảnh payment đều là trang thanh toán của booking vừa tạo.

### Giai đoạn B — Bổ sung test tự động chống hồi quy

1. Bổ sung test component/form cho `PassengerInfoStep`:
   - thiếu `idNumber` không được chuyển bước;
   - dữ liệu hợp lệ gửi payload có `idNumber`;
   - lỗi validation hiển thị và giữ nguyên bước hiện tại.
2. Bổ sung test E2E mức browser cho khứ hồi:
   - chọn chiều đi, tự chuyển chiều về, chọn chiều về;
   - tổng tiền lớn hơn 0 và bằng tổng hai chặng cộng phí;
   - hoàn tất form dẫn tới URL chứa `bookingId`.
3. Siết test API đặt vé/thanh toán:
   - server tự tính giá, không tin `total_price` từ client;
   - tạo payment có amount đúng booking;
   - webhook có chữ ký hợp lệ xác nhận booking đúng một lần;
   - webhook sai chữ ký, sai số tiền hoặc replay bị từ chối/không làm thay đổi
     số dư, vé và điểm lần thứ hai.

Tiêu chí đạt: test mới fail trên phiên bản script cũ và pass sau khi sửa; mọi
assertion kiểm tra trạng thái cụ thể thay vì chấp nhận một danh sách status
rộng như `200 | 404 | 503`.

### Giai đoạn C — Xác minh Postgres thật trong môi trường cách ly

1. Khởi động Docker và dùng Postgres 16 cho `npm run test:migrations`.
2. Tạo database test tạm, apply migrations theo thứ tự và seed dữ liệu chuyến
   bay cho ngày kịch bản.
3. Chạy dev/standalone server với `DATABASE_URL` trỏ database test, cùng secret
   JWT/VietQR test riêng.
4. Chạy `npm run test:wallet-e2e`, kịch bản E2E khứ hồi và test webhook trên
   server này. Không dùng `DATABASE_URL` production và không gửi email thật.
5. Dọn booking test bằng mã PNR xác định sau mỗi lượt; xác nhận các bản ghi
   payment, seat lock, loyalty transaction và email mock đã được xử lý đúng.

Tiêu chí đạt: migrations pass, booking/payment xuất hiện nhất quán trong DB
test, webhook replay không tạo thêm payment/điểm/vé.

## 4. Thứ tự ưu tiên

Ưu tiên 1: Giai đoạn A. Hiện script cho kết quả dương tính giả nên không thể
dùng làm cổng chất lượng.

Ưu tiên 2: Giai đoạn C. Đây là điều kiện để xác nhận transaction thật và các
ràng buộc dữ liệu.

Ưu tiên 3: Giai đoạn B. Bổ sung regression coverage sau khi selector và hành
vi được chốt.

## 5. Rủi ro và biện pháp

- Dữ liệu chuyến bay theo ngày có thể không tồn tại: seed lịch bay theo ngày
  hiện tại trong DB test thay vì cố định ngày trong script.
- Kịch bản guest tạo dữ liệu: dùng tiền tố PNR test cố định/nhận diện được và
  cleanup có kiểm soát, không xóa theo pattern rộng.
- Email/webhook có thể gây side effect: inject mailer giả và dùng secret/chữ ký
  test; tuyệt đối không gọi nhà cung cấp thanh toán hoặc email thật.
- Selector giao diện dễ vỡ: ưu tiên `data-testid`/`id` ở điểm chuyển trạng thái
  trọng yếu, tránh truy vấn bằng toàn bộ `innerText`.

## 6. Bằng chứng cần bàn giao

- Log lệnh test, exit code và số lượng pass/fail.
- `report.json` E2E có `bookingId`, URL payment và tổng tiền cho desktop/mobile.
- Ảnh trước/sau thanh toán không chứa thông báo “Chưa có đơn đặt vé để thanh toán”.
- Bản ghi DB test chứng minh booking, payment, vé điện tử và replay webhook.

## 7. Trạng thái thực hiện (2026-11-18)

| Giai đoạn | Trạng thái | Bằng chứng |
|---|---|---|
| A — Độ tin cậy script E2E | ✅ Hoàn tất | `scripts/e2e-roundtrip-test.cjs` điền `idNumber`, chờ URL `/thanh-toan?bookingId=…`, chỉ ghi `OK` khi có booking; exit code 0 chỉ khi cả desktop và mobile tạo được booking. `docs/qa/e2e-roundtrip/report.json`: desktop `2bb2054e-ef64-4d7a-8112-6c67bed97dea` (1.980.000₫), mobile `db8ce746-6f8f-4937-afa5-75b0b327fa44` (3.143.162₫), `overall.passed = true`. |
| B — Test chống hồi quy | ✅ Hoàn tất | `src/test/payment-and-webhook.test.ts` (8 ca: giá server, fare class, `idNumber`, số tiền payment, double-charge, 404, thiếu amount), `src/test/payment-gateway-pages.test.tsx` (10 ca, gồm 409 đã thanh toán), `src/test/payment-gateway-wallet.test.tsx` (3 ca), `src/test/admin-revenue-report-route.test.ts` (6 ca, gồm ngày không tồn tại), `src/test/revenue-report-pdf.test.ts` (1 ca: PDF nhiều trang, không rỗng). Chữ ký/replay webhook do `src/test/vietqr-webhook.test.ts` phủ. |
| C — Postgres thật | ⛔ Bị chặn | Máy hiện tại không có Docker, `pg_ctl`, `postgres`, `initdb`. `npm run test:migrations` và `npm run test:wallet-e2e` chưa chạy được; xem §7.3. |

### 7.1. Lỗi thật phát hiện thêm và đã sửa

1. **Cổng thanh toán hiển thị booking giả.** `thanh-toan/gateway/[method]` từng
   hard-code PNR `VJ8899`, chuyến `VJ3018`, `1.980.000₫` khi không tải được đơn.
   Nay trang chỉ đọc `/api/dat-ve/[id]`; thiếu `bookingId`, lỗi tải hoặc đơn đã
   thanh toán đều có trạng thái riêng, không còn số liệu bịa.
2. **Trang kết quả luôn tuyên bố “Thanh toán thành công”.** `thanh-cong` khởi tạo
   state bằng booking giả và không đọc trạng thái thật. Nay trang rẽ theo
   `status` của đơn: `confirmed/completed` → thành công, `pending` → chờ thanh
   toán (kèm nút thanh toán tiếp), `cancelled/refunded` → đã huỷ/hoàn tiền,
   không tìm thấy → thông báo tra cứu.
3. **Cổng thẻ/Napas/ví/MOVI/ví Vietjet không ghi nhận thanh toán.** Các nút chỉ
   chuyển trang. Nay mỗi cổng gọi `createPayment` (`card`, `e_wallet`, `movi`,
   `wallet`) trước khi điều hướng; lỗi API hiện banner và giữ nguyên trang. Cổng
   QR vẫn chờ webhook xác nhận.
4. **Cổng Ví Vietjet in cứng “Số dư ví khả dụng 5.000.000₫”.** Nay đọc
   `getWalletOverview()` (`/api/vi`); số dư thật quyết định nút thanh toán, khách
   chưa đăng nhập thấy lời mời đăng nhập thay vì số dư giả.
5. **`GET /api/quan-tri/bao-cao/doanh-thu` hỏng khi thiếu tham số.** Redirect cũ
   ghép `&from=` vào URL không có query string, tạo path 404 đúng ở nút “Xuất báo
   cáo”. Nay mặc định 7 ngày gần nhất theo `Asia/Ho_Chi_Minh`, kiểm tra cả hình
   dạng `YYYY-MM-DD` lẫn ngày có thật (400 nếu sai) và `from <= to` rồi trả PDF.
6. **Nút xuất báo cáo chưa tồn tại.** `exporting`/`exportRevenueReportPdf` trong
   `OverviewTab` là code chết. Nay có nút “Xuất báo cáo” tải PDF qua
   `exportRevenueReportPdf`, báo toast thành công/thất bại; `OverviewTab` tự
   render `ToastContainer` vì `useToast` sở hữu state riêng (container của
   `AdminDashboardClient` không thấy toast của tab này). Lỗi API được đọc từ
   JSON `message` thay vì in nguyên body vào toast.
7. **Script QA cổng thanh toán tự chấm điểm sai.** Bước 8 cũ chấp nhận bất kỳ
   trang nào có chữ “Mã đặt chỗ”, nên trang giả vẫn `OK`; `testBookingId` bị
   hard-code. Nay script nhận `TEST_BOOKING_ID` (UUID hoặc PNR), ghi `bookingId`
   vào report, phân loại trạng thái thật (`confirmed`/`pending`/`not-found`), và
   fail nếu trang kết quả còn in PNR giả `VJ8899` hoặc không mở đúng PNR/UUID đã
   truyền vào. `VJ3018` không được dùng làm dấu hiệu giả vì đó là số hiệu chuyến
   bay thật (SGN–HAN) trong dữ liệu seed.
8. **Bấm thanh toán lần hai báo lỗi dù tiền đã trừ.** `POST /api/thanh-toan`
   trả `409` khi đơn đã `confirmed`; cổng cũ hiển thị banner đỏ “Thanh toán
   chưa hoàn tất” và giữ khách ở lại cổng, dù đơn đã thanh toán. Nay `409` được
   coi là thành công và chuyển thẳng sang trang kết quả (nơi hiển thị PNR/vé
   thật); test `payment-gateway-pages.test.tsx` phủ trường hợp này.
9. **PDF báo cáo doanh thu có thể rỗng hoặc mất dòng.** `buildRevenueReportPdf`
   ghép `chunks` ngay sau `doc.end()`; với font TTF nhúng, pdfkit phát chunk ở
   tick sau nên route từng trả file 0 byte (vẫn HTTP 200), và bảng ngày dài hơn
   một trang bị vẽ ra ngoài khung giấy vì `text` toạ độ tuyệt đối không tự ngắt
   trang. Nay hàm chờ sự kiện `end` và ngắt trang chủ động (kèm footer đánh số);
   `src/test/revenue-report-pdf.test.ts` khoá cả hai.

### 7.2. Kiểm chứng đã chạy

| Lệnh | Kết quả |
|---|---|
| `npx tsc --noEmit` | ✅ 0 lỗi |
| `npx eslint .` | ✅ 0 error (chỉ còn warning có sẵn) |
| `npx vitest run` | ✅ **163 file / 1284 test pass** (exit 0) |
| `node scripts/verify-payment-gateways.cjs` | ✅ `TEST_BOOKING_ID=7YJMH0` → 8/8 bước `OK`, `overall.passed = true`; ảnh + `docs/qa/payment-gateways/report.json` (ghi `bookingId`, `resultState = pending`, `fakePnrGone = true`, `showsOpenedPnr = true`) |

### 7.3. Giai đoạn C — việc còn lại khi có Docker/Postgres

```bash
docker info                                   # phải có Docker daemon
npm run test:migrations                       # 4 lượt replay trên postgres:16-alpine
docker run -d -p 5432:5432 -e POSTGRES_USER=app -e POSTGRES_PASSWORD=pw \
  -e POSTGRES_DB=app postgres:17-alpine
for f in migrations/*.sql; do psql "$DATABASE_URL" -f "$f"; done
npm run db:bridge &
DATABASE_URL=postgresql://app:pw@localhost:5432/app \
  NEON_FETCH_ENDPOINT=http://localhost:4444/sql npm run dev
npm run test:wallet-e2e
TEST_BOOKING_ID=<PNR|uuid> node scripts/verify-payment-gateways.cjs
```

Tiêu chí đạt giữ nguyên như §3: migration replay sạch, booking/payment nhất quán
trong DB test, webhook replay không tạo thêm payment/điểm/vé.

