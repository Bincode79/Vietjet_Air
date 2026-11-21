'use client';
import { useState, useCallback, useMemo } from 'react';
import type { PaymentMethod } from '@/features/payments/types';
import {
  PAYMENT_METHODS,
  PAYMENT_CATEGORIES,
  getPaymentMethod,
  getDefaultGroupFromUrl,
  getDefaultPaymentMethod,
  getGatewayRoute,
  type PaymentCategory,
  type PaymentMethodConfig,
} from '@/features/payments/config/paymentMethods';

/**
 * Hook quản lý state phương thức thanh toán.
 * Tách biệt logic nhóm (selectedMethodGroup) và loại API (paymentMethod).
 * Cung cấp helper render theo danh mục gọn gàng.
 */
export function usePaymentMethod() {
  // Group key (vnpay_qr, vietqr, card, momo, movi, etc.)
  const [selectedMethodGroup, setSelectedMethodGroup] = useState<string>(() =>
    getDefaultGroupFromUrl()
  );

  // Payment method type gửi cho API (vietqr, card, bank, e_wallet, movi, skypoint)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(() =>
    getDefaultPaymentMethod(getDefaultGroupFromUrl())
  );

  // Sync paymentMethod khi selectedMethodGroup thay đổi
  const selectMethod = useCallback((groupKey: string) => {
    const methodConfig = getPaymentMethod(groupKey);
    if (!methodConfig) return;

    setSelectedMethodGroup(groupKey);
    setPaymentMethod(methodConfig.paymentMethod);
  }, []);

  // Computed: phương thức hiện tại được chọn
  const currentMethod = useMemo(() => getPaymentMethod(selectedMethodGroup), [selectedMethodGroup]);

  // Computed: nhóm phương thức theo danh mục để render
  const methodsByCategory = useMemo(() => {
    const map: Record<PaymentCategory, PaymentMethodConfig[]> = {
      cards_banks: [],
      ewallets: [],
      loyalty: [],
      installments: [],
    };
    PAYMENT_METHODS.forEach((m) => {
      if (!m.disabled) {
        map[m.category].push(m);
      }
    });
    // Sắp xếp theo order
    Object.keys(map).forEach((key) => {
      map[key as PaymentCategory].sort((a, b) => a.order - b.order);
    });
    return map;
  }, []);

  // Computed: categories có method enabled
  const activeCategories = useMemo(
    () => PAYMENT_CATEGORIES.filter((cat) => methodsByCategory[cat.key].length > 0),
    [methodsByCategory]
  );

  // Gateway route cho method hiện tại
  const gatewayRoute = useMemo(() => getGatewayRoute(selectedMethodGroup), [selectedMethodGroup]);

  // Kiểm tra method có phải MOVI (trả góp)
  const isMovi = selectedMethodGroup === 'movi';

  // Kiểm tra method có phải card-type (applepay, googlepay, card)
  const isCardType = useMemo(() => {
    return ['card', 'applepay', 'googlepay'].includes(selectedMethodGroup);
  }, [selectedMethodGroup]);

  // Kiểm tra method có phải QR-type
  const isQrType = useMemo(() => {
    return ['vnpay_qr', 'vietqr', 'vnpay_dom'].includes(selectedMethodGroup);
  }, [selectedMethodGroup]);

  // Kiểm tra method có phải e-wallet
  const isEwalletType = useMemo(() => {
    return ['momo', 'zalopay'].includes(selectedMethodGroup);
  }, [selectedMethodGroup]);

  return {
    // State
    selectedMethodGroup,
    paymentMethod,
    currentMethod,
    isMovi,
    isCardType,
    isQrType,
    isEwalletType,

    // Actions
    selectMethod,
    setSelectedMethodGroup,
    setPaymentMethod,

    // Computed for rendering
    methodsByCategory,
    activeCategories,
    gatewayRoute,

    // Helpers
    getMethodsByCategory: (cat: PaymentCategory) => methodsByCategory[cat] || [],
    getCategoryConfig: (cat: PaymentCategory) => PAYMENT_CATEGORIES.find((c) => c.key === cat),
  };
}

/** Hook đơn giản chỉ để lấy config method (dùng cho component gateway) */
export function usePaymentMethodConfig(groupKey: string) {
  return useMemo(() => getPaymentMethod(groupKey), [groupKey]);
}
