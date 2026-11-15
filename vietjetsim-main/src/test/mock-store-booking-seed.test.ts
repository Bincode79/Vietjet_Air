import { describe, it, expect } from 'vitest';
import { getBookingByCodeOrId, getTripById } from '@/lib/db';

/**
 * Dữ liệu mẫu trong bộ nhớ (không có DATABASE_URL).
 *
 * Endpoint tải vé điện tử đọc booking → trip → hành khách rồi dựng PDF.
 * Nếu bộ nhớ không có dòng mẫu nào, mọi truy vấn trả `[]` ⇒ endpoint luôn
 * trả 404 ⇒ smoke test HTTP không bao giờ chạm tới đường sinh file, và lỗi
 * "pdfkit không tìm thấy font" (chỉ xuất hiện trong bản build) lọt qua CI.
 *
 * Test ở đây khẳng định *đường đọc dữ liệu* đúng — phần "file PDF sinh ra
 * được" đã có test riêng (`e-ticket-pdf-endpoint.test.ts`) và
 * `scripts/verify-pdf-pipeline.cjs`.
 */

describe('bộ nhớ mẫu — đặt chỗ dùng để in vé điện tử', () => {
  it('tìm được đặt chỗ theo mã PNR', async () => {
    const booking = await getBookingByCodeOrId('VJSMOKE');
    expect(booking).not.toBeNull();
    expect(booking?.booking_code).toBe('VJSMOKE');
  });

  it('tìm được đặt chỗ theo mã PNR không phân biệt hoa thường', async () => {
    const booking = await getBookingByCodeOrId('vjsmoke');
    expect(booking).not.toBeNull();
  });

  it('đọc được trip kèm hành khách và ghế', async () => {
    const booking = await getBookingByCodeOrId('VJSMOKE');
    expect(booking).not.toBeNull();

    const trip = await getTripById(String(booking?.trip_id));
    expect(trip).not.toBeNull();
    expect(trip?.legs.length).toBe(1);

    const leg = trip!.legs[0];
    expect(leg.bookingCode).toBe('VJSMOKE');
    expect(leg.flightNo).toBe('VJ121');
    expect(leg.passengers.length).toBe(1);
    expect(leg.passengers[0].name).toBe('Nguyễn Văn Anh');
    // Ghế nằm trên `passengers.seat_number` (migration 046) — thiếu nó thì
    // vé in ra không có số ghế.
    expect(leg.passengers[0].seat_number).toBe('12A');
  });

  it('trả về null cho mã đặt chỗ không tồn tại', async () => {
    const booking = await getBookingByCodeOrId('KHONGTONTAI');
    expect(booking).toBeNull();
  });
});
