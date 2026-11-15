import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The customer dashboard invented bookings.
 *
 * `fetchUpcomingBookings` and `fetchHistoryBookings` each kept a hardcoded
 * array of itineraries — `HAN → SGN` on `VJ 101`, seat `14A`, 1.038.900₫,
 * plus two more — and substituted it whenever the API returned an empty list
 * *or* failed. Two consequences, both customer-facing:
 *
 *   1. A customer with no bookings at all was shown two tickets that do not
 *      exist, with prices. The empty state ("Bạn chưa có chuyến bay nào sắp
 *      tới") was unreachable for the only case it was designed for.
 *   2. A failed request rendered the same invented tickets rather than the
 *      error panel the component already has.
 *
 * The empty state and the error state both already existed and were correct.
 * The fallback arrays were what stood between the API's answer and the screen.
 *
 * These read the source: the defect is that a fetch substitutes a constant for
 * the server's answer, which is a property of the component's code.
 */
const DASHBOARD = 'src/app/tai-khoan/components/UserDashboardClient.tsx';

describe('dashboard khách hàng không bịa chuyến bay', () => {
  const source = readFileSync(join(process.cwd(), DASHBOARD), 'utf8');

  it('không còn mảng chuyến bay mẫu nào', () => {
    expect(source).not.toMatch(/FALLBACK_UPCOMING/);
    expect(source).not.toMatch(/FALLBACK_HISTORY/);
  });

  it('danh sách sắp tới lấy đúng nội dung API, không thay bằng dữ liệu mẫu', () => {
    const loader = /const fetchUpcomingBookings = useCallback\([\s\S]*?\n {2}\}, \[user\]\);/.exec(
      source
    );
    expect(loader).not.toBeNull();
    const body = loader![0];

    // The API's answer is mapped straight through — an empty array is an
    // empty array, and it renders the empty state.
    expect(body).toMatch(
      /setUpcomingBookings\(Array\.isArray\(bookings\) \? bookings\.map\(mapDbBookingToUi\) : \[\]\)/
    );
    // The error path must not fill the list with anything.
    const catchBlock = /catch \{([\s\S]*?)\} finally/.exec(body);
    expect(catchBlock).not.toBeNull();
    expect(catchBlock![1]).toMatch(/setUpcomingError\(true\)/);
    expect(catchBlock![1]).toMatch(/setUpcomingBookings\(\[\]\)/);
    expect(catchBlock![1]).not.toMatch(/FALLBACK/);
  });

  it('lịch sử chuyến bay lấy đúng nội dung API, không thay bằng dữ liệu mẫu', () => {
    const loader = /const fetchHistoryBookings = useCallback\([\s\S]*?\n {2}\}, \[user\]\);/.exec(
      source
    );
    expect(loader).not.toBeNull();
    const body = loader![0];

    expect(body).toMatch(/setHistoryBookings\(mapped\)/);
    const catchBlock = /catch \{([\s\S]*?)\} finally/.exec(body);
    expect(catchBlock).not.toBeNull();
    expect(catchBlock![1]).toMatch(/setHistoryError\(true\)/);
    expect(catchBlock![1]).toMatch(/setHistoryBookings\(\[\]\)/);
    expect(catchBlock![1]).not.toMatch(/FALLBACK/);
  });

  it('trạng thái rỗng vẫn còn để hiển thị khi khách chưa có vé', () => {
    // The empty states are the correct rendering for "no bookings" — they
    // must survive the removal of the fallback arrays.
    expect(source).toMatch(/upcomingBookings\.length === 0/);
    expect(source).toMatch(/filteredHistory\.length === 0/);
    expect(source).toMatch(/Chưa có chuyến bay nào/);
  });

  it('không còn giá vé, tuyến bay hay ghế nào đóng băng trong mã nguồn', () => {
    // These were the fictional values. If one reappears it is either a new
    // fixture (which needs its own label) or the old defect back.
    expect(source).not.toMatch(/1038900/);
    expect(source).not.toMatch(/598900/);
    expect(source).not.toMatch(/'14A'/);
    expect(source).not.toMatch(/'22F'/);
    expect(source).not.toMatch(/'11D'/);
  });
});
