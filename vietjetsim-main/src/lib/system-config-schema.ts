/**
 * Schema của các cài đặt hệ thống runtime (an toàn cho cả client và server).
 *
 * File này CHỈ chứa định nghĩa schema và helper thuần túy, KHÔNG import
 * cơ sở dữ liệu (`neon` hay `sql`), nhờ đó các client components như
 * `SystemSettingsTab` và `AdminRBACPanel` có thể import schema mà không kéo theo
 * toàn bộ database driver/mock vào bundle trình duyệt.
 */

export const SYSTEM_CONFIG_SCHEMA = {
  // ─── Thông báo ────────────────────────────────────────────────────────────
  auto_send_payment_invoice_email: {
    type: 'boolean',
    default: true,
    description: 'Tự động gửi hoá đơn qua email khi thanh toán',
  },
  auto_send_booking_confirmation_email: {
    type: 'boolean',
    default: true,
    description: 'Tự động gửi email xác nhận đặt chỗ',
  },
  auto_send_fare_change_email: {
    type: 'boolean',
    default: true,
    description: 'Tự động gửi công văn giá vé cho Đại lý',
  },
  auto_send_flight_delay_email: {
    type: 'boolean',
    default: true,
    description: 'Tự động gửi thông báo đổi giờ bay / hoãn chuyến',
  },
  email_notifications: {
    type: 'boolean',
    default: true,
    description: 'Thông báo qua email',
  },

  // ─── Cấu hình đặt vé ─────────────────────────────────────────────────────
  max_passengers_per_booking: {
    type: 'number',
    default: 9,
    min: 1,
    max: 9,
    description: 'Số khách tối đa/đơn',
  },
  min_booking_amount: {
    type: 'number',
    default: 100000,
    min: 0,
    max: 999999999,
    description: 'Giá trị đặt vé tối thiểu (VND)',
  },
} as const satisfies Record<
  string,
  {
    type: 'string' | 'number' | 'boolean';
    default: string | number | boolean;
    min?: number;
    max?: number;
    description: string;
  }
>;

export type SystemConfigKey = keyof typeof SYSTEM_CONFIG_SCHEMA;

/**
 * Khoảng hợp lệ của một cài đặt số.
 */
export function getSystemConfigBounds(key: SystemConfigKey): {
  min?: number;
  max?: number;
} {
  const spec = SYSTEM_CONFIG_SCHEMA[key] as { min?: number; max?: number };
  return { min: spec.min, max: spec.max };
}

/** Giá trị mặc định của một cài đặt. */
export function getSystemConfigDefault<K extends SystemConfigKey>(key: K) {
  return SYSTEM_CONFIG_SCHEMA[key].default;
}
