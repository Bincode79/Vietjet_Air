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
- ⏭️ `src/app/trang-chu/components/HeroSection.tsx` (P0 #1) — chưa bắt đầu

## Cần chỉnh sửa (theo thứ tự ưu tiên)

### P0 — Critical (ảnh hưởng trực tiếp UX mobile)

| # | File | Vấn đề | Gợi ý fix |
|---|------|--------|-----------|
| 1 | `src/app/trang-chu/components/HeroSection.tsx` | Search form có thể overflow trên mobile | Kiểm tra `max-w-*`, padding, grid columns |
| 2 | `src/app/tim-ve/components/FlightCard.tsx` | Card flight có thể không responsive | Kiểm tra `w-full`, flex direction, font size |
| 3 | `src/app/tim-ve/components/FlightBookingResultsWrapper.tsx` | Wrapper layout | Kiểm tra container width, padding |
| 4 | `src/app/tim-ve/components/PassengerDetailModal.tsx` | Modal có thể không full width mobile | Đổi `max-w-lg` → `max-w-full sm:max-w-lg` |
| 5 | `src/app/dat-ve/[id]/dich-vu/page.tsx` | Service page layout | Kiểm tra responsive grid |
| 6 | `src/app/thanh-toan/page.tsx` | Payment page layout | Kiểm tra form width, button size |
| 7 | `src/app/tai-khoan/components/UserDashboardClient.tsx` | Dashboard layout | Kiểm tra sidebar collapse, tab scroll |

### P1 — High (admin & auth)

| # | File | Vấn đề | Gợi ý fix |
|---|------|--------|-----------|
| 8 | `src/features/admin/components/AdminDashboardClient.tsx` | Admin dashboard tabs overflow mobile | Horizontal scroll tabs, collapse sidebar |
| 9 | `src/features/auth/components/skyid/SkyIdRealAuthPage.tsx` | 2-column layout có thể không collapse | Kiểm tra `md:` breakpoints, hide right column mobile |
| 10 | `src/app/dang-nhap/page.tsx` | Login page wrapper | Kiểm tra min-height, padding |

### P2 — Medium (các trang khác)

| # | File | Vấn đề | Gợi ý fix |
|---|------|--------|-----------|
| 11 | `src/app/chuyen-bay-cua-toi/page.tsx` | Booking list layout | Card stack mobile |
| 12 | `src/app/lam-thu-tuc/page.tsx` | Check-in page | Form width, seat map |
| 13 | `src/app/lam-thu-tuc/CheckInSeatModal.tsx` | Seat modal | Full width mobile |
| 14 | `src/app/tra-cuu/page.tsx` | Lookup page | Form width |
| 15 | `src/app/vi/page.tsx` | Wallet page | Card layout |
| 16 | `src/app/hoi-dap/page.tsx` | FAQ page | Accordion width |
| 17 | `src/app/dich-vu/page.tsx` | Services page | Grid columns |
| 18 | `src/app/hanh-ly/page.tsx` | Baggage page | Content width |
| 19 | `src/app/gioi-thieu/page.tsx` | About page | Content width |
| 20 | `src/app/lien-he/page.tsx` | Contact page | Form width |

### P3 — Low (static pages)

| # | File | Vấn đề |
|---|------|--------|
| 21 | `src/app/error.tsx` | Error page layout |
| 22 | `src/app/global-error.tsx` | Global error layout |
| 23 | `src/app/trang-chu/components/DatePicker.tsx` | Date picker popup |
| 24 | `src/app/trang-chu/components/PassengerPicker.tsx` | Passenger picker popup |
| 25 | `src/app/trang-chu/components/FAQSection.tsx` | FAQ section |

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
