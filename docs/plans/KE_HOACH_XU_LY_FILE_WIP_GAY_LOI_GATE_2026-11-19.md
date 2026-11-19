# Kế Hoạch Xử Lý 2 File WIP Chưa Hoàn Thiện Đang Làm Đỏ Quality Gate

**Ngày lập:** 19/11/2026
**Bối cảnh:** Sau commit `54f108b` (hoàn thiện backend + frontend dịch vụ bổ sung), toàn bộ gate chất lượng chỉ còn đỏ vì **2 file untracked, đang viết dở** của một tiến trình khác — cả hai đều **không được file nào import** (orphan WIP).

---

## I. Chẩn đoán hiện trạng (đã đo trên working tree)

| File | Trạng thái | Lỗi đo được |
|---|---|---|
| `src/features/payments/components/PaymentFlow.tsx` (447 dòng, untracked) | Tách component chọn phương thức thanh toán từ `PaymentClient` — chưa ai import | 22 lint errors: thiếu `PaymentMethodDetail`, `useToast`, `GalaxyPayBadge`; 15 JSX `<XxxLogo>` chưa định nghĩa; 3 `any`; prettier; +2 `[#rrggbb]` css-debt |
| `src/features/admin/components/BulkPriceUpload.tsx` (343 dòng, untracked) | Component admin nhập giá vé hàng loạt CSV/ảnh — chưa ai import | 36 lint errors (gần hết prettier); lỗi TS: `ImportPreviewRow` thiếu `time`/`flight`, `status` type `string` vs union, `imageFile.size` possibly undefined |

**Tin tốt đã xác minh:**
- Tất cả logo cần thiết **đã tồn tại** trong `src/features/payments/components/PaymentMethodLogos.tsx` (`VisaLogo`, `MastercardLogo`, `JcbLogo`, `AmexLogo`, `NapasLogo`, `VietQrLogo`, `VnpayLogo`, `MomoLogo`, `ZaloPayLogo`, `ApplePayLogo`, `GooglePayLogo`, `SkyJoyLogo`, `MoviLogo`, `GalaxyPayBadge`, …) — chỉ thiếu **một dòng import**, không phải viết mới.
- `PaymentMethodDetail` **không tồn tại ở bất kỳ đâu** — cần tạo mới hoặc đổi thiết kế sang dùng `gateway/*GatewayContent` đã có.
- `useToast` đã có sẵn tại `@/hooks/useToast`.

**Hệ quả:** `npm run lint`, `npm run type-check`, `npm run build`, `npm run lint:css-debt` đều đỏ **chỉ vì 2 file này** — mọi file tracked (kể cả toàn bộ phần ancillary vừa commit) đã sạch.

---

## II. Quyết định cần chốt trước khi sửa

Hai file này là sản phẩm của tiến trình khác, chưa có chủ sở hữu rõ ràng trong phân công. Có 2 hướng:

- **Hướng A — Hoàn thiện** (nếu tính năng thật sự cần): sửa theo mục III, giữ file lại dùng sau.
- **Hướng B — Loại bỏ** (nếu chỉ là nháp thử nghiệm): xóa 2 file untracked → mọi gate xanh ngay lập tức, không mất code đã commit nào.

> Khuyến nghị: **Hỏi chủ tiến trình song song trước**. Nếu không có ai nhận, chọn Hướng B cho `BulkPriceUpload.tsx` (tính năng admin chưa có trong plan nào) và Hướng A cho `PaymentFlow.tsx` (tách từ `PaymentClient` là refactor có giá trị — `PaymentClient.tsx` đang ~1000 dòng).

---

## III. Kế hoạch chi tiết — Hướng A (hoàn thiện)

### Bước 1: `PaymentFlow.tsx` (≈30–45 phút)

1. **Bổ sung import còn thiếu** (đầu file):
   ```ts
   import { useToast } from '@/hooks/useToast';
   import {
     VisaLogo, MastercardLogo, JcbLogo, AmexLogo, NapasLogo, VietQrLogo,
     VnpayLogo, MomoLogo, ZaloPayLogo, ApplePayLogo, GooglePayLogo,
     SkyJoyLogo, MoviLogo, GalaxyPayBadge,
   } from './PaymentMethodLogos';
   ```
2. **`PaymentMethodDetail`**: file chưa tồn tại. 2 lựa chọn:
   - (a) Tạo `src/features/payments/components/PaymentMethodDetail.tsx` — panel chi tiết từng phương thức, tái dùng `gateway/QrGatewayContent.tsx`, `NapasGatewayContent.tsx`, `CardGatewayContent.tsx`, `EWalletGatewayContent.tsx`, `MoviGatewayContent.tsx`, `WalletGatewayContent.tsx` đã có sẵn.
   - (b) Nếu component chỉ được dùng nội bộ bước `method-detail`, inline JSX vào `PaymentFlow.tsx` thay vì tạo file mới.
3. **Thay `any`**: `booking: any` → interface tối thiểu các field thật sự đọc (flight_no, from_code, to_code, total_price, booking_code…); `state: any` + `setState` → định nghĩa `PaymentFlowState` tường minh.
4. **`useToast`**: khai báo `const toast = useToast()` trong component và render `<ToastContainer>` nếu cần, hoặc bỏ hẳn nếu không dùng.
5. **Prettier**: `npx eslint --fix` toàn file.
6. **css-debt**: tìm 2 class `[#rrggbb]` (script báo tại file này) → đổi sang token `var(--…)`/`rgb(var(--…-rgb))` hoặc class màu có sẵn.

### Bước 2: `BulkPriceUpload.tsx` (≈20–30 phút)

1. **Sửa `ImportPreviewRow`**: bổ sung field `time?: string`, `flight?: string` vào interface (dòng 18), hoặc sửa mock data dùng đúng field đã khai báo — chọn phương án khớp ý đồ hiển thị (bảng có cột "Giờ" và "Chuyến bay" thì giữ field).
2. **`status` union**: ép `row.status === 'valid' ? 'success' : 'error' as const` → viết lại `status: (row.status === 'valid' ? 'success' : 'error') as 'success' | 'error'`.
3. **`imageFile.size` possibly undefined**: `imageFile?.size` đã optional-chain một phần — sửa `(file?.size || imageFile?.size || 0) / 1024`.
4. **Unused vars** (`formatCardNumber`, `transferNote`…): xóa hoặc dùng.
5. **Prettier**: `npx eslint --fix`.

### Bước 3: Nối vào app (nếu Hướng A)

- `PaymentFlow`: chỉ giá trị khi `PaymentClient.tsx` thực sự render nó — refactor `PaymentClient` để dùng component mới **hoặc** giữ file standalone cho bước sau. Không nối vội khi chưa verify visual.
- `BulkPriceUpload`: mount vào tab admin tương ứng (tab "Giá vé"/import) hoặc giữ trong thư viện component.

---

## IV. Kế hoạch chi tiết — Hướng B (loại bỏ)

```bash
rm src/features/payments/components/PaymentFlow.tsx \
   src/features/admin/components/BulkPriceUpload.tsx
```

- An toàn: cả hai **untracked + không được import** → xóa không ảnh hưởng code đã commit, không ảnh hưởng tính năng nào đang chạy.
- Rủi ro duy nhất: mất bản nháp của tiến trình kia — cần xác nhận trước khi xóa.

---

## V. Việc còn lại của phạm vi ancillary (độc lập với 2 file trên)

1. **Mở rộng `scripts/test-complete-bnpl-journey.cjs`**: thêm bước chụp `/dat-ve/[id]/dich-vu/thanh-toan` (ảnh 13–15: trang thanh toán dịch vụ desktop + mobile + màn thành công), lưu vào `docs/qa/bnpl-journey/`.
2. **Re-verify sau khi gate xanh**: `npm run type-check` && `npm test` && `npm run lint` && `npm run build` && `npm run lint:css-debt` && `npm run lint:tailwind-classes`.
3. **(Tuỳ chọn)** Rà soát `PaymentClient.tsx` hiển thị hold 30 phút — đã xác minh có `hold_expires_at`/`hold_method` + countdown, không còn fallback bịa.

---

## VI. Tiêu chí nghiệm thu

- [ ] `npm run lint` → 0 errors (chỉ warning có sẵn)
- [ ] `npm run type-check` → 0 errors
- [ ] `npm run lint:css-debt` → không tăng baseline
- [ ] `npm test` → 1344+ pass
- [ ] `npm run build` → thành công
- [ ] `npm run test:migrations` → 4/4 pass
- [ ] `npm run lint:tailwind-classes` → OK
- [ ] Dev server :4028 phản hồi 200 cho `/dat-ve/[id]/dich-vu` và `/dich-vu/thanh-toan`
- [ ] (Nếu làm QA) `docs/qa/bnpl-journey/` có ảnh trang thanh toán dịch vụ

---

## VII. Thứ tự thực hiện đề xuất

1. **Chốt hướng A/B** với chủ tiến trình song song (hoặc quyết định xóa nếu là nháp bỏ).
2. Nếu B: xóa 2 file → chạy lại toàn bộ gate (nhanh, ~15 phút gồm build).
3. Nếu A: sửa `PaymentFlow.tsx` trước (ít file phụ thuộc hơn), rồi `BulkPriceUpload.tsx`, rồi `eslint --fix` + gate.
4. Mở rộng script QA chụp `/dich-vu/thanh-toan`.
5. Commit theo từng file riêng để dễ revert.

**Lưu ý xung đột:** `PaymentFlow.tsx`/`BulkPriceUpload.tsx` nằm ngoài phân công 2 công cụ của `PHAN_CONG_HAI_CONG_CU_2026-11-19.md` — nếu tiến trình kia còn đang viết, mọi sửa đổi của ta đều có thể bị ghi đè. **Không sửa khi chưa xác nhận họ đã dừng.**
