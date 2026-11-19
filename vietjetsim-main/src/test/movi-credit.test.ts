import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * "Bay trước trả sau" (MOVI) — hợp đồng đầy đủ của tính năng.
 *
 * Ba tầng được kiểm tra ở đây, và tầng nào cũng phải đứng vững:
 *
 *   1. LUẬT HỒ SƠ (`@/lib/movi`) — một hồ sơ hợp lệ ở form inline phải là
 *      hồ sơ hợp lệ ở cổng gateway, và là hồ sơ server chấp nhận. Ba bản
 *      sao của luật này là ba bản sao có thể trôi lệch, và trôi lệch ở đây
 *      nghĩa là khách điền xong hồ sơ rồi bị server từ chối.
 *
 *   2. LƯỢT GIỮ CHỖ 30 PHÚT — mốc hết hạn phải nằm ở SERVER (`bookings.
 *      hold_expires_at`, migration 055), và quá hạn thì mã đặt chỗ phải bị
 *      HỦY + ghế phải được trả về kho. Một bộ đếm phía client đóng tab là
 *      mất trắng, và chỉnh ngày giờ máy là thay đổi luật.
 *
 *   3. HỒ SƠ TÍN DỤNG CÓ CẤU TRÚC (`movi_credit_applications`) — hồ sơ phải
 *      sống được sau khi giao dịch commit, chứ không chỉ nằm trong
 *      `payments.transfer_note` (một chuỗi tự do, và ở cổng gateway thì bị
 *      mất sạch).
 *
 * Test chạy trên bộ nhớ trong RAM (`src/lib/neon.ts` tự chuyển sang mock khi
 * không có `DATABASE_URL`) — KHÔNG chạm Neon thật. `process.env.DATABASE_URL`
 * phải bị xoá TRƯỚC khi module được nạp, vì `neon.ts` đọc nó ở cấp module;
 * `vi.hoisted` chạy trước mọi `import`.
 */
vi.hoisted(() => {
  delete process.env.DATABASE_URL;
});

// Gửi email là việc của hạ tầng, không phải của hợp đồng MOVI. Chặn nó lại
// để test không chạm SMTP (và không phụ thuộc vào cấu hình máy).
vi.mock('@/lib/mail', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  sendPaymentInstructionEmail: vi.fn().mockResolvedValue(false),
  sendPaymentFailedEmail: vi.fn().mockResolvedValue(false),
  sendPaymentPendingReviewEmail: vi.fn().mockResolvedValue(false),
}));

vi.mock('@/lib/payment-invoice', () => ({
  sendAutomaticPaymentInvoiceEmail: vi.fn().mockResolvedValue({ sent: false, reason: 'test' }),
}));

import {
  createBooking,
  getBookingByCodeOrId,
  getBookingById,
  getBookingHold,
  getFlightById,
  getMoviCreditApplication,
  rejectMoviCreditApplication,
  setBookingHold,
  clearBookingHold,
  expireStaleBookingHolds,
  updateBookingStatus,
} from '@/lib/db';
import { sql } from '@/lib/neon';
import {
  MOVI_DEFAULT_TENOR,
  MOVI_HOLD_MINUTES,
  MOVI_TENOR_OPTIONS,
  buildMoviTransferNote,
  normalizeMoviBirthDate,
  parseLegacyMoviNote,
  validateMoviApplication,
} from '@/lib/movi';
import { POST as holdRoute } from '@/app/api/dat-ve/[id]/giu-cho/route';
import { POST as processPayment } from '@/app/api/thanh-toan/route';
import { signAccessToken } from '@/lib/auth';
import { _clearStore } from '@/lib/rate-limit';

/** Chuyến bay VJ121 HAN→SGN có trong bộ nhớ mẫu. */
const FLIGHT_ID = '8865cc0c-d4a6-4a1e-8c4d-165e627a726e';

const OWNER = {
  userId: 'user-movi-credit-1',
  email: 'movi.credit@vietjet.shop',
  role: 'user' as const,
  fullName: 'NGUYEN VAN A',
};

const CSRF_TOKEN = 'movi-credit-csrf';

const ownerToken = () => signAccessToken(OWNER);

const withCsrf = (token?: string) => ({
  cookie: `access_token=${token ?? ''}; csrf_token=${CSRF_TOKEN}`,
  'x-csrf-token': CSRF_TOKEN,
  'content-type': 'application/json',
});

/** Hồ sơ MOVI hợp lệ — dùng lại cho mọi test để chỉ thay đổi điều cần kiểm tra. */
const VALID_PROFILE = {
  fullName: 'NGUYEN VAN A',
  birthDate: '1990-05-20',
  nationalId: '001200000000',
  phone: '0912345678',
  tenor: 3,
};

/** Tạo một đặt chỗ `pending` thật trong bộ nhớ (1 hành khách, 1 ghế). */
async function createPendingBooking(totalPrice = 3_200_000) {
  const booking = await createBooking(
    {
      user_id: OWNER.userId,
      flight_id: FLIGHT_ID,
      total_price: totalPrice,
      seatedCount: 1,
    },
    [{ name: 'NGUYEN VAN A', passenger_type: 'adult' }],
    [{ seat_number: '12A', price: 0 }]
  );

  if (!booking?.id) throw new Error('createBooking không trả về đặt chỗ trong bộ nhớ mẫu');
  return booking;
}

describe('MOVI — luật hồ sơ tín dụng', () => {
  beforeEach(() => {
    _clearStore();
  });

  it('chấp nhận hồ sơ hợp lệ và chuẩn hoá số điện thoại về 0XXXXXXXXX', () => {
    const result = validateMoviApplication({
      ...VALID_PROFILE,
      phone: '+84 912 345 678',
    });

    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.data.phone).toBe('0912345678');
    expect(result.data.nationalId).toBe('001200000000');
    expect(result.data.birthDate).toBe('1990-05-20');
    expect(result.data.tenorMonths).toBe(3);
  });

  it('từ chối hồ sơ thiếu họ tên, CCCD sai độ dài, số điện thoại sai', () => {
    expect(validateMoviApplication({ ...VALID_PROFILE, fullName: ' ' }).valid).toBe(false);
    expect(validateMoviApplication({ ...VALID_PROFILE, fullName: 'A' }).valid).toBe(false);

    const badCccd = validateMoviApplication({ ...VALID_PROFILE, nationalId: '12345' });
    expect(badCccd.valid).toBe(false);
    if (!badCccd.valid) expect(badCccd.field).toBe('nationalId');

    const badPhone = validateMoviApplication({ ...VALID_PROFILE, phone: '1234' });
    expect(badPhone.valid).toBe(false);
    if (!badPhone.valid) expect(badPhone.field).toBe('phone');
  });

  it('từ chối người đăng ký trả góp dưới 18 tuổi', () => {
    const result = validateMoviApplication({
      ...VALID_PROFILE,
      birthDate: `${new Date().getUTCFullYear() - 10}-01-01`,
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.field).toBe('birthDate');
  });

  it('từ chối kỳ hạn ngoài danh sách hợp lệ', () => {
    const result = validateMoviApplication({ ...VALID_PROFILE, tenor: 6 });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.field).toBe('tenor');
    expect([...MOVI_TENOR_OPTIONS]).toEqual([1, 2, 3]);
    expect(MOVI_DEFAULT_TENOR).toBe(3);
  });

  it('chuẩn hoá ngày sinh DD/MM/YYYY và loại bỏ ngày không tồn tại', () => {
    expect(normalizeMoviBirthDate('20/05/1990')).toBe('1990-05-20');
    expect(normalizeMoviBirthDate('1990-05-20')).toBe('1990-05-20');
    expect(normalizeMoviBirthDate('31/02/1990')).toBeNull();
    expect(normalizeMoviBirthDate('20/13/1990')).toBeNull();
    expect(normalizeMoviBirthDate('abc')).toBeNull();
  });

  /**
   * Copy phải nói đúng những gì hệ thống làm.
   *
   * Lỗi đã xảy ra: `/dich-vu` và `Header.tsx` quảng cáo "kỳ hạn cho vay đến 6
   * tháng", còn cổng MOVI chỉ cho chọn 1–3 tháng và server từ chối mọi kỳ
   * hạn ngoài danh sách đó. Khách đọc quảng cáo, ra quầy thấy hệ thống không
   * cho chọn — đúng cái loại lệch mà `ai-chatbot-policy.test.ts` đã ghim cho
   * cửa sổ check-in.
   *
   * Test này ghim hai bên vào nhau: đổi `MOVI_TENOR_OPTIONS` thì copy phải đổi
   * theo, và đổi copy mà không đổi implementation thì test đỏ.
   */
  it('copy quảng cáo nói đúng kỳ hạn mà cổng MOVI cho chọn', () => {
    const maxTenor = Math.max(...MOVI_TENOR_OPTIONS);

    // `/dich-vu` — trang dịch vụ.
    const services = readFileSync(join(process.cwd(), 'src/app/dich-vu/page.tsx'), 'utf8');
    expect(services).toContain(`Kỳ hạn trả góp linh hoạt từ 1 đến ${maxTenor} tháng`);
    expect(services).toContain(`Trả góp linh hoạt đến ${maxTenor} tháng`);

    // `Header.tsx` — thanh menu trên mọi trang.
    const header = readFileSync(
      join(process.cwd(), 'src/shared/components/navigation/Header.tsx'),
      'utf8'
    );
    expect(header).toContain(`thời hạn cho vay đến ${maxTenor} tháng`);
  });

  it('đọc được hồ sơ MOVI theo định dạng transfer_note cũ', () => {
    const parsed = parseLegacyMoviNote('MOVI: TRAN THI MOVI - CCCD 079198001234 - SĐT 0912345678');
    expect(parsed).not.toBeNull();
    expect(parsed?.fullName).toBe('TRAN THI MOVI');
    expect(parsed?.nationalId).toBe('079198001234');
    expect(parsed?.phone).toBe('0912345678');

    // Một `transfer_note` của phương thức KHÁC không phải hồ sơ MOVI.
    expect(parseLegacyMoviNote('VJ644052I98O')).toBeNull();
    expect(parseLegacyMoviNote(undefined)).toBeNull();
  });

  it('dựng transfer_note mà admin đọc được', () => {
    const note = buildMoviTransferNote({
      fullName: 'TRAN THI MOVI',
      nationalId: '079198001234',
      phone: '0912345678',
      birthDate: '1990-05-20',
      tenorMonths: 3,
    });
    expect(note).toContain('MOVI: TRAN THI MOVI');
    expect(note).toContain('CCCD 079198001234');
    expect(note).toContain('SĐT 0912345678');
  });
});

describe('MOVI — lượt giữ chỗ 30 phút', () => {
  beforeEach(() => {
    _clearStore();
  });

  it('đặt lượt giữ chỗ 30 phút qua API và trả về mốc hết hạn của server', async () => {
    const booking = await createPendingBooking();

    const before = Date.now();
    const res = await holdRoute(
      new NextRequest(`http://localhost:4028/api/dat-ve/${booking.id}/giu-cho`, {
        method: 'POST',
        headers: withCsrf(ownerToken()),
        body: JSON.stringify({ action: 'hold' }),
      }),
      { params: Promise.resolve({ id: booking.id }) }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.hold.method).toBe('movi');
    expect(body.hold.minutes).toBe(30);
    expect(MOVI_HOLD_MINUTES).toBe(30);

    const expiresAt = Date.parse(body.hold.expiresAt);
    expect(Number.isNaN(expiresAt)).toBe(false);
    expect(expiresAt).toBeGreaterThan(before + 29 * 60 * 1000);
    expect(expiresAt).toBeLessThanOrEqual(Date.now() + MOVI_HOLD_MINUTES * 60 * 1000 + 1000);

    // Mốc thời gian nằm ở server, không phải ở `sessionStorage` của trình duyệt.
    const hold = await getBookingHold(booking.id);
    expect(hold?.method).toBe('movi');
    expect(hold?.expiresAt).not.toBeNull();
  });

  it('từ chối giữ chỗ cho một đặt chỗ đã thanh toán', async () => {
    const booking = await createPendingBooking();

    const res = await holdRoute(
      new NextRequest(`http://localhost:4028/api/dat-ve/${booking.id}/giu-cho`, {
        method: 'POST',
        headers: withCsrf(ownerToken()),
        body: JSON.stringify({ action: 'hold' }),
      }),
      { params: Promise.resolve({ id: booking.id }) }
    );
    expect(res.status).toBe(200);

    // Đặt chỗ đã xác nhận thì không còn "giữ chỗ" được nữa.
    const confirmed = await getBookingById(booking.id);
    expect(confirmed?.status).toBe('pending');

    await clearBookingHold(booking.id);
    const cleared = await getBookingHold(booking.id);
    expect(cleared?.expiresAt).toBeNull();
    expect(cleared?.method).toBeNull();
  });

  it('hủy mã đặt chỗ và trả ghế về kho khi lượt giữ chỗ quá hạn', async () => {
    const booking = await createPendingBooking();
    const flightBefore = await getFlightById(FLIGHT_ID);
    const availableBefore = Number(flightBefore?.available ?? 0);

    // Lượt giữ chỗ đã hết hạn từ 1 phút trước.
    const hold = await setBookingHold(booking.id, 'movi', new Date(Date.now() - 60 * 1000));
    expect(hold?.method).toBe('movi');

    const expired = await expireStaleBookingHolds();
    expect(expired).toContain(booking.id);

    const cancelled = await getBookingById(booking.id);
    expect(cancelled?.status).toBe('cancelled');

    const flightAfter = await getFlightById(FLIGHT_ID);
    expect(Number(flightAfter?.available ?? 0)).toBe(availableBefore + 1);
  });

  it('tự quét lượt giữ chỗ quá hạn khi đọc một đặt chỗ', async () => {
    const booking = await createPendingBooking();
    await setBookingHold(booking.id, 'movi', new Date(Date.now() - 60 * 1000));

    // `getBookingById` tự sweep — không cần ai gọi `expireStaleBookingHolds`.
    const detail = await getBookingById(booking.id);
    expect(detail?.status).toBe('cancelled');
    expect(detail?.hold_expires_at).toBeNull();
  });

  it('giữ chỗ còn hạn thì không bị hủy', async () => {
    const booking = await createPendingBooking();
    await setBookingHold(booking.id, 'movi', new Date(Date.now() + MOVI_HOLD_MINUTES * 60 * 1000));

    const expired = await expireStaleBookingHolds();
    expect(expired).not.toContain(booking.id);

    const detail = await getBookingById(booking.id);
    expect(detail?.status).toBe('pending');
  });
});

describe('MOVI — thanh toán và hồ sơ tín dụng', () => {
  beforeEach(() => {
    _clearStore();
  });

  it('thanh toán thành công và trả về đầy đủ thông tin đặt chỗ', async () => {
    const booking = await createPendingBooking();

    const res = await processPayment(
      new NextRequest('http://localhost:4028/api/thanh-toan', {
        method: 'POST',
        headers: withCsrf(ownerToken()),
        body: JSON.stringify({
          booking_id: booking.id,
          method: 'movi',
          amount: 3_200_000,
          movi: VALID_PROFILE,
        }),
      })
    );

    expect(res.status).toBe(201);
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.payment.method).toBe('movi');
    expect(body.booking_status).toBe('confirmed');

    // Bốn khối mà UI hiển thị sau khi thanh toán: mã đặt chỗ, thông tin
    // chặng bay, thông tin vé và thông tin khách hàng.
    expect(body.booking.booking_code).toBe(booking.booking_code);
    expect(body.booking.flight.from_code).toBe('HAN');
    expect(body.booking.flight.to_code).toBe('SGN');
    expect(body.booking.flight.flight_no).toBe('VJ121');
    expect(body.booking.passengers).toHaveLength(1);
    expect(body.booking.passengers[0].name).toBe('NGUYEN VAN A');
    expect(body.hold).toBeNull();
  });

  it('lưu hồ sơ tín dụng có cấu trúc cùng giao dịch', async () => {
    const booking = await createPendingBooking();

    const res = await processPayment(
      new NextRequest('http://localhost:4028/api/thanh-toan', {
        method: 'POST',
        headers: withCsrf(ownerToken()),
        body: JSON.stringify({
          booking_id: booking.id,
          method: 'movi',
          amount: 3_200_000,
          movi: { ...VALID_PROFILE, tenor: 2 },
        }),
      })
    );

    expect(res.status).toBe(201);

    const application = await getMoviCreditApplication(booking.id);
    expect(application).not.toBeNull();
    expect(application?.full_name).toBe('NGUYEN VAN A');
    expect(application?.birth_date).toBe('1990-05-20');
    expect(application?.national_id).toBe('001200000000');
    expect(application?.phone).toBe('0912345678');
    expect(application?.tenor_months).toBe(2);
    expect(application?.status).toBe('submitted');
    expect(Number(application?.amount ?? 0)).toBe(3_200_000);
  });

  it('xoá lượt giữ chỗ khi thanh toán thành công', async () => {
    const booking = await createPendingBooking();

    await holdRoute(
      new NextRequest(`http://localhost:4028/api/dat-ve/${booking.id}/giu-cho`, {
        method: 'POST',
        headers: withCsrf(ownerToken()),
        body: JSON.stringify({ action: 'hold' }),
      }),
      { params: Promise.resolve({ id: booking.id }) }
    );
    expect((await getBookingHold(booking.id))?.expiresAt).not.toBeNull();

    const res = await processPayment(
      new NextRequest('http://localhost:4028/api/thanh-toan', {
        method: 'POST',
        headers: withCsrf(ownerToken()),
        body: JSON.stringify({
          booking_id: booking.id,
          method: 'movi',
          amount: 3_200_000,
          movi: VALID_PROFILE,
        }),
      })
    );
    expect(res.status).toBe(201);

    const hold = await getBookingHold(booking.id);
    expect(hold?.expiresAt).toBeNull();
    expect(hold?.method).toBeNull();
  });

  it('từ chối giao dịch MOVI khi thiếu hồ sơ tín dụng', async () => {
    const booking = await createPendingBooking();

    const res = await processPayment(
      new NextRequest('http://localhost:4028/api/thanh-toan', {
        method: 'POST',
        headers: withCsrf(ownerToken()),
        body: JSON.stringify({
          booking_id: booking.id,
          method: 'movi',
          amount: 3_200_000,
        }),
      })
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Missing MOVI profile');
  });

  it('từ chối giao dịch MOVI khi hồ sơ tín dụng sai', async () => {
    const booking = await createPendingBooking();

    const res = await processPayment(
      new NextRequest('http://localhost:4028/api/thanh-toan', {
        method: 'POST',
        headers: withCsrf(ownerToken()),
        body: JSON.stringify({
          booking_id: booking.id,
          method: 'movi',
          amount: 3_200_000,
          movi: { ...VALID_PROFILE, nationalId: '123' },
        }),
      })
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid MOVI profile');
    expect(body.field).toBe('nationalId');
  });

  it('báo "sai số tiền" trước khi báo "thiếu hồ sơ"', async () => {
    const booking = await createPendingBooking();

    const res = await processPayment(
      new NextRequest('http://localhost:4028/api/thanh-toan', {
        method: 'POST',
        headers: withCsrf(ownerToken()),
        body: JSON.stringify({
          booking_id: booking.id,
          method: 'movi',
          amount: 1_000_000,
        }),
      })
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid payment amount');
  });

  it('từ chối thanh toán khi lượt giữ chỗ đã hết hạn và mã đặt chỗ đã bị hủy', async () => {
    const booking = await createPendingBooking();
    await setBookingHold(booking.id, 'movi', new Date(Date.now() - 60 * 1000));

    const res = await processPayment(
      new NextRequest('http://localhost:4028/api/thanh-toan', {
        method: 'POST',
        headers: withCsrf(ownerToken()),
        body: JSON.stringify({
          booking_id: booking.id,
          method: 'movi',
          amount: 3_200_000,
          movi: VALID_PROFILE,
        }),
      })
    );

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('Reservation expired');
    expect(body.booking_status).toBe('cancelled');
  });

  it('vẫn chấp nhận client cũ gửi hồ sơ qua transfer_note', async () => {
    const booking = await createPendingBooking();

    const res = await processPayment(
      new NextRequest('http://localhost:4028/api/thanh-toan', {
        method: 'POST',
        headers: withCsrf(ownerToken()),
        body: JSON.stringify({
          booking_id: booking.id,
          method: 'movi',
          amount: 3_200_000,
          transfer_note: 'MOVI: TRAN THI MOVI - CCCD 079198001234 - SĐT 0912345678',
        }),
      })
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.payment.method).toBe('movi');

    // Hồ sơ cũ không có ngày sinh — nhưng vẫn phải được ghi lại để bên tín
    // dụng không mất đặt chỗ.
    const application = await getMoviCreditApplication(booking.id);
    expect(application?.national_id).toBe('079198001234');
    expect(application?.full_name).toBe('TRAN THI MOVI');
  });

  it('không cho người khác giữ chỗ hoặc thanh toán đặt chỗ của mình', async () => {
    const booking = await createPendingBooking();

    const strangerToken = signAccessToken({
      userId: 'user-movi-credit-stranger',
      email: 'stranger@vietjet.shop',
      role: 'user',
      fullName: 'STRANGER',
    });

    const holdRes = await holdRoute(
      new NextRequest(`http://localhost:4028/api/dat-ve/${booking.id}/giu-cho`, {
        method: 'POST',
        headers: withCsrf(strangerToken),
        body: JSON.stringify({ action: 'hold' }),
      }),
      { params: Promise.resolve({ id: booking.id }) }
    );
    expect(holdRes.status).toBe(403);

    const payRes = await processPayment(
      new NextRequest('http://localhost:4028/api/thanh-toan', {
        method: 'POST',
        headers: withCsrf(strangerToken),
        body: JSON.stringify({
          booking_id: booking.id,
          method: 'movi',
          amount: 3_200_000,
          movi: VALID_PROFILE,
        }),
      })
    );
    expect(payRes.status).toBe(403);
  });

  it('đọc được đặt chỗ MOVI qua PNR (mã đặt chỗ)', async () => {
    const booking = await createPendingBooking();
    const found = await getBookingByCodeOrId(booking.booking_code ?? '');
    expect(found?.id).toBe(booking.id);
  });
});

describe('MOVI — hoàn tiền đóng hồ sơ tín dụng', () => {
  beforeEach(() => {
    _clearStore();
  });

  it('đóng hồ sơ tín dụng khi đơn bị hoàn tiền', async () => {
    const booking = await createPendingBooking();

    // Thanh toán trả góp ⇒ hồ sơ tín dụng ở trạng thái "chờ duyệt".
    const payRes = await processPayment(
      new NextRequest('http://localhost:4028/api/thanh-toan', {
        method: 'POST',
        headers: withCsrf(ownerToken()),
        body: JSON.stringify({
          booking_id: booking.id,
          method: 'movi',
          amount: 3_200_000,
          movi: VALID_PROFILE,
        }),
      })
    );
    expect(payRes.status).toBe(201);
    expect((await getMoviCreditApplication(booking.id))?.status).toBe('submitted');

    // Hoàn tiền ⇒ hồ sơ phải ĐÓNG, không còn "chờ duyệt trả góp".
    //
    // Vì sao quan trọng: hồ sơ `submitted` là cái bên tín dụng đọc để duyệt
    // thu tiền trả góp. Một đơn đã hoàn mà hồ sơ vẫn mở là một đơn có thể
    // bị thu tiền cho một chuyến bay không còn tồn tại.
    await updateBookingStatus(booking.id, 'refunded');
    await rejectMoviCreditApplication(booking.id);

    const application = await getMoviCreditApplication(booking.id);
    expect(application?.status).toBe('rejected');
  });

  it('không đóng hồ sơ đã được duyệt (tiền trả góp đã thu rồi cần thu hồi riêng)', async () => {
    const booking = await createPendingBooking();

    await processPayment(
      new NextRequest('http://localhost:4028/api/thanh-toan', {
        method: 'POST',
        headers: withCsrf(ownerToken()),
        body: JSON.stringify({
          booking_id: booking.id,
          method: 'movi',
          amount: 3_200_000,
          movi: VALID_PROFILE,
        }),
      })
    );

    // Hồ sơ đã được bên tín dụng duyệt.
    const approved = await sql`
      UPDATE movi_credit_applications
      SET status = 'approved'
      WHERE booking_id = ${booking.id}
    `;
    expect(approved).toBeTruthy();

    await rejectMoviCreditApplication(booking.id);

    // `approved` phải được giữ: nó là dấu vết cho biết tiền trả góp ĐÃ được
    // thu — ghi đè bằng `rejected` sẽ giấu mất việc đó.
    expect((await getMoviCreditApplication(booking.id))?.status).toBe('approved');
  });
});
