# Danh sách vị trí cần chỉnh sửa giao diện mobile

## Đã chỉnh sửa
- ✅ `src/features/bookings/components/SeatSelectionDrawer.tsx` — Drawer full width mobile, footer responsive, ghế nhỏ hơn
- ✅ `src/app/tim-ve/` (FlightCard, FlightBookingResultsWrapper, FlightResultsStep, layout) — Phase 1 kết quả tìm vé: date strip không cắt mép, badge trễ/hủy không bị cắt, CTA cố định + safe-area, fare grid scrollable (commit a70cedd)
- ✅ `src/app/thanh-toan/page.tsx` + gateway components (CardGatewayContent, QrGatewayContent, VietQrBox) — đã kiểm tra 375/390px: overflow 0, form width OK, button w-full, không cần sửa code
- ✅ `src/app/tai-khoan/components/UserDashboardClient.tsx` — đã có UserDashboardMobileNav (drawer) + UserDashboardDesktopSidebar (hidden lg:flex), sidebar collapse, tab scroll OK
- ✅ `src/app/chuyen-bay-cua-toi/page.tsx` — mobile form `max-w-[540px]`, SubpageHeader `mobileRed`, đã responsive cơ bản
- ✅ `src/app/lam-thu-tuc/page.tsx` — CheckInHeader, form tra cứu responsive
- ✅ `src/app/tra-cuu/page.tsx`, `src/app/hoi-dap/page.tsx`, `src/app/dich-vu/page.tsx`, `src/app/lien-he/page.tsx` — đã dùng PageHero + container `max-w-*` + grid responsive
- ✅ `src/app/hanh-ly/page.tsx` — redirect sang `/dich-vu?service=baggage`, không cần sửa riêng
- ✅ `src/features/admin/components/AdminDashboardClient.tsx` — sidebar `hidden lg:flex`, content responsive
- ✅ `src/features/auth/components/skyid/SkyIdRealAuthPage.tsx` — `md:flex-row` (2 cột desktop → 1 cột mobile), input `h-[40px]`, container `max-w-[854px]`
- ✅ `src/app/trang-chu/components/HeroSection.tsx` + `HeroBookingWidget.tsx` (P0 #1) — tabs co giãn %, DatePicker & PassengerPicker dạng bottom sheet không tràn viewport, AirportPicker bám viewport, CTA hiển thị chuẩn trên 375/390px portrait & 812x375 landscape (7/7 Playwright tests + 49 Vitest tests pass)
- ✅ `src/app/trang-chu/components/DatePicker.tsx` (P3 #23) — chuyển sang bottom sheet trên mobile (< lg), dynamic anchoring trên desktop (>= lg), fit viewport
- ✅ `src/app/lam-thu-tuc/CheckInSeatModal.tsx` (P2 #13) — modal responsive `p-2 sm:p-4`, `max-h-[90dvh]`, action buttons gọn trên mobile
- ✅ `src/app/gioi-thieu/page.tsx` (P2 #19) — padding card `p-4 sm:p-8 md:p-12`, stats grid responsive
- ✅ `src/app/chuyen-bay-cua-toi/page.tsx` (P2 #11) — form mobile `max-w-[540px]`, ô nhập 290px bám giữa, SubpageHeader chuẩn
- ✅ `src/app/lam-thu-tuc/page.tsx` (P2 #12) — CheckInHeader, form tra cứu responsive bám chuẩn
- ✅ `src/app/tra-cuu/page.tsx` (P2 #14) — PageHero, card kết quả PNR `max-w-2xl` căn giữa, route responsive
- ✅ `src/app/hoi-dap/page.tsx` (P2 #16) — padding `px-3 sm:px-4 py-8 sm:py-16`, accordion căn giữa, search bar responsive
- ✅ `src/app/dich-vu/page.tsx` (P2 #17) — grid 1 col mobile / 2 sm / 3 lg, padding `px-3 sm:px-4 py-6 sm:py-10`
- ✅ `src/app/lien-he/page.tsx` (P2 #20) — padding form `p-4 sm:p-6 md:p-8`, grid responsive
- ✅ `src/app/error.tsx` & `src/app/global-error.tsx` (P3 #21, #22) — padding `p-3 sm:p-4`, card `p-5 sm:p-8`
- ✅ `src/app/trang-chu/components/FAQSection.tsx` (P3 #25) — grid 2/3 cột responsive, không tràn ngang
- ✅ `src/app/vi/page.tsx` (P2 #15) — re-export Homepage, đồng bộ toàn bộ layout responsive mới

## ✅ Đã hoàn thành - Tất cả file đã được kiểm tra và responsive

### P0 — Critical (ảnh hưởng trực tiếp UX mobile)

| # | File | Trạng thái |
|---|------|------------|
| 1 | `src/app/trang-chu/components/HeroSection.tsx` + `src/styles/tailwind.css` | ✅ Đã fix (commit 36858ca) |
| 2 | `src/app/tim-ve/components/FlightCard.tsx` | ✅ Responsive: w-full, responsive widths, font sizes, horizontal scroll |
| 3 | `src/app/tim-ve/components/FlightBookingResultsWrapper.tsx` | ✅ Responsive: container, column layout, mobile bottom bar |
| 4 | `src/app/tim-ve/components/PassengerDetailModal.tsx` | ✅ Responsive: max-w-full sm:max-w-lg, p-2 sm:p-4 |
| 5 | `src/app/dat-ve/[id]/dich-vu/page.tsx` | ✅ Responsive: grid-cols-1 lg:grid-cols-3, max-w-5xl, px-4 sm:px-6 |
| 6 | `src/app/thanh-toan/page.tsx` + PaymentClient | ✅ Responsive: page wrapper, PaymentClient layout |
| 7 | `src/app/tai-khoan/components/UserDashboardClient.tsx` | ✅ Responsive: sidebar collapse, tab scroll |

### P1 — High (admin & auth)

| # | File | Trạng thái |
|---|------|------------|
| 8 | `src/features/admin/components/AdminDashboardClient.tsx` | ✅ Responsive: sidebar hidden lg:flex, tabs flex |
| 9 | `src/features/auth/components/skyid/SkyIdRealAuthPage.tsx` | ✅ Responsive: md:flex-row, max-w-[854px], input h-[40px] |
| 10 | `src/app/dang-nhap/page.tsx` | ✅ Responsive: wrapper của SkyIdRealAuthPage |

### P2 — Medium (các trang khác)

| # | File | Trạng thái |
|---|------|------------|
| 11 | `src/app/chuyen-bay-cua-toi/page.tsx` | ✅ Responsive: form max-w-[540px], SubpageHeader |
| 12 | `src/app/lam-thu-tuc/page.tsx` | ✅ Responsive: CheckInHeader, form responsive |
| 13 | `src/app/lam-thu-tuc/CheckInSeatModal.tsx` | ✅ Responsive: p-2 sm:p-4, max-h-[90dvh] |
| 14 | `src/app/tra-cuu/page.tsx` | ✅ Responsive: PageHero, card max-w-2xl |
| 15 | `src/app/vi/page.tsx` | ✅ Responsive: re-export Homepage (đồng bộ layout) |
| 16 | `src/app/hoi-dap/page.tsx` | ✅ Responsive: padding, accordion căn giữa |
| 17 | `src/app/dich-vu/page.tsx` | ✅ Responsive: grid 1/2/3 cols, padding |
| 18 | `src/app/hanh-ly/page.tsx` | ✅ Responsive: redirect sang /dich-vu |
| 19 | `src/app/gioi-thieu/page.tsx` | ✅ Responsive: padding card, stats grid |
| 20 | `src/app/lien-he/page.tsx` | ✅ Responsive: padding form, grid |

### P3 — Low (static pages)

| # | File | Trạng thái |
|---|------|------------|
| 21 | `src/app/error.tsx` | ✅ Responsive: p-3 sm:p-4, card p-5 sm:p-8, flex-col sm:flex-row |
| 22 | `src/app/global-error.tsx` | ✅ Responsive: p-3 sm:p-4, card p-5 sm:p-8, flex-col sm:flex-row |
| 23 | `src/app/trang-chu/components/DatePicker.tsx` | ✅ Responsive: bottom sheet mobile, dynamic anchoring desktop |
| 24 | `src/app/trang-chu/components/PassengerPicker.tsx` | ✅ Responsive: bottom sheet mobile, dropdown desktop |
| 25 | `src/app/trang-chu/components/FAQSection.tsx` | ✅ Responsive: grid 2/3 cols |

### Các pattern cần kiểm tra trên mỗi file

1. **Container width**: `max-w-*` → thêm `max-w-full sm:max-w-*`
2. **Padding**: `p-4` hoặc `px-4` → thêm `p-2 sm:p-4` hoặc `px-2 sm:px-4`
3. **Font size**: `text-lg` → thêm `text-sm sm:text-lg`
4. **Grid columns**: `grid-cols-3` → thêm `grid-cols-1 sm:grid-cols-3`
5. **Flex direction**: `flex` → thêm `flex-col sm:flex-row`
6. **Modal/Drawer**: `max-w-md` → thêm `max-w-full sm:max-w-md`
7. **Table**: kiểm tra horizontal scroll trên mobile
8. **Form inputs**: kiểm tra width, padding, font size
9. **Buttons**: kiểm tra padding, font size, full-width trên mobile
10. **Images**: kiểm tra `w-full h-auto` hoặc `object-contain`

### Cách thực hiện

1. Mở mỗi file, tìm các class Tailwind có fixed width/padding/font
2. Thêm responsive prefix (`sm:`, `md:`) cho mobile-first
3. Test trên Chrome DevTools mobile view (iPhone SE 375px, iPhone 14 390px)
4. Chạy Playwright với viewport mobile (375x667)

### Lệnh test mobile

```bash
# Chạy Playwright với mobile viewport
npx playwright test --project=chromium --grep "mobile" 2>&1 | tail -20

# Hoặc dùng Chrome DevTools
# F12 → Toggle device toolbar → iPhone SE (375x667)
```
