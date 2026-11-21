# Kế hoạch kiểm tra toàn bộ giao diện dự án VietjetSim

## Tổng quan

Dự án có **23 trang** (page.tsx) và **3 spec E2E**. Kế hoạch này đảm bảo kiểm tra đồng bộ tất cả giao diện, API và luồng người dùng.

---

## Nhóm 1: Public pages (không cần đăng nhập)

### 1.1 Trang chủ (`/trang-chu`)
- [ ] Hero banner + search form (from/to/date/passengers)
- [ ] Featured flights, promotions
- [ ] Footer links

### 1.2 Tìm vé (`/tim-ve`)
- [ ] Form tìm kiếm chuyến bay (from/to/date/passengers/cabin)
- [ ] Kết quả tìm kiếm (flight list với giá, giờ, hãng)
- [ ] Filter/sort (giá, giờ, duration)
- [ ] Responsive mobile

### 1.3 Dịch vụ (`/dich-vu`)
- [ ] Danh sách dịch vụ (hành lý, chỗ ngồi, bữa ăn)
- [ ] Giá dịch vụ

### 1.4 Hành lý (`/hanh-ly`)
- [ ] Thông tin hành lý ký gửi/xách tay
- [ ] Quy định kích thước/trọng lượng

### 1.5 Giới thiệu (`/gioi-thieu`)
- [ ] Nội dung giới thiệu công ty

### 1.6 Liên hệ (`/lien-he`)
- [ ] Form liên hệ
- [ ] Thông tin liên lạc

### 1.7 Hỏi đáp (`/hoi-dap`)
- [ ] FAQ accordion
- [ ] Tìm kiếm câu hỏi

### 1.8 Tra cứu (`/tra-cuu`)
- [ ] Tra cứu đặt chỗ (PNR lookup)
- [ ] Hiển thị chi tiết booking

---

## Nhóm 2: Auth pages

### 2.1 Đăng nhập (`/dang-nhap`)
- [ ] SkyID 2-column layout
- [ ] Phone/email toggle
- [ ] Country code picker
- [ ] Password show/hide
- [ ] OTP flow (resend countdown)
- [ ] Social login buttons (Google/Facebook/Zalo/Apple)
- [ ] CAPTCHA adaptive
- [ ] Error messages (wrong password, locked account)
- [ ] Redirect after login (role-based: admin → /quan-tri, user → /tai-khoan)
- [ ] `?redirect=` param handling

### 2.2 Đăng ký (`/dang-ky`)
- [ ] Registration form (surname, givenName, email, phone, referral)
- [ ] Terms checkbox
- [ ] OTP verification
- [ ] Social signup

### 2.3 Quên mật khẩu (`/quen-mat-khau`)
- [ ] Email/phone input
- [ ] OTP verification
- [ ] Reset password form

### 2.4 Đặt lại mật khẩu (`/dat-lai-mat-khau`)
- [ ] Token validation
- [ ] New password form
- [ ] Success redirect

---

## Nhóm 3: Authenticated user pages

### 3.1 Tài khoản (`/tai-khoan`)
- [ ] Profile info (name, email, phone, SkyJoy member)
- [ ] Edit profile
- [ ] Change password
- [ ] Loyalty points display
- [ ] Booking history link

### 3.2 Chuyến bay của tôi (`/chuyen-bay-cua-toi`)
- [ ] List bookings (upcoming/past)
- [ ] Booking detail modal
- [ ] Cancel booking
- [ ] Download invoice
- [ ] Check-in link

### 3.3 Ví (`/vi`)
- [ ] Wallet balance
- [ ] Payment methods
- [ ] Transaction history
- [ ] Add payment method

### 3.4 Làm thủ tục (`/lam-thu-tuc`)
- [ ] PNR lookup
- [ ] Seat selection
- [ ] Boarding pass generation

### 3.5 Làm thủ tục trực tuyến (`/lam-thu-tuc-truc-tuyen`)
- [ ] Online check-in flow
- [ ] Seat map
- [ ] Baggage selection

---

## Nhóm 4: Booking flow (core)

### 4.1 Đặt vé (`/dat-ve`)
- [ ] Flight selection (from search results)
- [ ] Passenger info form (adult/child/infant)
- [ ] Seat selection
- [ ] Baggage/add-ons
- [ ] Contact info
- [ ] Price summary
- [ ] Payment method selection

### 4.2 Thanh toán (`/thanh-toan`)
- [ ] Payment method (VietQR, card, wallet)
- [ ] VietQR code generation
- [ ] Polling payment status
- [ ] Success/failure handling

### 4.3 Thanh toán thành công (`/thanh-toan/thanh-cong`)
- [ ] Booking confirmation
- [ ] E-ticket display
- [ ] Download invoice
- [ ] Share booking

### 4.4 Chi tiết đặt vé (`/dat-ve/[id]`)
- [ ] Booking detail view
- [ ] Passenger list
- [ ] Flight info
- [ ] Payment status
- [ ] Actions (cancel, modify, check-in)

---

## Nhóm 5: Admin dashboard (`/quan-tri`)

### 5.1 Overview tab
- [ ] KPI widgets (revenue, bookings, users, flights)
- [ ] Charts (revenue trend, booking status)
- [ ] Recent activity

### 5.2 Flights tab
- [ ] Flight list (search, filter, sort)
- [ ] Create flight
- [ ] Edit flight
- [ ] Delete flight
- [ ] Bulk price adjustment
- [ ] Delay SSE (real-time updates)

### 5.3 Users tab
- [ ] User list (search, filter)
- [ ] Create user
- [ ] Edit user
- [ ] Delete user (conflict handling)
- [ ] Reset password
- [ ] Role assignment

### 5.4 Bookings tab
- [ ] Booking list (search, filter)
- [ ] Booking detail
- [ ] Send email
- [ ] Generate invoice
- [ ] Status management

### 5.5 Revenue tab
- [ ] Revenue charts
- [ ] Revenue by route/period
- [ ] PDF report export

### 5.6 Chat tab
- [ ] Conversation list
- [ ] Message view
- [ ] Send message
- [ ] Voice call handling
- [ ] Close/reopen thread

### 5.7 Refunds tab
- [ ] Refund request list
- [ ] Process refund
- [ ] Refund details
- [ ] Feature lock

### 5.8 Analytics tab
- [ ] Analytics dashboard
- [ ] Charts and metrics

### 5.9 SSTK tab
- [ ] SSTK tools
- [ ] Execute tool

### 5.10 RBAC tab
- [ ] Role list
- [ ] Permission matrix
- [ ] Assign/remove role
- [ ] Config management

### 5.11 Airports tab
- [ ] Airport list
- [ ] Create/edit/delete airport

### 5.12 Announcements tab
- [ ] Announcement list
- [ ] Create/edit/delete announcement

### 5.13 Settings tab
- [ ] System config
- [ ] Edit settings

### 5.14 Audit logs tab
- [ ] Audit log list
- [ ] Filter by action/user/date

### 5.15 Transactions tab
- [ ] Transaction list
- [ ] Confirm/reject transaction

### 5.16 Checkins tab
- [ ] Check-in list
- [ ] Manage check-in

### 5.17 Banks tab
- [ ] Bank account list
- [ ] Create/edit/delete bank account

### 5.18 Discounts tab
- [ ] Discount list
- [ ] Create/edit/delete discount

### 5.19 Agencies tab
- [ ] Agency list
- [ ] Create/edit/delete agency

---

## Nhóm 6: Special pages

### 6.1 Editor (`/editor`)
- [ ] Content editor (if applicable)

### 6.2 Home redirect (`/`)
- [ ] Redirect to `/trang-chu`

---

## Kế hoạch thực hiện

### Phase 1: Smoke test (nhanh, ~30 phút)
1. Chạy `npm run dev` → verify server start
2. Chạy `npm run test` → verify 1337+ tests pass
3. Chạy `npm run type-check` → verify no TS errors
4. Chạy `npm run lint` → verify no lint errors

### Phase 2: E2E testing (~2 giờ)
1. Chạy Playwright specs hiện có:
   - `admin-flight-delay-sse.spec.ts`
   - `booking-vietqr.spec.ts`
   - `checkin-seat-change.spec.ts`
2. Viết thêm E2E specs cho các flow chính:
   - Login flow (user + admin)
   - Booking flow (search → book → pay)
   - Check-in flow
   - Chat flow

### Phase 3: Manual UI review (~4 giờ)
1. Kiểm tra từng trang theo checklist trên
2. Kiểm tra responsive (mobile/tablet/desktop)
3. Kiểm tra accessibility (keyboard nav, screen reader)
4. Kiểm tra loading states, error states, empty states

### Phase 4: API integration test (~2 giờ)
1. Test tất cả API endpoints với Postman/curl
2. Verify auth/permission trên mỗi endpoint
3. Test edge cases (invalid input, missing fields)

### Phase 5: Performance & Security (~1 giờ)
1. Lighthouse audit (performance, accessibility, SEO)
2. Security scan (XSS, CSRF, SQL injection)
3. Bundle size analysis

---

## Tiêu chí đồng bộ

- [ ] Tất cả trang dùng chung design system (colors, typography, spacing)
- [ ] Tất cả form có validation và error messages nhất quán
- [ ] Tất cả loading states dùng skeleton/spinner nhất quán
- [ ] Tất cả empty states có illustration + CTA
- [ ] Tất cả error states có retry button
- [ ] Responsive breakpoints nhất quán (sm/md/lg/xl)
- [ ] Dark mode support (nếu có)
- [ ] Accessibility: WCAG 2.1 AA compliance

---

## Công cụ kiểm tra

| Công cụ | Mục đích |
|---------|----------|
| Vitest | Unit tests |
| Playwright | E2E tests |
| ESLint | Code quality |
| TypeScript | Type safety |
| Lighthouse | Performance/a11y |
| axe-core | Accessibility |
| Chrome DevTools | Network/performance |

---

## Ưu tiên

1. **P0 (Critical)**: Login, Booking flow, Payment, Admin dashboard
2. **P1 (High)**: Check-in, Chat, Account management
3. **P2 (Medium)**: Loyalty, Wallet, Services
4. **P3 (Low)**: Static pages (About, Contact, FAQ)
