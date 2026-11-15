import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The admin bookings table was wrong in four columns at once, and it LOOKED
 * populated.
 *
 * `getAllBookings` selected `b.*`, `u.email`, `u.full_name` and `f.flight_no`
 * — and nothing else. But `BookingsTab` read six more fields off each row:
 * `user_name`, `user_email`, `flight_no`, `from_code`, `to_code`, `seat` and
 * `payment_method`. Only the first three existed.
 *
 * The three that did not exist each had a plausible fallback:
 *
 *   `from_code`/`to_code` → `'HAN → SGN'`
 *   `flight_no`          → `'VJ 101'`
 *   `seat`               → `'—'`
 *   `payment_method`     → `'Chuyển khoản'`
 *
 * So every booking in the operator's table showed the same flight, the same
 * route, no seat, and a bank transfer — regardless of what was actually
 * booked. Nothing errored; the table rendered. An operator deciding which
 * bookings to refund, or which flight had a problem, was reading four columns
 * of fiction.
 *
 * The reason it went unnoticed is the same shape as the dashboard seat bug:
 * the row was cast to `Record<string, unknown>` and read with `as string`, so
 * a missing column was a silent `undefined` and the fallback took over.
 *
 * These read the source rather than running the query: the defect is that the
 * SQL does not SELECT the columns the UI reads, which is a property of two
 * files agreeing.
 */
const DB = 'src/lib/db.ts';
const TAB = 'src/features/admin/components/BookingsTab.tsx';

describe('bảng đặt vé của quản trị không bịa dữ liệu cột', () => {
  const db = readFileSync(join(process.cwd(), DB), 'utf8');
  const tab = readFileSync(join(process.cwd(), TAB), 'utf8');

  it('getAllBookings SELECT đủ mọi cột mà bảng đọc', () => {
    const query =
      /export async function getAllBookings[\s\S]*?const bookingsQuery = `([\s\S]*?)`;/.exec(db);
    expect(query).not.toBeNull();
    const sql = query![1];

    for (const column of ['flight_no', 'from_code', 'to_code', 'seats', 'payment_method']) {
      expect(sql).toContain(column);
    }
  });

  it('ghế lấy từ passengers.seat_number, không phải cột seat trên bookings', () => {
    const query =
      /export async function getAllBookings[\s\S]*?const bookingsQuery = `([\s\S]*?)`;/.exec(db);
    expect(query).not.toBeNull();
    const sql = query![1];

    // The seat belongs to the passenger (migration 046), so it is aggregated
    // from `passengers`.
    expect(sql).toMatch(/FROM passengers p/);
    expect(sql).toMatch(/p\.seat_number/);
    // There is no `seat` column on `bookings` — reading one always yields
    // NULL, which is how the column silently became '—' for every row.
    expect(sql).not.toMatch(/b\.seat\b/);
  });

  it('bảng đọc đúng tên cột, không ép qua Record<string, unknown>', () => {
    const mapper =
      /const mapped: Booking\[\] = res\.bookings\.map\(\(b\) => \{([\s\S]*?)\n {6}\}\);/.exec(tab);
    expect(mapper).not.toBeNull();
    const body = mapper![1];

    expect(body).not.toMatch(/as unknown as Record<string, unknown>/);
    // The fallbacks that hid the defect are gone: a missing column must be
    // visibly empty, not a plausible-looking invention.
    expect(body).not.toMatch(/'VJ 101'/);
    expect(body).not.toMatch(/'HAN → SGN'/);
    expect(body).not.toMatch(/'Chuyển khoản'/);
  });

  it('lỗi tải dữ liệu phải bật cờ lỗi, không lặng lẽ trả về dòng mẫu', () => {
    const loader = /const loadBookings = React\.useCallback\([\s\S]*?\n {2}\}, \[\]\);/.exec(tab);
    expect(loader).not.toBeNull();
    const body = loader![0];

    // The catch block used to fall straight to the demo rows. The table then
    // showed five fabricated bookings with a live-looking chrome — the
    // operator could not tell a failed request from an empty result.
    const catchBlock = /catch \{([\s\S]*?)\} finally/.exec(body);
    expect(catchBlock).not.toBeNull();
    expect(catchBlock![1]).toMatch(/setHasError\(true\)/);
  });
});
