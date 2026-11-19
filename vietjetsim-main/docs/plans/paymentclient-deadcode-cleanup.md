# Kế hoạch dọn dead code PaymentClient.tsx

Bối cảnh: commit `0b151c7` đã chuyển toàn bộ thanh toán inline sang
`/thanh-toan/gateway/<method>`. `PaymentClient.tsx` còn ~19 eslint warning
(`no-unused-vars`) từ flow inline cũ — toàn bộ là dead code, không ảnh hưởng
runtime nhưng cần xoá theo cụm vì liên kết dây chuyền.

File: `src/features/payments/components/PaymentClient.tsx`

Nguyên tắc: xoá theo cụm (mỗi cụm = 1 commit hoặc 1 lần verify), chạy
`npx eslint <file>` + `npx tsc --noEmit` sau mỗi cụm. Nếu xoá nhầm →
`git checkout -- <file>` về commit gần nhất rồi làm lại cụm đó.

## Cụm 1 — Success view + MOVI modal (lớn nhất, ~800 dòng)

Đã chết vì `setShowMoviModal(true)` chỉ còn trong `handlePayment` (đã xoá)
và `handlePaymentSuccessFromWebhook` (đã xoá) là setter `confirmed` duy nhất.

- JSX success view: block `confirmed && (...)` trong return (~dòng 1400-2000
  của bản gốc) — gồm e-ticket, `EBoardingPass`, share buttons, download.
- `const [confirmed] = useState(false)` → xoá luôn state.
- MOVI modal JSX `{showMoviModal && (...)}` cuối file + `moviQrDataUrl`.
- Handlers: `executeMoviPayment`, `handleCloseMoviModal`, `acquireMoviHold`,
  `handleMoviHoldExpired`, `renewMoviHold`.
- States: `showMoviModal`, `moviQrDataUrl`, `moviCccd`, `moviFullName`,
  `moviBirthDate`, `moviPhone`, `moviHoldExpiresAt`, `moviHoldExpired`,
  `loading`/`setLoading` (nếu không còn ai set), `PaymentProcessingOverlay`.
- Effects: QRCode MOVI effect, hold-expiry effect.
- `formatHoldExpireDate` + banner giữ-chỗ trong trip strip.
- `paymentError`/`showErrorModal`/`ErrorModal` nếu chỉ còn executeMoviPayment
  set (kiểm tra lại — `executeMoviPayment` bị xoá thì cả chuỗi chết).
- Import: `MOVI_DEFAULT_TENOR`, `MOVI_HOLD_MINUTES` (nếu hết dùng),
  `EBoardingPass`, `ConfettiCanvas`, `AnimatedCheckmark` (component nội bộ
  đầu file), `PaymentProcessingOverlay`, `ErrorModal`.
- Lưu ý: `itineraryBookingData`/`ItineraryModal`/`showItineraryModal` vẫn
  dùng trong success view — kiểm tra có chỗ nào khác dùng không trước khi xoá.

## Cụm 2 — Bank transfer / QR confirm inline

- States: `adminAccounts`, `selectedAdminAccount` (nếu chỉ còn
  `transferNote` memo dùng), `transferNoteInput`, `transferAmountInput`.
- `transferNote` memo + 2 auto-fill `useEffect`.
- Effect fetch `/api/cong-khai/cau-hinh-ngan-hang`.
- `BankAccount` interface nội bộ (nếu hết dùng).
- Kiểm tra `selectedAdminAccount` còn được success-view bank-info block
  dùng không — nếu cụm 1 đã xoá success view thì xoá luôn.

## Cụm 3 — Ví / SkyPoint / cash+points

- Effect fetch `getWalletOverview` + `getMembership` (fail-soft, ~dòng 670).
- States: `walletBalance`, `skypointInfo`, `useCashPlusPoints`,
  `cashPlusPointsRedeem`.
- Memos: `maxPossiblePointsToRedeem`, `cashPlusPointsDiscountVnd`,
  `payableTotal`, `vietQrConvenienceFee`, `vietQrGrandTotal`, `cashDue`
  (kiểm tra `cashDue`/`payableTotal` còn được `itineraryBookingData` hay
  chỗ khác dùng không trước khi xoá).
- `paymentMethod === 'skypoint'/'wallet'` điều kiện JSX còn sót (nếu có).
- Imports: `getWalletOverview`, `createPayment` (nếu hết dùng),
  `getMembership`, `skypointPointsForAmount`, `skypointValueOfPoints`.

## Cụm 4 — Biên lai upload

- `processReceiptFile`, `handleReceiptFileChange`, `handleReceiptDrop`.
- States: `receiptFileName`, `receiptFileSize`, `isDraggingReceipt`,
  `fileInputRef`; `receiptImage`/`setReceiptImage` — kiểm tra success view
  (đã xoá ở cụm 1) còn tham chiếu không, nếu không thì xoá nốt.

## Cụm 5 — Modal QR/VietQR + paymentError còn sót

- `PaymentModal` + `showVietQrModal` (setter `setShowVietQrModal(true)` đã
  chết cùng form) + `vietQrGrandTotal`/`vietQrConvenienceFee` nếu còn.
- `toast`/`useToast` nếu hết dùng.

## Sau mỗi cụm

```bash
npx eslint src/features/payments/components/PaymentClient.tsx   # warnings phải giảm
npx tsc --noEmit                                               # 0 error (trừ lỗi lib/db.ts của phiên khác)
npx vitest run src/test/payment-ui.test.tsx src/test/payment-gateway-pages.test.tsx
```

Mục tiêu cuối: file chỉ còn booking load, method picker, promo, summary,
CTA điều hướng gateway — ước tính giảm từ ~3.300 xuống ~1.800 dòng.

## Ngoài phạm vi (đừng đụng)

- `src/lib/db.ts`, `src/lib/neon.ts` và các file admin — WIP của phiên khác.
- API routes, migration, logic `createPayment` — đã đúng, không đổi.
