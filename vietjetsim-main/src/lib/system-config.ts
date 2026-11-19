/**
 * Đọc cấu hình runtime từ bảng `system_config`.
 *
 * Mọi giá trị đều có **fallback mặc định** để hệ thống không sập khi bảng
 * `system_config` chưa tồn tại (DB cũ chưa chạy migration) hoặc admin chưa
 * kịp lưu cài đặt. Cấu hình chỉ có tác dụng khi được khai báo ở đây — nếu một
 * key không có trong `SYSTEM_CONFIG_SCHEMA` thì nó không thể tác động tới hành
 * vi của sản phẩm và sẽ bị `SYSTEM_SETTINGS_TAB` loại bỏ khỏi UI.
 */

import { sql } from '@/lib/neon';
import {
  SYSTEM_CONFIG_SCHEMA,
  type SystemConfigKey,
  getSystemConfigBounds,
  getSystemConfigDefault,
} from './system-config-schema';

export {
  SYSTEM_CONFIG_SCHEMA,
  type SystemConfigKey,
  getSystemConfigBounds,
  getSystemConfigDefault,
};

/**
 * Đọc một giá trị cấu hình đã được ép kiểu theo schema.
 *
 * Trả về `default` khi:
 * - hàng không tồn tại trong DB;
 * - giá trị không parse được theo kiểu khai báo;
 * - số nằm ngoài khoảng `min`/`max`.
 */
export async function getSystemConfigValue<K extends SystemConfigKey>(
  key: K
): Promise<(typeof SYSTEM_CONFIG_SCHEMA)[K]['default']> {
  const spec = SYSTEM_CONFIG_SCHEMA[key];
  const fallback = spec.default;

  try {
    const rows = await sql<{ key: string; value: string }>`
      SELECT key, value FROM system_config WHERE key = ${key} LIMIT 1
    `;
    const raw = rows?.[0]?.value;
    if (raw === undefined || raw === null) return fallback as never;

    if (spec.type === 'boolean') {
      const normalized = String(raw).trim().toLowerCase();
      if (normalized === 'true') return true as never;
      if (normalized === 'false') return false as never;
      return fallback as never;
    }

    if (spec.type === 'number') {
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) return fallback as never;
      if (spec.min !== undefined && parsed < spec.min) return fallback as never;
      if (spec.max !== undefined && parsed > spec.max) return fallback as never;
      return parsed as never;
    }

    return String(raw) as never;
  } catch {
    // Bảng `system_config` chưa tồn tại ⇒ dùng mặc định, không chặn luồng chính.
    return fallback as never;
  }
}

/**
 * Đọc nhiều cấu hình trong một lần truy vấn.
 *
 * Hàm này chỉ trả về các key có trong `SYSTEM_CONFIG_SCHEMA` — key lạ (do cài
 * đặt cũ hoặc nhập tay) bị bỏ qua để không lọt vào hành vi runtime.
 */
export async function getSystemConfigValues<K extends SystemConfigKey>(
  keys: readonly K[]
): Promise<Record<K, (typeof SYSTEM_CONFIG_SCHEMA)[K]['default']>> {
  const result = {} as Record<K, (typeof SYSTEM_CONFIG_SCHEMA)[K]['default']>;
  const wanted = keys.filter((k) => k in SYSTEM_CONFIG_SCHEMA);

  // Luôn điền giá trị mặc định trước, để thiếu hàng vẫn trả về giá trị hợp lệ.
  for (const key of wanted) {
    (result as Record<string, unknown>)[key] = SYSTEM_CONFIG_SCHEMA[key].default;
  }
  if (wanted.length === 0) return result;

  try {
    const placeholders = wanted.map((_, i) => `$${i + 1}`).join(', ');
    const rows = await sql<{ key: string; value: string }>`
      SELECT key, value FROM system_config WHERE key IN (${placeholders})
    `;
    for (const row of rows || []) {
      const key = row.key as K;
      if (!(key in SYSTEM_CONFIG_SCHEMA)) continue;
      const spec = SYSTEM_CONFIG_SCHEMA[key];
      if (spec.type === 'boolean') {
        const normalized = String(row.value).trim().toLowerCase();
        if (normalized === 'true' || normalized === 'false') {
          (result as Record<string, unknown>)[key] = normalized === 'true';
        }
      } else if (spec.type === 'number') {
        const parsed = Number(row.value);
        if (Number.isFinite(parsed)) {
          if (spec.min !== undefined && parsed < spec.min) continue;
          if (spec.max !== undefined && parsed > spec.max) continue;
          (result as Record<string, unknown>)[key] = parsed;
        }
      } else {
        (result as Record<string, unknown>)[key] = String(row.value);
      }
    }
  } catch {
    // Giữ nguyên giá trị mặc định đã điền ở trên.
  }

  return result;
}
