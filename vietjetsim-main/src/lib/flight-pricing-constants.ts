/**
 * Pricing constants shared by the admin bulk price-adjust endpoint.
 *
 * These used to live in `@/lib/openclaw/web-collection`, which meant the
 * price-adjust feature could not outlive the OpenClaw data collector. The
 * constants are plain business rules — the fare ladder ratio the seed
 * migration used, the default discount applied to collected Vietjet fares,
 * and the floor below which a fare may not fall — so they belong with the
 * pricing code, not with the collector.
 */

/** Đúng hệ số migration 030 dùng khi seed. */
export const FARE_LADDER_RATIO = 2.77;

/**
 * Mức giảm giá vé mặc định so với giá gốc của Vietjet: 200.000 VND.
 * Giúp giá hiển thị trên hệ thống luôn cạnh tranh và rẻ hơn giá niêm yết.
 */
export const DEFAULT_VIETJET_DISCOUNT_VND = 200000;

/** Mức giá sàn tối thiểu của một vé sau khi trừ giảm giá (đảm bảo không âm hoặc quá thấp). */
export const MIN_TICKET_PRICE_FLOOR = 99000;
