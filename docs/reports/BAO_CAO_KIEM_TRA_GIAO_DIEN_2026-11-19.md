# BÁO CÁO KIỂM TRA VÀ ĐỒNG HÓA GIAO DIỆN — VIETJET AIR

**Ngày thực hiện:** 19/11/2026  
**Dự án:** `vietjetsim-main` (Next.js 16 / React 19 / Tailwind CSS)  
**Spec tham chiếu:** `docs/qa/VIETJET_THAM_SO_GIAO_DIEN_2026-11-13.md` (đo 13/11/2026 từ vietjetair.com live)  
**Trạng thái:** ✅ HOÀN THIỆN — Tất cả kiểm tra xanh

---

## 1. TỔNG QUAN CÁC THAY ĐỔI

### 1.1 Màu sắc — đồng nhất về token brand

| Nhóm | Trước | Sau | Phạm vi |
|---|---|---|---|
| Màu hex cục bộ | `bg-[#FFD600]`, `bg-[#D91A21]`, `bg-[#F1F1F1]`, `bg-[#FFD700]`, `bg-[#22c55e]`, `#EC2029` (inline style) | `bg-vj-yellow`, `bg-vj-red-dark`, `bg-vj-bar-gray`, `bg-vj-pay-green`, `var(--primary)` | `BookingTicketCard.tsx`, `PaymentClient.tsx`, `not-found.tsx` |
| Màu utility thô (~1.000 occurrence) | `text-gray-*`, `bg-gray-*`, `border-gray-*`, `hover:bg-gray-*`, `hover:bg-red-*`, `text-blue-600`, `text-red-*`, `bg-red-600` | `text-vj-*`, `bg-vj-*`, `border-vj-*`, `hover:bg-vj-*`, `text-vj-blue/red/red-dark`, `bg-vj-red-dark` | Toàn bộ `src/` (trừ `test/`) |
| Màu status admin | `text/bg/border/bg-hover-emerald/rose/indigo/slate-*` | `text/bg/border/bg-hover-vj-pay-green/red-dark/blue`, `text-vj-text-muted`, `border-vj-border-light` | `AdminDashboardClient.tsx`, `DiscountsTab.tsx`, `FlightsTab.tsx`, `BookingsTab.tsx`, `TransactionsTab.tsx`, `RefundRequestsTab.tsx`, `UsersTab.tsx`, `AnnouncementsTab.tsx`, `AuditLogsTab.tsx`, `AgenciesTab.tsx`, `AirportsTab.tsx`, `BankAccountsTab.tsx`, `AdminRBACPanel.tsx`, `ChatTab.tsx`, `OverviewTab.tsx` |
| Opacity modifier (`/NN`) trên màu status | Có `/NN` (không compile được khi bỏ token) | Bỏ `/NN` (không có RGB channel cho token tùy chỉnh) | Các file admin trên |

### 1.2 Kích thước và bo góc

| Vị trí | Trước | Sau | Spec tham chiếu |
|---|---|---|---|
| Bo góc component | `rounded-lg` (8px), `rounded-xl` (12px), `rounded-md` (6px) | `rounded-vj` (**10px**) | `border-radius:10px!important` vietjetair.com |
| CTA hero "Tìm chuyến bay" | 174×44px | **200×39px** | 200×39px (đo 13/11/2026, viewport 1440×900) |

### 1.3 Hiệu ứng

| Vị trí | Trước | Sau |
|---|---|---|
| Đổ bóng component | `shadow-sm/md/lg` (Tailwind mặc định) | `shadow-vj-sm/md/lg` (token elevation đã định nghĩa) |
| Hiệu ứng nhấn nút | `active:scale-95` (bị Tailwind 3.4 silent drop) | `active:scale-98` (token đã có trong config) |
| Font-weight dải dịch vụ (Header) | `font-weight: 700` | `font-weight: 500` (khớp spec 16px/500) |

### 1.4 Token mới thêm vào

| Token | Giá trị | File |
|---|---|---|
| `vj.surface-2` | `#f1f2f4` | `tailwind.config.js` |
| `vj.surface-3` | `#e7e8eb` | `tailwind.config.js` |

---

## 2. KẾT QUẢ KIỂM TRA

| Lệnh | Kết quả | Chi tiết |
|---|---|---|
| `npm run lint:tailwind-classes` | ✅ PASS | 2301 token quét, không class nào không tồn tại (chỉ còn 2 class cũ `outline-hidden`, `animate-scaleIn` trong vùng ranh giới chung đã biết) |
| `npm run lint:css-debt` | ✅ PASS | 0 nợ CSS trên 5 nhóm (text-[Npx], [#rrggbb], p-[Npx], rounded-[Npx], shadow-[…]) — mức baseline 0 |
| `npm run type-check` | ✅ PASS | Không lỗi TypeScript |
| `npm run lint:fix` | ✅ PASS | 0 errors, 18 warnings (cảnh báo cũ như unused var, `any` type — không liên quan bản sửa) |
| `npm run test` | ✅ PASS | **165/165 files, 1334/1334 tests pass** |
| `npm run build` | ✅ PASS | Compiled thành công, TypeScript OK, 88 static pages, Proxy (Middleware) chạy đúng |

---

## 3. ĐIỂM CÒN LẠI (đề xuất nếu cần xử lý thêm)

| Vị trí | Vấn đề | Khuyến nghị |
|---|---|---|
| Trang admin | Một số màu status (emerald/rose/indigo) đã đổi sang brand token, nhưng vẫn còn ít lượng `text-vj-text-muted`, `border-vj-border-light` | Giữ nguyên (đã là token brand) hoặc hoàn toàn đồng nhất |
| Visual Editor (`editor/page.tsx`) | Màu dark-theme (`#1E1E1E`, `#37373D`…) | Giữ nguyên — giao diện editor riêng, không thuộc tema sáng thương hiệu (theo AGENTS.md) |
| CTA hero | Đã sửa 200×39px | Không cần thêm |
| Hai class cũ `outline-hidden`, `animate-scaleIn` | Trong vùng ranh giới chung | Đã biết trước, không phải do bản sửa này gây ra |

---

## 4. KẾT LUẬN

Tất cả các kiểm tra giao diện đã hoàn thành:
- Màu sắc đồng nhất về hệ thống token brand của vietjetair.com (đỏ `#EC2029`, vàng `#FFDD00`, xám trung tính…).
- Bo góc chuẩn 10px theo spec site thật.
- Cách sử dụng Tailwind đúng token, không còn nợ CSS arbitrary value.
- Tất cả 1334 tests pass, production build thành công, proxy middleware hoạt động đúng.

Dự án sẵn sàng cho bước tiếp theo (triển khai hoặc chạy `test:ui` nếu cần kiểm tra trên trình duyệt thật).

---

**Lưu trữ tại:** `docs/reports/BAO_CAO_KIEM_TRA_GIAO_DIEN_2026-11-19.md`  
**Người thực hiện:** OpenCode Agent  
**Ngày:** 19/11/2026
