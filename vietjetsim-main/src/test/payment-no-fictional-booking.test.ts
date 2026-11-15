/**
 * The payment page invented a booking.
 *
 * `/thanh-toan` is the one screen a customer reaches when they are about to
 * hand over money. When `sessionStorage['vjsim_booking']` was absent — a new
 * tab, an expired session, a direct link — the page built a booking out of
 * nothing and rendered it as a real ticket:
 *
 *   VJ141, SGN → HAN, departing 08:30, passenger NGUYỄN VĂN AN seat 12A,
 *   total 1,730,000₫
 *
 * The screenshot from the UI gate showed exactly that: a complete e-ticket
 * for a flight that does not exist, with a QR code and transfer instructions.
 * Nothing on the screen distinguished it from a real booking.
 *
 * This is the same defect class as the demo rows in the admin tables, in the
 * place where the costliest mistake is possible.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PAYMENT = 'src/features/payments/components/PaymentClient.tsx';

function read(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

/** The source without its comments — the comments quote the old code. */
function readCode(path: string) {
  return read(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

describe('trang thanh toán không hiển thị đơn đặt vé bịa', () => {
  it('không dựng booking giả khi sessionStorage rỗng', () => {
    const code = readCode(PAYMENT);
    // The `else` branch that set a hardcoded booking is gone.
    expect(code).not.toMatch(/flightNo:\s*'VJ141'/);
    expect(code).not.toMatch(/name:\s*'NGUYỄN VĂN AN'/);
    expect(code).not.toMatch(/total:\s*1730000/);
    expect(code).not.toMatch(/fareSubtotal:\s*1250000/);
  });

  it('hiện trạng thái "chưa có đơn đặt vé" khi không có booking', () => {
    const code = readCode(PAYMENT);
    expect(code).toMatch(/if \(!booking\)/);
    expect(code).toMatch(/Chưa có đơn đặt vé để thanh toán/);
  });

  it('không fallback về tuyến bay, giờ bay hay tên hành khách bịa', () => {
    const code = readCode(PAYMENT);
    expect(code).not.toMatch(/'TP\. HCM'/);
    expect(code).not.toMatch(/'Đà Nẵng'/);
    expect(code).not.toMatch(/'HÀNH KHÁCH'/);
    expect(code).not.toMatch(/'Thứ Sáu, 24\/10\/2026'/);
  });

  it('mọi mã định danh trong itinerary đến từ đơn, không có mã giả', () => {
    const code = readCode(PAYMENT);
    // `vj-id` and `VJ-PNR` reached a customer-facing document as if they
    // were a real booking id and PNR.
    expect(code).not.toMatch(/'vj-id'/);
    expect(code).not.toMatch(/'VJ-PNR'/);
    expect(code).not.toMatch(/'khachhang@vietjetair\.vn'/);
  });

  it('phí tiện ích lấy từ đơn thay vì hằng số cứng', () => {
    const code = readCode(PAYMENT);
    expect(code).not.toMatch(/convenienceFee=\{108000\}/);
    expect(code).not.toMatch(/ancillaryFee \|\| 54000/);
    expect(code).toMatch(/vietQrConvenienceFee/);
    expect(code).toMatch(/vietQrGrandTotal/);
  });

  it('tổng của modal VietQR bằng đúng tổng các dòng nó hiện', () => {
    const code = readCode(PAYMENT);
    // subtotal + convenienceFee - discount, not `booking.total - discount`
    // (which already includes the fee, so the breakdown did not add up).
    expect(code).toMatch(/subtotal \+ vietQrConvenienceFee - discountAmount/);
    expect(code).toMatch(/grandTotal=\{vietQrGrandTotal\}/);
  });
});

describe('trang thanh toán vẫn hiện được trạng thái thật', () => {
  it('vẫn có đường dẫn để khách quay lại luồng đặt vé', () => {
    const code = readCode(PAYMENT);
    expect(code).toMatch(/href="\/tim-ve"/);
    expect(code).toMatch(/href="\/chuyen-bay-cua-toi"/);
  });

  it('vẫn nạp đơn từ database theo mã đặt chỗ', () => {
    const code = readCode(PAYMENT);
    expect(code).toMatch(/apiRequest<[\s\S]*?>\(`\/api\/dat-ve\/\$\{bookingId\}`\)/);
  });
});
