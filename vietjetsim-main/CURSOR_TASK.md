# NHIỆM VỤ ĐIỀU PHỐI CURSOR AGENT: HOÀN THIỆN GIAO DIỆN MOBILE CHUẨN 1:1 VIETJET AIR

## 1. Mục tiêu
Thực hiện đồng bộ 100% giao diện Mobile cho trang Tìm vé / Lựa chọn chuyến bay (`/tim-ve`) theo đúng chuẩn thiết kế của Vietjet Air trên điện thoại (độ phân giải Responsive 472×915 và 390×844), khắc phục triệt để lỗi bị tường lửa WAF của trang web thật chặn.

---

## 2. Đường dẫn kiểm tra nội bộ (Localhost Preview)
Không mở trực tiếp `newweb.vietjetair.com/vi/select-flight` vì cơ chế AWS WAF 403 và thiếu session.
Hãy sử dụng đường dẫn kiểm tra nội bộ đã tích hợp sẵn dữ liệu chuẩn:
```text
http://localhost:4028/tim-ve?from=HAN&to=SGN&depart=2026-11-16&return=2026-11-22&currency=VND&adult=1
```

---

## 3. Danh sách các hạng mục cần chỉnh sửa mã nguồn

### Hạng mục 1: Băng vàng phụ dưới Header (`src/app/tim-ve/components/FlightBookingResultsWrapper.tsx`)
1. **Tràn viền màn hình (Full-bleed):** Băng vàng (`#FFC700` hoặc gradient vàng Vietjet) chiếm 100% chiều ngang màn hình mobile, dính sát dưới Header đỏ.
2. **Cụm bên trái:** Nút Pill bo tròn nền trắng:
   - Chữ "Tổng" màu xám đậm.
   - Số tiền "0 VND" màu đỏ đậm `#C4121A` in đậm (font-bold).
   - Biểu tượng mũi tên nhỏ chỉ xuống `▼`.
   - Sự kiện bấm: mở modal chi tiết đặt chỗ (`setShowSummaryModal(true)`).
3. **Cụm bên phải:** 4 vòng tròn bước đặt vé:
   - Bước 1 (Chọn chuyến): Nền xanh lá `#43B02A`, icon máy bay trắng xoay 45°.
   - Bước 2, 3, 4: Nền trắng viền vàng hoặc nền vàng cam với icon hành khách, giỏ hàng, dấu $.

---

### Hạng mục 2: Khung ngày bay hình đám mây (`src/features/flights/components/FlightResultsStep.tsx`)
1. **Ngày đang chọn (Active):**
   - Tạo hình **Huy hiệu Đám mây vàng (Scalloped Cloud Badge)** viền đỏ cam mềm mại.
   - Bên trong gồm: Thứ (ví dụ: `Thứ hai`), Ngày tháng (`7 tháng 12`), Giá khởi điểm (`Từ 890 000 VND` với số tiền in đậm đỏ/cam).
2. **Các ngày còn lại (Inactive):**
   - Khung thẻ trắng bo góc tinh tế.
   - Thu nhỏ kích thước trên mobile để hiển thị vừa vặn 3 ngày liền kề cùng 2 nút mũi tên tròn `<` và `>` hai bên mà không làm vỡ khung màn hình.

---

### Hạng mục 3: Bảng danh sách chuyến bay 5 cột (`src/features/flights/components/FlightResultsStep.tsx`)
1. **Hàng Header 4 hạng vé:**
   - 4 cột gắn liền: BUSINESS (nâu olive `#8E7022`), SkyBoss (đỏ `#C4121A`), Deluxe (cam `#F58220`), Eco (xanh lá `#43B02A`).
   - Sử dụng logo SVG chính thức từ thư mục: `/images/fare-classes/*.svg`.
2. **Cột thông tin chuyến bay bên trái:**
   - Nền vàng gradient tươi sáng, hiển thị mã hiệu chuyến bay (ví dụ: `VJ134`), giờ đi và đến (`05:00 Đến 07:10`), thông tin tàu bay (`Airbus A321 - Bay thẳng`) và mũi tên chỉ xuống `v`.
3. **4 Cột giá vé bên phải:**
   - Xóa bỏ các pill nhãn chữ lặp lại ("BUSINESS", "SKYBOSS") bên trong từng ô giá trên mobile.
   - Ô có vé: Số tiền hàng trên in đậm rõ nét (ví dụ: `1.790`), hàng dưới hiển thị đơn vị nghiêng màu xám (*`000 VND`*), kèm mũi tên trỏ xuống `v`.
   - Ô hết vé: Icon máy bay gạch chéo trong vòng tròn + dòng chữ xám `Hết chỗ`.

---

### Hạng mục 4: Nút "Đi tiếp" nổi ở chân trang
- Nút bấm bo tròn màu vàng đậm (`#FFC700` đến `#FFB800`), đổ bóng nhẹ `shadow-lg`, nằm cố định chính giữa đáy màn hình cách mép dưới 20px.
- Chữ `Đi tiếp` màu đen in đậm rõ ràng.

---

### Hạng mục 5: Nền trời mây và dải lượn sóng Vietjet
- Nền trang màu xanh da trời nhạt với các cụm mây trắng mờ.
- Chân trang có dải lượn sóng 3 màu thương hiệu: Đỏ - Vàng - Xanh lá.

---

## 4. Kiểm tra và xác nhận (Verification)
1. Chạy lệnh kiểm tra TypeScript:
   ```bash
   npm run type-check
   ```
2. Mở trình duyệt nội bộ của Cursor tại `http://localhost:4028/tim-ve?...` ở kích thước `472×915` để kiểm tra độ hoàn thiện 1:1.
