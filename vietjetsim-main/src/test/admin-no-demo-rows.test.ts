import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The admin tables invented rows.
 *
 * Four tabs seeded their state from a hardcoded array and substituted it for
 * any empty or failed response:
 *
 *   `BookingsTab`  → `BOOKINGS`       — five bookings, `HAN → SGN` on `VJ 101`
 *   `FlightsTab`   → `INITIAL_FLIGHTS` — seven flights with fares and loads
 *   `UsersTab`     → `INITIAL_USERS`  — five customers with spend figures
 *   `UserDashboardClient` → `FALLBACK_UPCOMING` / `FALLBACK_HISTORY`
 *
 * The consequence is the same in each case and it is the worst kind: the
 * table looked live. An operator deciding which bookings to refund, or which
 * flight had a problem, was reading fiction; a customer with no bookings was
 * shown two tickets that do not exist. A failed request and a genuinely
 * empty result were indistinguishable.
 *
 * Every one of these tabs already had a correct empty state and a correct
 * error state. The demo arrays were what stood between the server's answer
 * and the screen.
 *
 * These read the source: the defect is that a fetch substitutes a constant
 * for the server's answer, which is a property of the component's code.
 */
const TABS = {
  bookings: 'src/features/admin/components/BookingsTab.tsx',
  flights: 'src/features/admin/components/FlightsTab.tsx',
  users: 'src/features/admin/components/UsersTab.tsx',
  dashboard: 'src/app/tai-khoan/components/UserDashboardClient.tsx',
} as const;

function read(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

/** The source without its comments — the comments quote the old code. */
function readCode(path: string) {
  return read(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

describe('bảng quản trị không hiển thị dữ liệu mẫu', () => {
  it('bảng đặt vé không còn mảng BOOKINGS', () => {
    const code = readCode(TABS.bookings);
    expect(code).not.toMatch(/const BOOKINGS:/);
    expect(code).not.toMatch(/setBookings\(BOOKINGS\)/);
    expect(code).toMatch(/useState<Booking\[\]>\(\[\]\)/);
  });

  it('bảng chuyến bay không còn mảng INITIAL_FLIGHTS', () => {
    const code = readCode(TABS.flights);
    expect(code).not.toMatch(/const INITIAL_FLIGHTS:/);
    expect(code).not.toMatch(/INITIAL_FLIGHTS/);
    expect(code).toMatch(/useState<Flight\[\]>\(\[\]\)/);
  });

  it('bảng khách hàng không còn mảng INITIAL_USERS', () => {
    const code = readCode(TABS.users);
    expect(code).not.toMatch(/const INITIAL_USERS:/);
    expect(code).not.toMatch(/INITIAL_USERS/);
    expect(code).toMatch(/useState<User\[\]>\(\[\]\)/);
  });

  it('dashboard khách hàng không còn mảng chuyến bay mẫu', () => {
    const code = readCode(TABS.dashboard);
    expect(code).not.toMatch(/FALLBACK_UPCOMING/);
    expect(code).not.toMatch(/FALLBACK_HISTORY/);
  });

  it('một kết quả rỗng phải dẫn tới danh sách rỗng, không phải mảng mẫu', () => {
    for (const key of ['bookings', 'flights', 'users'] as const) {
      const code = readCode(TABS[key]);
      // No `mapped.length > 0 ? mapped : <demo array>` anywhere: an empty
      // response must stay empty.
      expect(code).not.toMatch(/\.length > 0 \? mapped : (INITIAL_|BOOKINGS|FLIGHTS|USERS)/);
    }
  });

  it('các bảng vẫn còn trạng thái rỗng và trạng thái lỗi', () => {
    for (const key of ['bookings', 'flights', 'users'] as const) {
      const code = readCode(TABS[key]);
      // The empty state is the correct rendering for "no rows", and the error
      // state for "the request failed". Both must survive the removal of the
      // demo arrays — otherwise the table would render nothing at all.
      expect(code).toMatch(/hasError/);
      expect(code).toMatch(/filtered\.length === 0/);
    }
  });

  it('không còn giá vé, tuyến bay hay số liệu nào đóng băng trong mã nguồn', () => {
    const combined = Object.values(TABS)
      .map((path) => readCode(path))
      .join('\n');

    // These were the fictional values, and each one is unique to the demo
    // arrays that were removed. If one reappears it is either a new fixture
    // (which needs its own label) or the old defect back.
    expect(combined).not.toMatch(/1038900/);
    expect(combined).not.toMatch(/4820000/);
    expect(combined).not.toMatch(/598900/);
    expect(combined).not.toMatch(/'14A'/);
    expect(combined).not.toMatch(/'22F'/);
    expect(combined).not.toMatch(/'VJ 101'/);
    expect(combined).not.toMatch(/'HAN → SGN'/);
  });
});
