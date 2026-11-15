/**
 * The mock database could not answer the wallet or loyalty routes.
 *
 * `/api/vi` and `/api/thanh-vien` are only fetched by a signed-in visitor, so
 * until the ui-check gate actually signed in, neither route had ever been
 * exercised. Both returned 500 against the mock:
 *
 *   `getOrCreateWallet` runs an INSERT and reads `result[0]`. The mock had no
 *   handler for `user_wallets`, so the INSERT fell through to the generic
 *   mock-data lookup and returned `[]`. `result[0]` was then `undefined`, and
 *   the caller's `wallet.balance` threw — a 500 instead of the empty wallet
 *   the screen is built to render.
 *
 *   `getOrEnrollLoyalty` throws "No active loyalty program found" when
 *   `loyalty_programs` is empty, which is a 500 too.
 *
 * The seeded loyalty program also has to have tiers, because
 * `getUserLoyaltyWithProgram` returns them and the route maps over the list.
 */
import { describe, it, expect, beforeEach } from 'vitest';

import { sql } from '@/lib/neon';

describe('mock database trả lời được ví và loyalty', () => {
  beforeEach(() => {
    // The mock keeps its stores in a closure created once per import, so the
    // tests below only read — the seeding itself is asserted by shape.
  });

  it('có chương trình loyalty đang hoạt động', async () => {
    const programs = await sql`SELECT * FROM loyalty_programs WHERE is_active = true LIMIT 1`;
    expect(programs.length).toBe(1);
    expect(programs[0]).toMatchObject({
      name: expect.any(String),
      points_per_1000_vnd: expect.any(Number),
      min_points_to_redeem: expect.any(Number),
    });
  });

  it('chương trình loyalty có các bậc điểm', async () => {
    const programs = await sql`SELECT * FROM loyalty_programs WHERE is_active = true LIMIT 1`;
    const tiers =
      await sql`SELECT * FROM loyalty_tiers WHERE program_id = ${programs[0].id as string}`;
    expect(tiers.length).toBeGreaterThan(0);
    for (const tier of tiers) {
      expect(tier).toMatchObject({
        name: expect.any(String),
        tier_order: expect.any(Number),
        points_multiplier: expect.any(Number),
      });
    }
  });

  it('tạo ví mới trả về đúng một hàng, không phải mảng rỗng', async () => {
    // This is the branch that used to hand back `[]`, leaving the caller with
    // `wallet === undefined`.
    const wallet = await sql`
      INSERT INTO user_wallets (user_id, balance, currency, account_number)
      VALUES (${'mock-user-support'}, 0, 'VND', ${'VJSIM0000000001'})
      RETURNING *
    `;
    expect(wallet.length).toBe(1);
    expect(wallet[0]).toMatchObject({
      user_id: 'mock-user-support',
      balance: 0,
      currency: 'VND',
      account_number: 'VJSIM0000000001',
    });
  });

  it('đọc ví theo user_id trả về hàng vừa tạo', async () => {
    const rows = await sql`SELECT * FROM user_wallets WHERE user_id = ${'mock-user-support'}`;
    expect(rows.length).toBe(1);
    expect(rows[0].balance).toBe(0);
  });

  it('cập nhật số dư là delta tương đối, không phải số dư tuyệt đối', async () => {
    // `applyWalletDelta` uses `SET balance = balance + $delta`; reading it as an
    // absolute balance would silently destroy money.
    const before = await sql`SELECT * FROM user_wallets WHERE user_id = ${'mock-user-support'}`;
    const start = Number(before[0].balance ?? 0);
    const delta = 50000;

    const updated = await sql`
      UPDATE user_wallets
      SET balance = balance + ${delta}, updated_at = NOW()
      WHERE user_id = ${'mock-user-support'}
      RETURNING id, balance
    `;
    expect(updated.length).toBe(1);
    expect(Number(updated[0].balance)).toBe(start + delta);
  });

  it('rút quá số dư không được tạo ra số dư âm', async () => {
    const current = await sql`SELECT * FROM user_wallets WHERE user_id = ${'mock-user-support'}`;
    const balance = Number(current[0].balance ?? 0);
    const overdraft = -(balance + 1);

    const updated = await sql`
      UPDATE user_wallets
      SET balance = balance + ${overdraft}, updated_at = NOW()
      WHERE user_id = ${'mock-user-support'} AND balance + ${overdraft} >= 0
      RETURNING id, balance
    `;
    // No row matched the funds check — that is how the route learns to report
    // "insufficient funds".
    expect(updated.length).toBe(0);
  });

  it('giao dịch ví được lọc theo wallet_id', async () => {
    const wallet = await sql`SELECT * FROM user_wallets WHERE user_id = ${'mock-user-support'}`;
    const walletId = wallet[0].id as string;

    const inserted = await sql`
      INSERT INTO wallet_transactions (
        wallet_id, type, amount, balance_before, balance_after,
        description, payment_method_id, reference_id, status
      )
      VALUES (${walletId}, ${'topup'}, ${100000}, ${0}, ${100000},
              ${'Nạp tiền'}, ${null}, ${'ref-1'}, ${'completed'})
      RETURNING *
    `;
    expect(inserted.length).toBe(1);

    const listed = await sql`
      SELECT * FROM wallet_transactions
      WHERE wallet_id = ${walletId}
      ORDER BY created_at DESC
      LIMIT ${10} OFFSET ${0}
    `;
    expect(listed.length).toBe(1);
    expect(listed[0]).toMatchObject({ type: 'topup', amount: 100000 });

    const counted =
      await sql`SELECT COUNT(*) as total FROM wallet_transactions WHERE wallet_id = ${walletId}`;
    expect(Number(counted[0].total)).toBe(1);
  });
});
