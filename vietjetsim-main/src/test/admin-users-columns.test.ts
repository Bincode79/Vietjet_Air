import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The users table had three columns that could not be right.
 *
 * `getAllUsers` did `SELECT * FROM user_profiles`, so every row carried only
 * the profile columns. The admin table read three more off each row:
 *
 *   `bookings_count` — the number of bookings the customer has
 *   `total_spent`    — how much they have spent
 *   `notes`          — an operator note
 *
 * The first two are aggregates over `bookings` and were never selected, so
 * every customer showed `0` bookings and `0₫` spent — and the table sorted
 * by those zeroes, which is why the "Chi tiêu" column looked empty rather
 * than wrong.
 *
 * The third never existed at all: the `notes` column in this schema belongs
 * to `agencies`. The "Ghi chú vận hành" box was a `<textarea>` with no
 * `value`, no `onChange` and no write path, so typing in it saved nothing.
 *
 * The aggregates are computed in a subquery, not by joining `bookings`: a
 * plain JOIN gives one row per booking, so a customer with twelve bookings
 * would take twelve rows of the admin table.
 */
const DB = 'src/lib/db.ts';
const TAB = 'src/features/admin/components/UsersTab.tsx';

describe('bảng người dùng của quản trị đọc đúng cột', () => {
  const db = readFileSync(join(process.cwd(), DB), 'utf8');
  const tab = readFileSync(join(process.cwd(), TAB), 'utf8');

  it('getAllUsers tính số đặt vé và tổng chi tiêu', () => {
    const fn = /export async function getAllUsers\([\s\S]*?\n\}/.exec(db);
    expect(fn).not.toBeNull();
    const body = fn![0];

    expect(body).toMatch(/bookings_count/);
    expect(body).toMatch(/total_spent/);
    expect(body).toMatch(/GROUP BY user_id/);
  });

  it('không join bookings thẳng — sẽ nhân bản số dòng', () => {
    const fn = /export async function getAllUsers\([\s\S]*?\n\}/.exec(db);
    expect(fn).not.toBeNull();
    const body = fn![0];

    // A direct `JOIN bookings` multiplies the row count; the aggregate has to
    // live in a subquery.
    expect(body).not.toMatch(/JOIN bookings b\s+ON b\.user_id/);
    expect(body).toMatch(/LEFT JOIN \(/);
  });

  it('ghi chú vận hành đọc operator_notes, không đọc notes', () => {
    // `notes` is an `agencies` column, not a `user_profiles` one.
    expect(tab).toMatch(/operatorNotes: u\.operator_notes/);
    expect(tab).not.toMatch(/notes: u\.notes/);
  });

  it('ô ghi chú có value và onChange, và có nút lưu', () => {
    const textarea = /<textarea[\s\S]*?Ghi chú|Ghi chú vận hành[\s\S]*?<textarea[\s\S]*?\/>/.exec(
      tab
    );
    expect(textarea).not.toBeNull();

    expect(textarea![0]).toMatch(/value=\{notesDraft\}/);
    expect(textarea![0]).toMatch(/onChange=\{\(e\) => setNotesDraft/);
    // A note that cannot be saved must not be offered as if it could.
    expect(textarea![0]).toMatch(/handleSaveNotes/);
  });

  it('route ghi chú có write path và kiểm tra độ dài', () => {
    const route = readFileSync(
      join(process.cwd(), 'src/app/api/quan-tri/nguoi-dung/[id]/route.ts'),
      'utf8'
    );
    expect(route).toMatch(/operator_notes/);
    expect(route).toMatch(/UPDATE user_profiles/);
    expect(route).toMatch(/2000/);
  });

  it('migration 050 tạo cột operator_notes', () => {
    const migration = readFileSync(
      join(process.cwd(), 'migrations/050_user_profile_operator_notes.sql'),
      'utf8'
    );
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS operator_notes TEXT/);
  });
});
