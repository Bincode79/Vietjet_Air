/**
 * Cấu hình tập trung cho tất cả phương thức thanh toán.
 * Nhóm theo danh mục để render có điều kiện gọn gàng, dễ mở rộng.
 */

import type { PaymentMethod } from '@/features/payments/types';
import type { ComponentType } from 'react';

// Import all logo components
import {
  VnpayLogo,
  VietQrLogo,
  NapasLogo,
  VisaLogo,
  MastercardLogo,
  JcbLogo,
  AmexLogo,
  ApplePayLogo,
  GooglePayLogo,
  MomoLogo,
  ZaloPayLogo,
  SkyJoyLogo,
  MoviLogo,
} from '@/features/payments/components/PaymentMethodLogos';

export interface PaymentMethodConfig {
  /** Key nội bộ dùng trong selectedMethodGroup */
  groupKey: string;
  /** Loại thanh toán gửi sang API / gateway */
  paymentMethod: PaymentMethod;
  /** Nhãn hiển thị cho khách */
  label: string;
  /** Mô tả phụ (nếu có) */
  subtitle?: string;
  /** Component logo */
  logo: ComponentType<{ className?: string }>;
  /** ClassName cho logo container */
  logoClassName?: string;
  /** Badge "Khuyên dùng" */
  recommended?: boolean;
  /** Badge phụ (ví dụ: "Bay trước, trả sau") */
  badge?: string;
  /** Danh mục để nhóm hiển thị */
  category: PaymentCategory;
  /** Thứ tự hiển thị trong danh mục */
  order: number;
  /** Disable method (ví dụ: đang bảo trì) */
  disabled?: boolean;
  /** Tooltip / aria-label */
  ariaLabel?: string;
}

/** Danh mục phương thức thanh toán */
export type PaymentCategory =
  | 'cards_banks' // Thẻ và tài khoản ngân hàng
  | 'ewallets' // Ví điện tử
  | 'installments' // Giữ mã & thanh toán sau (trả góp)
  | 'loyalty'; // Điểm thưởng / ví tích lũy

/** Cấu hình hiển thị cho từng danh mục */
export interface PaymentCategoryConfig {
  key: PaymentCategory;
  title: string;
  subtitle?: string;
  icon?: React.ComponentType<{ className?: string }>;
  /** Chỉ hiện khi không phải MOVI (matching Image #1) */
  hideOnMovi?: boolean;
  /** Thứ tự hiển thị */
  order: number;
}

export const PAYMENT_CATEGORIES: PaymentCategoryConfig[] = [
  {
    key: 'cards_banks',
    title: 'Thẻ và tài khoản ngân hàng',
    order: 1,
  },
  {
    key: 'ewallets',
    title: 'Ví điện tử',
    order: 2,
  },
  {
    key: 'loyalty',
    title: 'Điểm thưởng / Ví tích lũy',
    order: 3,
  },
  {
    key: 'installments',
    title: 'Giữ mã đặt chỗ & thanh toán sau',
    order: 4,
    hideOnMovi: true, // Footer security cũng ẩn theo logic này
  },
];

/** Mapping nhóm -> category để render có điều kiện */
export const METHOD_CATEGORY_MAP: Record<string, PaymentCategory> = {
  vnpay_qr: 'cards_banks',
  vietqr: 'cards_banks',
  vnpay_dom: 'cards_banks',
  napas: 'cards_banks',
  card: 'cards_banks',
  applepay: 'cards_banks',
  googlepay: 'cards_banks',
  momo: 'ewallets',
  zalopay: 'ewallets',
  skypay: 'loyalty',
  movi: 'installments',
};

/** Tất cả phương thức thanh toán */
export const PAYMENT_METHODS: PaymentMethodConfig[] = [
  // === THẺ VÀ TÀI KHOẢN NGÂN HÀNG ===
  {
    groupKey: 'vnpay_qr',
    paymentMethod: 'vietqr',
    label: 'Quét mã VNPAY-QR',
    recommended: true,
    logo: VnpayLogo,
    logoClassName: 'h-5 w-auto max-w-[104px]',
    category: 'cards_banks',
    order: 1,
    ariaLabel: 'Thanh toán bằng VNPAY QR',
  },
  {
    groupKey: 'vietqr',
    paymentMethod: 'vietqr',
    label: 'Mobile Banking VietQR',
    logo: VietQrLogo,
    logoClassName: 'h-5 w-auto max-w-[104px]',
    category: 'cards_banks',
    order: 2,
    ariaLabel: 'Thanh toán bằng VietQR',
  },
  {
    groupKey: 'napas',
    paymentMethod: 'bank',
    label: 'Thẻ ATM nội địa',
    logo: NapasLogo,
    logoClassName: 'h-4 w-auto max-w-[104px]',
    category: 'cards_banks',
    order: 3,
    ariaLabel: 'Thanh toán bằng thẻ ATM Napas',
  },
  {
    groupKey: 'card',
    paymentMethod: 'card',
    label: 'Thẻ tín dụng / ghi nợ quốc tế',
    logo: () => (
      <div className="grid grid-cols-2 gap-x-2 gap-y-1 h-8 items-center">
        <VisaLogo className="h-4 w-auto" />
        <MastercardLogo className="h-4 w-auto" />
        <JcbLogo className="h-4 w-auto" />
        <AmexLogo className="h-4 w-auto" />
      </div>
    ),
    logoClassName: '',
    category: 'cards_banks',
    order: 4,
    ariaLabel: 'Thanh toán bằng thẻ quốc tế (Visa, Mastercard, JCB, Amex)',
  },
  {
    groupKey: 'vnpay_dom',
    paymentMethod: 'vietqr',
    label: 'Thanh toán nội địa VNPAY',
    logo: VnpayLogo,
    logoClassName: 'h-4 w-auto max-w-[104px]',
    category: 'cards_banks',
    order: 5,
    ariaLabel: 'Thanh toán nội địa VNPAY',
  },
  {
    groupKey: 'applepay',
    paymentMethod: 'card',
    label: 'Apple Pay',
    logo: ApplePayLogo,
    logoClassName: 'h-6 w-auto max-w-[104px]',
    category: 'cards_banks',
    order: 6,
    ariaLabel: 'Thanh toán bằng Apple Pay',
  },
  {
    groupKey: 'googlepay',
    paymentMethod: 'card',
    label: 'Google Pay',
    logo: GooglePayLogo,
    logoClassName: 'h-5 w-auto max-w-[104px]',
    category: 'cards_banks',
    order: 7,
    ariaLabel: 'Thanh toán bằng Google Pay',
  },

  // === VÍ ĐIỆN TỬ ===
  {
    groupKey: 'momo',
    paymentMethod: 'e_wallet',
    label: 'Ví MoMo',
    logo: MomoLogo,
    logoClassName: 'h-7 w-auto',
    category: 'ewallets',
    order: 1,
    ariaLabel: 'Thanh toán bằng ví MoMo',
  },
  {
    groupKey: 'zalopay',
    paymentMethod: 'e_wallet',
    label: 'Ví ZaloPay',
    logo: ZaloPayLogo,
    logoClassName: 'h-5 w-auto max-w-[104px]',
    category: 'ewallets',
    order: 2,
    ariaLabel: 'Thanh toán bằng ví ZaloPay',
  },

  // === ĐIỂM THƯỞNG / VÍ TÍCH LŨY ===
  {
    groupKey: 'skypay',
    paymentMethod: 'skypoint',
    label: 'Ví SkyJoy',
    logo: SkyJoyLogo,
    logoClassName: 'h-7 w-auto',
    category: 'loyalty',
    order: 1,
    ariaLabel: 'Thanh toán bằng điểm SkyPoint / ví SkyJoy',
  },

  // === GIỮ MÃ & THANH TOÁN SAU (TRẢ GÓP) ===
  {
    groupKey: 'movi',
    paymentMethod: 'movi',
    label: 'Trả góp Movi',
    subtitle: 'Bay trước, trả sau',
    badge: 'Bay trước, trả sau',
    logo: MoviLogo,
    logoClassName: 'h-6 w-auto max-w-[104px]',
    category: 'installments',
    order: 1,
    ariaLabel: 'Trả góp Movi - bay trước, trả sau',
  },
];

/** Helper: Lấy phương thức theo groupKey */
export function getPaymentMethod(groupKey: string): PaymentMethodConfig | undefined {
  return PAYMENT_METHODS.find((m) => m.groupKey === groupKey);
}

/** Helper: Lấy phương thức theo paymentMethod (API) */
export function getPaymentMethodByApiType(
  paymentMethod: PaymentMethod
): PaymentMethodConfig | undefined {
  return PAYMENT_METHODS.find((m) => m.paymentMethod === paymentMethod);
}

/** Helper: Lấy tất cả phương thức trong một danh mục, đã sắp xếp theo order */
export function getMethodsByCategory(category: PaymentCategory): PaymentMethodConfig[] {
  return PAYMENT_METHODS.filter((m) => m.category === category && !m.disabled).sort(
    (a, b) => a.order - b.order
  );
}

/** Helper: Lấy danh mục của một groupKey */
export function getCategoryOfGroup(groupKey: string): PaymentCategory | undefined {
  return METHOD_CATEGORY_MAP[groupKey];
}

/** Helper: Mapping groupKey -> gateway route (cho navigation) */
export const GATEWAY_ROUTE_BY_GROUP: Record<string, string> = {
  vnpay_qr: 'qr',
  vietqr: 'qr',
  vnpay_dom: 'qr',
  napas: 'napas',
  card: 'card',
  applepay: 'card',
  googlepay: 'card',
  momo: 'ewallet',
  zalopay: 'ewallet',
  skypay: 'skypoint',
  movi: 'movi',
};

export function getGatewayRoute(groupKey: string): string {
  return GATEWAY_ROUTE_BY_GROUP[groupKey] || 'qr';
}

/** Default groupKey từ URL param */
export function getDefaultGroupFromUrl(): string {
  if (typeof window === 'undefined') return 'vnpay_qr';
  const param = new URLSearchParams(window.location.search).get('method');
  // Map legacy params
  if (param === 'card') return 'card';
  if (param === 'bank') return 'napas';
  if (param === 'wallet') return 'momo';
  if (param === 'skypoint') return 'skypay';
  return param || 'vnpay_qr';
}

/** Default paymentMethod từ groupKey */
export function getDefaultPaymentMethod(groupKey: string): PaymentMethod {
  const method = getPaymentMethod(groupKey);
  return method?.paymentMethod || 'vietqr';
}
