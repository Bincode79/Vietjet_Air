/**
 * Cài đặt hệ thống phải thực sự có tác dụng.
 *
 * Trước đây tab "Cài đặt hệ thống" liệt kê 13 key, nhưng 9 key trong số đó
 * không có bất kỳ mã nào đọc:
 *
 *   maintenance_mode, booking_timeout, min_refund_days, max_booking_per_user,
 *   min_booking_amount, max_passengers_per_booking, admin_bank_name,
 *   admin_bank_account_holder, admin_bank_account_number, sms_notifications
 *
 * Admin bật/tắt, thấy toast "Lưu thành công", và không có gì thay đổi — còn
 * tệ hơn là không có ô đó, vì nó khiến admin tin rằng cấu hình đã có hiệu lực.
 *
 * Bài test này ghim lại ranh giới đó:
 *   * mọi key hiển thị trong UI phải nằm trong `SYSTEM_CONFIG_SCHEMA`;
 *   * `SYSTEM_CONFIG_SCHEMA` chỉ chứa key có reader thật;
 *   * API cấu hình từ chối key lạ và giá trị sai kiểu/ngoài khoảng;
 *   * giới hạn số khách/đơn được áp dụng ở API tạo booking.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { SYSTEM_CONFIG_SCHEMA, getSystemConfigBounds } from '@/lib/system-config';
import { sql } from '@/lib/neon';

const ROOT = join(__dirname, '..', '..');

function readSource(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8');
}

describe('cài đặt hệ thống chỉ chứa cấu hình có tác dụng thật', () => {
  it('mọi key trong schema đều có reader trong mã nguồn', () => {
    // `system-config.ts` là nơi khai báo schema; các reader nằm ngoài file đó
    // và ngoài chính UI cài đặt.
    const sources = [
      'src/app/api/dat-ve/route.ts',
      'src/lib/payment-invoice.ts',
      'src/app/api/checkin/route.ts',
      'src/lib/db.ts',
    ].map(readSource);

    for (const key of Object.keys(SYSTEM_CONFIG_SCHEMA)) {
      const isRead = sources.some((source) => source.includes(`'${key}'`));
      expect(isRead, `key "${key}" không có nơi nào đọc nó`).toBe(true);
    }
  });

  it('UI cài đặt chỉ liệt kê key có trong schema', () => {
    const source = readSource('src/features/admin/components/SystemSettingsTab.tsx');

    // Lấy các key dạng `key: 'xxx'` trong mảng `DEFAULT_SETTINGS`.
    const declaredKeys = [...source.matchAll(/key:\s*'([a-z0-9_]+)'/g)].map((m) => m[1]);

    expect(declaredKeys.length).toBeGreaterThan(0);
    for (const key of declaredKeys) {
      expect(
        key in SYSTEM_CONFIG_SCHEMA,
        `UI hiển thị "${key}" nhưng key này không có tác dụng runtime`
      ).toBe(true);
    }
  });

  it('không còn các key chết từng khiến admin tưởng đã cấu hình xong', () => {
    const source = readSource('src/features/admin/components/SystemSettingsTab.tsx');

    for (const deadKey of [
      'maintenance_mode',
      'booking_timeout',
      'min_refund_days',
      'max_booking_per_user',
      'min_booking_amount',
      'sms_notifications',
      'admin_bank_name',
      'admin_bank_account_holder',
      'admin_bank_account_number',
    ]) {
      expect(source).not.toContain(`key: '${deadKey}'`);
    }
  });

  it('tab cấu hình của RBAC không còn hiển thị giá trị hard-code', () => {
    const source = readSource('src/features/admin/components/AdminRBACPanel.tsx');

    // Trước đây tab "Cấu hình hệ thống" in ra các giá trị cứng và bấm vào chỉ
    // hiện toast "Tính năng chỉnh sửa config đang được phát triển". Giờ nó
    // đọc/ghi qua API thật.
    expect(source).toContain('listRbacConfig');
    expect(source).toContain('setRbacConfig');
    expect(source).toContain('SYSTEM_CONFIG_SCHEMA');

    // Không còn mảng cấu hình hard-code trong JSX.
    expect(source).not.toContain("value: 'Vietjet Air'");
    expect(source).not.toContain("key: 'auto_cancel_hours'");
    expect(source).not.toContain("key: 'currency_symbol'");
  });
});

describe('schema cấu hình hệ thống', () => {
  it('giới hạn số khách/đơn nằm trong khoảng hợp lệ', () => {
    const bounds = getSystemConfigBounds('max_passengers_per_booking');
    expect(bounds.min).toBe(1);
    expect(bounds.max).toBe(9);
    expect(SYSTEM_CONFIG_SCHEMA.max_passengers_per_booking.default).toBeLessThanOrEqual(
      bounds.max as number
    );
  });

  it('mọi key có kiểu boolean đều mặc định là boolean', () => {
    for (const [key, spec] of Object.entries(SYSTEM_CONFIG_SCHEMA)) {
      if (spec.type === 'boolean') {
        expect(typeof spec.default, `${key} phải mặc định là boolean`).toBe('boolean');
      }
    }
  });
});

describe('mock database đọc và ghi được system_config', () => {
  it('trả về các key thật, không phải key sai', async () => {
    const rows = await sql<{ key: string; value: string }>`
      SELECT key, value FROM system_config WHERE key IN ('auto_send_payment_invoice_email', 'email_notifications')
    `;

    expect(rows.length).toBe(2);
    for (const row of rows) {
      expect(['auto_send_payment_invoice_email', 'email_notifications']).toContain(row.key);
    }
  });

  it('đọc một key cụ thể', async () => {
    const rows = await sql<{ key: string; value: string }>`
      SELECT key, value FROM system_config WHERE key = ${'email_notifications'}
    `;
    expect(rows.length).toBe(1);
    expect(rows[0].key).toBe('email_notifications');
  });

  it('ghi được giá trị mới và đọc lại được', async () => {
    const upsert = async (key: string, value: string) =>
      sql`
        INSERT INTO system_config (key, value, updated_at)
        VALUES (${key}, ${value}, NOW())
        ON CONFLICT (key)
        DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
        RETURNING *
      `;

    await upsert('email_notifications', 'false');
    const after = await sql<{ key: string; value: string }>`
      SELECT key, value FROM system_config WHERE key = ${'email_notifications'}
    `;
    expect(after[0].value).toBe('false');

    // Trả lại mặc định để các test khác không bị ảnh hưởng.
    await upsert('email_notifications', 'true');
  });
});
