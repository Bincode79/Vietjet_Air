# BÁO CÁO PHÂN TÍCH CHUYÊN SÂU TOÀN BỘ DỰ ÁN — Vietjet Air

> **Ngày:** 22/11/2026 · **Phạm vi:** Đọc hiểu toàn bộ codebase `vietjetsim-main/`
> **Nguồn:** Đọc `README.md`, `AGENTS.md`, `docs/**`, `src/**`, `migrations/**`, `scripts/**`, test suite.

---

## 1. Tổng quan sản phẩm & phạm vi

### 1.1. Bản chất dự án

- **Vietjet Air** — ứng dụng **mô phỏng** (simulation) đặt vé máy bay nội địa VN. **Không phải** website chính thức của hãng.
- Dự án tiền thân tên **`VietjetSim`**, đổi tên thành `Vietjet Air` ngày **2026-09-26** (metadata, logo, header/footer, chat launcher, `TOTP_ISSUER`, package `vietjet-air`, tài liệu, email demo `@vietjetsim.vn` → `@vietjetair.vn`). Email đổi phải qua migration riêng (`migrations/022_rename_demo_email_domain.sql`).
- Mục tiêu: trải nghiệm đầy đủ vòng đời khách: tìm chuyến → chọn hạng → nhập hành khách → chọn ghế → dịch vụ bổ sung → thanh toán → e-ticket → check-in → hoàn/refund.

### 1.2. Stack kỹ thuật

| Thành phần | Giá trị |
|---|---|
| Framework | **Next.js 16.4.6** (App Router), `output: 'standalone'` |
| UI | React **19**, TypeScript, Tailwind CSS **3.4.6** |
| DB | Neon Serverless Postgres + fallback **in-memory mock** (`src/lib/neon.ts`) |
| Auth | JWT HS256 custom (access **15′** / refresh **7 ngày**, rotation + reuse detection), bcryptjs, otplib TOTP, cookie session |
| Realtime | SSE (`/api/sse/ghe-ngoi`, `/api/sse/trang-thai-chuyen-bay`) |
| PDF | pdfkit + font KoHo (`public/fonts/`), QR + Code 39 |
| Editor AI | Coding Pi trên **NVIDIA NIM** (OpenAI-compatible), Claude (Anthropic) qua router |
| Editor UI | Monaco + GrapesJS (visual editor) |
| Charts/stats | Recharts |
| Test | Vitest 5 (+ jsdom), Playwright, @testing-library |
| Mail | nodemailer (SMTP Hostinger/Gmail/Resend) |

### 1.3. Quy mô codebase (đo đạc thực tế)

- **~444 file** source TS/TSX/CSS trong `src/` (bỏ test + `.d.ts`) — **~108.000 dòng**
- **167 file test** / ~**1.341 test** (Vitest)
- **89 API route** (`src/app/api/**/route.ts`)
- **28 page** (`src/app/**/page.tsx`)
- **60 migration** SQL (`migrations/000_core_schema.sql` → `056_booking_ancillary_payment_status.sql`)
- ~**66 bảng** DB
- **129 script** trong `scripts/`

---

## 2. Kiến trúc hệ thống

```
Browser
  │  apiRequest (@/shared/services: credentials:'include' + CSRF header tự động)
  ▼
src/proxy.ts (Next 16 "proxy" convention — JWT verify HS256, rate-limit, CSRF seed,
  non-public → redirect /dang-nhap; classification: src/lib/route-access.ts)
  │
  ▼
src/app/api/**/route.ts (App Router handlers; verifyAuthRequest / verifyAdminRequest /
  validateCsrfOrReject; lỗi Postgres 5-digit code → HTTP 400)
  │
  ▼
src/lib/db.ts  →  Neon HTTP batch API {queries:[...]}→{results:[...]}; mock branch ở src/lib/neon.ts
  │
  ▼
Neon Postgres  ↔  scripts/neon-http-bridge.cjs (local dev)
```

- Mọi user-scoped query lọc theo `user_id` từ JWT đã verify; mọi admin route gate RBAC.
- `src/instrumentation.ts`, `src/lib/security-db.ts`, `src/lib/auth-session.ts`, `src/lib/account-lookup.ts` là trụ cột bảo mật phía server.

---

## 3. Phân tích chuyên sâu các module

### 3.1. Flights & Pricing — logic "kỹ thuật" sâu nhất

- `GET /api/chuyen-bay?from=&to=&date=&class=` → `searchFlights` + enrich **4 hạng**: `eco`, `deluxe`, `skyboss`, `business`.
- **Single Source of Truth giá vé:**
  - `FARE_LADDER_RATIO = 2.77` (business = economy × 2.77, theo migration 030)
  - `DEFAULT_VIETJET_DISCOUNT_VND = 200_000` (giảm mặc định so với giá niêm yết)
  - `MIN_TICKET_PRICE_FLOOR = 99_000`
- Lịch bay **curated từ `data/vietjet-schedule.csv`** (không scrape; booking API thật chắn WAF/HMAC/proof-of-work → không gọi). Loader fail loudly trên sai shape `flight_no`, duplicate `(from,to,depart_time)`, `economy > business`.
- **Business wave** mang số bay riêng **3001–3089** (block 035 dọn); network: 027 hub-spoke + 032 regional-to-regional (ĐN–Huế = 90′).

### 3.2. Booking & Seat

- Trip = 1 booking; round-trip = **2 booking chia `trip_id`**, mỗi leg có PNR riêng (`leg_role`).
- **Seat lock server-owned:** cookie `vj_seat_session` (proxy cấp) → server lưu SHA-256 `owner_token`; fail closed; `createBooking` re-check trong transaction → 409 `SeatLockConflictError`; seat đã book không lock được; SSE chỉ gửi `mine`.
- **Check-in:** nhận `leg`; cửa sổ **24h mở → 60min đóng**, cả hai đầu enforced, per-leg; enforced-by-default (`system_config.checkin_window_enforced`); chatbot phải nói đúng số (test `ai-chatbot-policy` pin cả hai).

### 3.3. Payment, Wallet, Loyalty, Refund

- Gateway: VNPAY QR · Mobile Banking VietQR · Thẻ ATM nội địa · Thẻ TC/GN · VNPAY nội địa · Apple Pay · Google Pay · Ví MoMo · Ví ZaloPay · Ví SkyJoy · Trả góp Movi · **Wallet** · SkyPoint + `VirtualCreditCard`.
- Wallet: double-entry checks; ledger `wallet_transactions`; movi credit hold (`movi_credit_applications`); refund: user→admin duyệt→admin confirm → release seats + refund wallet/loyalty; `049` one-settled-charge; `037` refund status guard.
- E-mail e-ticket qua `email_log` (unique `(booking_id, payment_id, template) NULLS NOT DISTINCT`).

### 3.4. Check-in, E-ticket, PDF

- QR **thật** (package `qrcode` + Code 39) từ `buildBoardingQrContent` — giống hệt PDF.
- PDF: **pdfkit** + font KoHo; Docker `node:20-alpine` không Chromium → không puppeteer.

### 3.5. Auth & Security — "bộ kim cương"

Các quyết định có chủ đính trong `AGENTS.md`:
- CSRF bắt buộc mọi mutating route (`validateCsrfOrReject`); client bắt buộc `apiRequest`.
- RBAC **fail-closed**; `admin` 52 quyền, `super_admin` bypass, các nhóm content/finance/ops/support.
- Lockout 5 lần thất bại → 15′ (single UPDATE COALESCE); 2FA TOTP + backup codes; CAPTCHA adaptive (sau 3 lần fail); phone normalize; refresh rotation + reuse detection; login identity = `session_id`.
- SkyJoy: **một** luồng lookup dùng chung (`account-lookup.ts`) + **một** session issuer dùng chung (`auth-session.ts`).
- DB identity: `user_profiles.id` = **text** (cần cast `::text` khi join uuid).

### 3.6. Chat, Notifications, Realtime

- Widget mount 1 lần từ root layout (`ChatWidgets`); presence conversation-scoped; archive = `status` thật.
- **OpenClaw đã bị xóa** — collector không hoạt động; pricing constants giữ lại cho admin bulk price.
- Chat voice calls (`039`, `VoiceCallModal`); notifications hub + danh-dau-tat-các.

### 3.7. Coding Pi, Claude, Editor, Visual Editor

- Coding Pi: NVIDIA NIM; 3 tầng (protocol/stream/provider-service); SSE events `ready, reasoning, content, tool_call, done, error`; admin-only; key server-only; client chỉ import protocol/stream (test isolation).
- Claude: `claude-model-router.ts` (easy→FAST, balanced→BALANCED, hard→STRONG).
- Editor: `/api/editor/files` admin-only, reject path ngoài project root + file secret.

---

## 4. Luồng nghiệp vụ end-to-end

1. **Search:** `GET /api/chuyen-bay` → enrich 4 hạng → `/tim-ve` → `FlightResultsStep`.
2. **Hold:** `setBookingHold` / `expireStaleBookingHolds`.
3. **Booking:** `PassengerInfoStep` → `SeatSelectionStep` → drawers (meal/baggage/insurance/pet/taxi) → `recalcBookingTotal` → `PriceBreakdown`.
4. **Payment:** `POST /api/thanh-toan` → gateway → `confirmVietQrPayment` / `createPaymentAndConfirmBooking` → `POST /api/dat-ve/[id]/ve-dien-tu` → email qua `email_log`.
5. **Check-in:** `POST /api/checkin` (`leg`) → 24h/60min → `check_in` → boarding pass.
6. **Refund:** user yêu cầu → admin `PATCH /api/quan-tri/hoan-tien` → confirm → release seats + refund wallet/loyalty.

---

## 5. Database & dữ liệu

- **60 migration** SQL (`000`→`056`), idempotent-ish; CI replay toàn bộ lên Postgres trắng + re-apply.
- Bảng chính: `user_profiles`, `user_sessions`, `refresh_tokens`, `user_wallets`, `wallet_transactions`, `loyalty_programs`, `loyalty_tiers`, `user_loyalty`, `flights`, `flight_fares`, `seats`, `bookings`, `passengers`, `booking_ancillaries`, `booking_baggage`, `payments`, `discount_codes`, `agencies`, `refund_requests`, `check_in`, `email_log`, `chat_*`, `notifications`, `announcements`, `audit_logs`, `system_config`, `fare_classes`, `aircraft_types`, `airlines`, `airports`, `bank_accounts`, `saved_payment_methods`, …
- Scripts: `db:seed-demo`, `db:seed-flights` (21 ngày, quốc tế), `db:preview-flights`, `db:clean-test-bookings --apply`.
- Backup DB thật: `database-backup/`, dump release `vietjet-complete-*.tar.gz`, `vietjet-release-*.tar.gz`.

---

## 6. Testing, QA & gates — trạng thái hiện tại

| Gate | Kết quả (15/11/2026, chạy thật) |
|---|---|
| `type-check` | ✅ 0 lỗi |
| `lint` | ✅ 0 error / 0 warning |
| `vitest run` | ✅ ~145 file / 1.242 test pass (sau đó tăng lên ~168 file / ~1.341) |
| `next build` | ✅ exit 0 |
| `test:smoke` | ✅ pass (mock DB) |
| `test:smoke:real-db` | ✅ pass trên Postgres thật qua bridge + build standalone |
| `test:ui:full` | ✅ **68/68 màn hình** sạch (production build + mock DB) |
| `lint:tailwind-classes`, `lint:css-debt` | ✅ 0 nợ |
| TODO/FIXME trong `src/` | **0** |

⚠️ **CI GitHub Actions hiện fail không phải do code:** job bị chặn bởi billing issue của tài khoản (`The job was not started because your account is locked due to a billing issue.`).

Các gate đặc biệt: `test:wallet-e2e` (Postgres thật), `test:pdf-pipeline`, `test:migrations` (cần Docker).

---

## 7. Kết luận đọc hiểu — điểm mạnh & rủi ro

### ✅ Điểm mạnh
1. Kiến trúc sạch theo feature (RESTRUCTURING Phase 1–6 hoàn tất) + barrel exports.
2. Bảo mật nhiều tầng + test pin lại mỗi quy ước (`csrf-single-source`, `rbac-enforcement`, `route-access`, …).
3. QA rất dày: smoke (mock + real-db), UI 68 màn hình, wallet-e2e, PDF, migrations, perf, visual-diff, mail, e2e-roundtrip — ít bug chỉ gặp ở production.
4. `AGENTS.md` (105 KB) ghi dày gotcha kỹ thuật (Neon wire format, pg parser, date handling, CTE, error codes…).

### ⚠️ Rủi ro / cẩn trọng khi sửa
1. `src/lib/db.ts` (5.935 dòng) & `src/lib/neon.ts` (2.753 dòng) — core; mock branch phải mirror khi thêm query mới.
2. `sql.transaction` không tham chiếu kết quả câu trước → data-modifying CTE.
3. `json_agg FILTER` trả NULL khi không match → map `Array.isArray`.
4. `user_profiles.id` text vs FK uuid → cast `::text`.
5. Dev/prod divergence từng xảy ra với `middleware.ts` → `proxy.ts`.
6. Tailwind `[var(--x)]/N` compile thành **nothing** → dùng channel `rgb(var(--x-rgb))`.
7. Chỉ 1 stylesheet được import: `src/styles/tailwind.css`.
8. Payment flow phức tạp (multi-gateway, webhook, one-settled-charge, movi hold, refund) → sửa cần re-run `test:wallet-e2e` + `test:e2e-roundtrip`.

---

## 8. Tài liệu liên quan

- `vietjetsim-main/AGENTS.md` — bible conventions & gotcha
- `docs/SETUP.md`, `docs/README.md` — chỉ mục tài liệu
- `docs/app/SO_DO_LUONG.md`, `LUONG_XU_LY.md`, `HE_THONG_BAN_VE.md` — luồng nghiệp vụ (Mermaid)
- `docs/plans/`, `docs/qa/`, `docs/reports/` — kế hoạch, QA, báo cáo
- `MOBILE_RESPONSIVE_PLAN.md`, `UI_TEST_PLAN.md`, `DB_README.md` — mobile QA, UI plan, DB

---

*Bản phân tích được thực hiện và ghi thành tài liệu này ngày 22/11/2026.*
