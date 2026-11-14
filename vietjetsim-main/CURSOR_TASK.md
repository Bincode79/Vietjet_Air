# BẢN PHÂN CHIA NHIỆM VỤ ĐẨY NHANH TIẾN ĐỘ DỰ ÁN (ORCA x CURSOR)

## 1. Nguyên tắc cốt lõi & Cam kết
1. **Giữ nguyên 100% giao diện trang chủ (`/trang-chu`, `/vi`, `HeroSection.tsx`)**: Không thay đổi layout hoặc xóa bỏ banner, form tìm kiếm hiện hữu.
2. **Tập trung tối đa cho Mobile**: Người dùng chủ yếu truy cập bằng smartphone (viewport chuẩn: 390×844 và 440×956).
3. **Phân chia độc lập - Không xung đột mã nguồn**:
   - **Orca (Antigravity):** Phụ trách Core API, logic thanh toán, xác thực PNR, bảo mật dữ liệu, tạo file PDF và vận hành hệ thống máy chủ VPS (`https://vietjet.shop`).
   - **Cursor Agent:** Phụ trách Giao diện UI/UX Mobile (Bước 2: Hành khách, Bước 3: Ghế & Dịch vụ, Bước 4: Thanh toán VietQR), trải nghiệm chạm vuốt và căn chỉnh CSS.

---

## 2. Phân công công việc chi tiết cho Cursor Agent (Frontend & UI Mobile)

### Nhiệm vụ C-1: Tối ưu UI Mobile Bước 2 — Nhập Thông Tin Khách Hàng (`src/features/flights/components/PassengerInfoStep.tsx`)
- **Mục tiêu:** Thao tác điền form trên điện thoại dễ dàng, không bị tràn màn hình hay che khuất bởi bàn phím ảo.
- **Yêu cầu chi tiết:**
  1. Hỗ trợ tự động viết hoa (Auto-capitalization `uppercase`) cho ô Họ và Tên đệm & Tên.
  2. Nút toggle chọn danh xưng (`Ông` / `Bà` / `Cô` / `Bé trai` / `Bé gái`) dạng nút bấm bo tròn to, dễ bấm bằng ngón tay cái.
  3. Form nhập Ngày sinh có date-picker thân thiện trên mobile.
  4. Nút bấm `Tiếp tục` màu vàng nổi bật cố định ở chân trang.

### Nhiệm vụ C-2: Tối ưu UI Mobile Bước 3 — Chọn Ghế & Dịch Vụ (`src/features/flights/components/AddonsStep.tsx`, `SeatMap.tsx`)
- **Mục tiêu:** Trực quan hóa sơ đồ máy bay Airbus A320/A321 trên màn hình dọc.
- **Yêu cầu chi tiết:**
  1. Sơ đồ ghế 3-3 hỗ trợ thu phóng và cuộn dọc mượt mà; chú thích màu ghế (Đỏ: Hàng đầu/Thoát hiểm, Vàng: Phía trước, Xanh: Tiêu chuẩn) rõ ràng.
  2. Tab Hành lý ký gửi: Thẻ chọn gói kg dạng lưới 2 cột bo góc tròn mềm mại, hiển thị giá tiền rõ ràng.

### Nhiệm vụ C-3: Tối ưu UI Mobile Bước 4 — Quét Mã VietQR & Thanh Toán (`src/app/thanh-toan/components/VietQRModal.tsx`)
- **Mục tiêu:** Màn hình chuyển khoản ngân hàng tự động 1 chạm.
- **Yêu cầu chi tiết:**
  1. Mã VietQR căn giữa, tự co giãn vừa vặn màn hình điện thoại.
  2. Nút `Tải ảnh QR về máy` và nút `Sao chép số tài khoản` / `Sao chép nội dung chuyển khoản` kèm hiệu ứng thông báo chớp nhoáng (toast).
  3. Đồng hồ đếm ngược giữ chỗ nổi bật.

---

## 3. Phân công công việc cho Orca (Backend, PDF & Vận hành VPS)

### Nhiệm vụ O-1: Bảo đảm API & Hiệu năng
- Đảm bảo 133 test suites (1181 unit test) luôn pass 100%.
- Kiểm soát xử lý đồng thời (concurrency) khi nhiều người dùng cùng khóa ghế.

### Nhiệm vụ O-2: Hệ thống xuất vé PDF & Email
- Duy trì engine PDF thuần Node.js (`src/lib/pdf/boarding-pass.ts`) với font nhúng KoHo sắc nét.
- Xử lý gửi email vé điện tử đính kèm file PDF tự động sau khi nhận webhook VietQR.

### Nhiệm vụ O-3: Triển khai & Giám sát Production VPS
- Giữ vững zero-downtime trên VPS `https://vietjet.shop` qua PM2 cluster mode.
- Cập nhật định kỳ ngay khi Cursor hoàn tất các nhánh frontend.
