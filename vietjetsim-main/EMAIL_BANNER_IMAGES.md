# Email Banner Images

Các file ảnh banner cần được thêm vào thư mục `public/` để hệ thống email hoạt động đúng:

## Bắt buộc cần có:

1. **`public/email-banner-success.jpg`** (180px height)
   - Banner cho email thanh toán thành công
   - Nên có hình ảnh máy bay, bầu trời xanh, hoặc hành khách vui vẻ
   - Kích thước khuyến nghị: 640x180px

2. **`public/email-banner-payment.jpg`** (160px height)
   - Banner cho email hướng dẫn thanh toán
   - Nên có hình ảnh QR code, thanh toán, hoặc vé máy bay
   - Kích thước khuyến nghị: 640x160px

3. **`public/email-banner-delay.jpg`** (140px height)
   - Banner cho email thông báo delay chuyến bay
   - Nên có hình ảnh sân bay, bảng thông tin, hoặc máy bay đợi
   - Kích thước khuyến nghị: 640x140px

4. **`public/email-banner-generic.jpg`** (150px height)
   - Banner cho email chung (OTP, password reset, v.v.)
   - Nên có hình ảnh logo Vietjet hoặc travel imagery
   - Kích thước khuyến nghị: 640x150px

## Style guidelines:

- Sử dụng màu sắc thương hiệu Vietjet: Đỏ (#E52620), Vàng (#FFD700)
- Bright, friendly travel imagery
- High contrast để hiển thị tốt trên các email client
- JPG format với chất lượng cao (80-90%)
- Không có text quan trọng trên ảnh (vì một số email client block images)

## Tạm thời:

Nếu chưa có ảnh thực tế, có thể sử dụng placeholder hoặc comment dòng bannerImage() trong các hàm build email.
