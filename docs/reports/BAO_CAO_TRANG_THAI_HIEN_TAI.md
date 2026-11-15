# BÁO CÁO TRẠNG THÁI HIỆN TẠI — Vietjet Air

**Cập nhật số liệu:** 15/11/2026 · chạy thật trên máy dev
(`type-check`, `lint`, `vitest run`).

Các số liệu cũ trong `SUMMARY.txt`, `BUILD_VERIFICATION.md` và
`BAO_CAO_KIEM_THU_UI.md` (bản 23/09) không còn đúng — xem §1.

> **Đọc kèm:** những mục từ §2 trở xuống được viết ngày **25/09/2026**. Chúng còn
> đúng về *quyết định thiết kế* (RBAC, hoàn tiền, tra cứu PNR), nhưng các con số
> và phần "còn tồn đọng" đã lệch với source hiện tại. Chỗ nào lệch đã ghi rõ.

---

## 1. Chất lượng mã nguồn

| Hạng mục | Kết quả (15/11/2026) |
|---|---|
| `npm run type-check` | ✅ 0 lỗi |
| `npm run lint` | ✅ 0 error, 0 warning |
| `npm test` | ✅ **136 file / 1193 test** pass |
| `npm run build` | ✅ exit 0 (lần chạy gần nhất 14/11) |
| `npm run test:smoke` | ✅ pass toàn bộ assertion |
| `npm run lint:tailwind-classes` | ✅ 0 class không tồn tại |
| `npm run lint:css-debt` | ✅ 0 nợ CSS (baseline ratchet 0/0/0/0/0) |
| TODO/FIXME trong `src/` | 0 |
| Quy mô | 554 file TS/TSX · 90 API route · 52 migration · 129 script |

**Vì sao số test tăng từ 367 → 1189:** các đợt bổ sung test cho admin dashboard,
ví dụ thanh toán, PDF pipeline, RBAC và mobile parity. Con số 37 file ở §4.4 là
bản cũ.

### 1.1 CI đang không chạy được — lỗi thanh toán của tài khoản, không phải code

Kiểm tra ngày 15/11/2026 bằng API: **49/49 run của workflow `CI` đều fail sau
~2 giây, 0 step, không có log**. Annotation của job nói thẳng lý do:

> `The job was not started because your account is locked due to a billing issue.`

Run đầu tiên là 13/11/2026 03:50 và chưa từng có run nào chạy được step nào (run
"success" duy nhất trong danh sách là của Dependabot, không phải CI). Vì vậy mọi
trạng thái đỏ trên GitHub hiện tại **không** nói gì về chất lượng nhánh — cần vào
GitHub → Settings → Billing & plans xử lý phương thức thanh toán/spending limit
trước, rồi chạy lại workflow.

Cho tới lúc đó, các cổng dưới đây được chạy tay và đều xanh (bảng §1). Riêng
`npm run test:migrations` cần Docker — máy dev hiện không có Docker nên cổng này
chưa được xác nhận lại sau migration 049.

---

## 2. Đã đóng trong các đợt gần đây

| # | Hạng mục | Commit |
|---|---|---|
| 1 | Commit 43 file vốn nằm rác (gồm migration 018 + 6 test mới) | `e5bab3c`…`7967f49` |
| 2 | Hydration mismatch — `toLocaleString()` thiếu locale | `e5bab3c` |
| 3 | `Invalid Date` trong Chat quản trị | `e5bab3c` |
| 4 | Dấu `+` sai cho giao dịch rút tiền | `e034452` |
| 5 | Polling chat spam lỗi 401 khi mất session | `e034452` |
| 6 | Lỗi lint formatting | `7967f49` |
| 7 | **RBAC: từ "advisory only" → enforce thật** | `40d3d41` |
| 8 | **Mã đặt chỗ bịa ở trang thanh toán** | `06754dc` |

---

## 3. RBAC — đã enforce

Trước đây `verifyAdminRequest(request, permission)` **nhận permission rồi bỏ qua**;
cả 6 role admin đều vào được mọi route. Nay:

- Migration `019_role_permissions.sql` (đã áp dụng lên DB dev, idempotent).
- `admin` 52 quyền · `super_admin` 52 (bypass bảng) · `admin_content` 18 ·
  `admin_finance` 16 · `admin_ops` 15 · `admin_support` 10.
- **Fail-closed**: role không có dòng nào thì không gọi được route nào có guard.
- Route `phan-quyen` trước đây không yêu cầu quyền — nay cần `rbac:manage`.

Kiểm chứng thật trên DB dev (role tạm đổi rồi hoàn tác): cho phép
`booking:list`/`user:list`/`flight:list`, **từ chối** `flight:create`,
`user:delete`, `rbac:manage`, `system:config`.

---

## 4. Còn tồn đọng

### 4.1 Tra cứu đặt chỗ — **đã xử lý (commit `5ea080c`)**

`MOCK_BOOKINGS` đã bị gỡ khỏi `src/app/tra-cuu/page.tsx`. Tra cứu giờ chạy trên
session + sở hữu: khách phải đăng nhập, dữ liệu lấy từ `GET /api/dat-ve`, bỏ ô
email. Không có endpoint tra cứu PNR ẩn danh.

Lý do đã nêu trong báo cáo bảo mật vẫn đúng:

> *"Requiring a session and ownership stops anyone from enumerating check-in
> details via booking codes."*

PNR chỉ 6 ký tự nên dò được. Ba hướng:

- **(a)** Yêu cậu đăng nhập + sở hữu (đúng precedent hiện có) — an toàn, đánh đổi
  khả năng khách vô danh tra cứu.
- **(b)** Endpoint công khai PNR + email kèm rate-limit nghiêm — tiện hơn nhưng vẫn
  dò được nếu email bị lộ.
- **(c)** Giữ nguyên mock, chỉ ghi rõ là dữ liệu minh hoạ.

### 4.2 `Math.random()` còn trong mã nghiệp vụ

| Vị trí | Vấn đề |
|---|---|
| `api/quan-tri/cong-cu/route.ts:74` | Nhân giá demo 0.8–1.2 |
| `features/admin/components/FlightsTab.tsx:156` | Số ghế đã đặt hiển thị ngẫu nhiên |
| `lib/db.ts` | Sinh mã PNR / số check-in (chấp nhận được ở server) |

Các vị trí còn lại trong `PaymentClient` (confetti) là hiệu ứng đồ hoạ, không
phải dữ liệu.

### 4.3 Khách chưa đăng nhập chưa đặt vé được

`api/dat-ve/route.ts:8,41` gọi `verifyAuthRequest` bắt buộc. Cần
`bookings.user_id` nullable + sửa luồng UI — thay đổi lớn về schema.

### 4.4 Kiểm thử e2e — **có spec nhưng chưa chạy được**

*Cập nhật 15/11/2026:* khác với bản 25/09, repo đã có `playwright.config.ts` và
**3 spec** trong `e2e/` (`booking-vietqr`, `checkin-seat-change`,
`admin-flight-delay-sse`). Nhưng `@playwright/test` **không** có trong
`package.json` lẫn `node_modules`, nên `npx playwright test` không chạy được và
không spec nào được thực thi trong CI.

Thực tế đang dùng để kiểm tra giao diện là **script CDP tự viết**
(`npm run test:ui` + `scripts/ui-check.cjs`, và `scripts/run-ui-check.sh`): 68
màn hình × 3 viewport, chụp ảnh + dò chồng lấn/tràn khung. Bộ này bắt lỗi layout
tốt, nhưng không phải e2e theo nghĩa "bấm và kiểm tra nghiệp vụ".

Vẫn chưa có:

- Kiểm thử luồng phát sinh dữ liệu: thanh toán, nạp/rút ví, đổi mật khẩu, 2FA.
- Kiểm thử biên ngày sinh (tháng 2, năm nhuận).

### 4.5 Git

*Cập nhật 15/11/2026:* `main` và `origin/main` từng đồng bộ, nhưng hiện có **12
nhánh `cursor/*` chưa gộp** và một nhánh đang làm dở
(`cursor/audit-fixes-and-pdf-pipeline-tests`). Git identity đặt cục bộ là
`Cline <cline@localhost>`.

---

## 6. Hoàn tiền: quy trình hai chiều (migration 020)

Phiếu hoàn tiền trở thành luồng có trạng thái, không còn là bản ghi một chiều.

**Khách gửi phiếu** (`/api/hoan-tien` POST) — 5 trường bắt buộc: ngân hàng nhận
tiền, số tài khoản, họ tên chủ tài khoản, số điện thoại, mã đặt chỗ. Mã đặt chỗ
được tra và **kiểm tra sở hữu** trước khi gắn thông tin nhận tiền; PNR 6 ký tự
nên không coi là bằng chứng danh tính.

**Phiếu tạo ra ở trạng thái ẩn** (`visible_to_user = FALSE`). `GET /api/hoan-tien`
lọc theo cờ này, và response POST chỉ trả `refundId` — không trả lại nội dung phiếu,
để khách không đọc được qua devtools. Khách không có endpoint sửa phiếu (PATCH → 405).

**Admin** (`/api/quan-tri/hoan-tien` PATCH) có 4 hành động:
`set_status` (mặc định), `set_visibility`, `update_details`, `set_feature_lock`.
Ghi đè chi tiết tách riêng khỏi `updateRefundStatus` để đổi trạng thái không vô tình
công khai phiếu.

**Khoá tính năng** qua `system_config.refund_feature_enabled`. Thiếu dòng config thì
mặc định **bật**, để DB cũ chưa chạy migration không bị hiểu nhầm là đang tắt.

Đã kiểm thử thật trên dev server (chi tiết ở `BAO_CAO_KIEM_THU_UI.md`).

---

## 5. Vận hành

- Server dev: `npm run dev` → http://localhost:4028
- Migration phải chạy **trước** khi phục vụ traffic; `019_role_permissions.sql`
  là bắt buộc vì `verifyAdminRequest()` fail-closed.
