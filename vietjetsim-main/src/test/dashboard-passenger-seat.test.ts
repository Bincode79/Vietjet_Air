import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The dashboard's seat column was always `--`.
 *
 * `mapDbBookingToUi` read `firstPassenger?.seat`. There is no `seat` column on
 * `passengers` — migration 046 renamed it to `seat_number`, and the column
 * before that lived on the *booking* row, not on the passenger. So the read
 * was `undefined` for every booking, checked in or not, and every customer
 * saw `--` where their seat should be.
 *
 * The mapper was `any`, which is why nothing caught it: an `any` parameter
 * accepts `passenger.seat` and `passenger.seat_number` alike, so the typo was
 * indistinguishable from a correct read at the type level.
 *
 * These read the source rather than rendering the dashboard: the mapper is a
 * module-private function, and the failure is a property of one property name
 * on a row type — the same shape of check `booking-status-badge.test.ts` uses
 * for the status map.
 */
const DASHBOARD = 'src/app/tai-khoan/components/UserDashboardClient.tsx';

describe('ghế của hành khách trên dashboard đọc đúng cột', () => {
  const source = readFileSync(join(process.cwd(), DASHBOARD), 'utf8');

  it('đọc seat_number, không đọc seat', () => {
    const mapper = /function mapDbBookingToUi\([\s\S]*?\n\}/.exec(source);
    expect(mapper).not.toBeNull();

    // The seat is read from the passenger row.
    expect(mapper![0]).toMatch(/firstPassenger\?\.seat_number/);
    // A bare `.seat` is the bug: no such column exists.
    expect(mapper![0]).not.toMatch(/firstPassenger\?\.seat\b(?!_)/);
  });

  it('định nghĩa cột ghế trên chính PassengerRecord', () => {
    const db = readFileSync(join(process.cwd(), 'src/lib/db.ts'), 'utf8');
    const record = /export interface PassengerRecord \{[\s\S]*?\n\}/.exec(db);
    expect(record).not.toBeNull();
    expect(record![0]).toMatch(/seat_number\?: string \| null/);
  });
});
