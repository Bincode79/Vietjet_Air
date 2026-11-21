'use client';
import React from 'react';
import { Icon } from '@/shared/components/ui';
import type { PaymentMethodConfig, PaymentCategory } from '@/features/payments/config/paymentMethods';
import type { ComponentType } from 'react';

interface PaymentMethodCardProps {
  method: PaymentMethodConfig;
  isSelected: boolean;
  onSelect: () => void;
  /** ClassName bổ sung cho card */
  className?: string;
}

/** Component hiển thị logo động (lazy load) */
const DynamicLogo = ({ logo, className }: { logo: ComponentType<{ className?: string }>; className?: string }) => {
  const LogoComponent = logo;
  return <LogoComponent className={className} />;
};

/**
 * Card phương thức thanh toán thống nhất.
 * Dùng chung cho tất cả các nhóm: cards_banks, ewallets, loyalty, installments.
 */
export default function PaymentMethodCard({ method, isSelected, onSelect, className }: PaymentMethodCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`
        p-2.5 sm:p-3 rounded-vj border flex flex-col justify-between text-left transition-all cursor-pointer
        min-h-[92px] sm:min-h-[96px] relative overflow-hidden active:scale-[0.98]
        ${isSelected
          ? 'border-2 border-primary bg-[rgb(var(--vj-red-rgb))]/10 shadow-xs'
          : 'border-vj-border-light hover:border-vj-line bg-white'}
        ${className || ''}
      `}
      aria-pressed={isSelected}
      aria-label={method.ariaLabel || method.label}
    >
      {/* Badge "Khuyên dùng" */}
      {method.recommended && (
        <div className="absolute top-0 right-0 bg-primary text-white text-4xs font-black px-1.5 py-0.5 rounded-bl-md uppercase tracking-wider flex items-center gap-0.5">
          <span>✓ </span>
          <span>Khuyên dùng</span>
        </div>
      )}

      {/* Checkmark cho các method khác */}
      {isSelected && !method.recommended && (
        <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-primary text-white flex items-center justify-center text-4xs font-bold shadow-xs">
          ✓
        </div>
      )}

      {/* Logo */}
      <div className="flex items-center h-8">
        <DynamicLogo logo={method.logo} className={method.logoClassName} />
      </div>

      {/* Label */}
      <span className="text-xs font-bold text-vj-text mt-2 line-clamp-2 leading-tight">
        {method.label}
      </span>

      {/* Subtitle / Badge phụ (ví dụ: "Bay trước, trả sau") */}
      {method.subtitle && (
        <span className="text-4xs text-vj-gray font-medium block mt-0.5">
          {method.subtitle}
        </span>
      )}
      {method.badge && !method.subtitle && (
        <span className="text-4xs text-vj-gray font-medium block mt-0.5">
          {method.badge}
        </span>
      )}
    </button>
  );
}

/**
 * Component render một danh mục phương thức thanh toán.
 * Dùng chung cho PaymentClient.
 */
interface PaymentCategorySectionProps {
  category: PaymentCategory;
  title: string;
  methods: PaymentMethodConfig[];
  selectedGroup: string;
  onSelect: (groupKey: string) => void;
  /** ClassName cho grid container */
  gridClassName?: string;
}

export function PaymentCategorySection({
  category,
  title,
  methods,
  selectedGroup,
  onSelect,
  gridClassName = 'grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-2.5',
}: PaymentCategorySectionProps) {
  if (methods.length === 0) return null;

  return (
    <div className="mb-4 sm:mb-5">
      <h3 className="text-xs sm:text-sm font-bold font-koho uppercase text-vj-text tracking-wide mb-2 sm:mb-2.5">
        {title}
      </h3>
      <div className={gridClassName}>
        {methods.map(method => (
          <PaymentMethodCard
            key={method.groupKey}
            method={method}
            isSelected={selectedGroup === method.groupKey}
            onSelect={() => onSelect(method.groupKey)}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Footer bảo mật - chỉ hiện khi KHÔNG phải MOVI (matching Image #1)
 */
interface SecurityFooterProps {
  hideOnMovi?: boolean;
  isMovi?: boolean;
}

export function SecurityFooter({ hideOnMovi = true, isMovi = false }: SecurityFooterProps) {
  if (hideOnMovi && isMovi) return null;

  return (
    <>
      {/* Security logos */}
      <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 py-3 text-center">
        <span className="text-3xs font-bold text-vj-gray uppercase tracking-wider w-full sm:w-auto">
          Được bảo vệ bởi
        </span>
        <div className="flex items-center gap-2 sm:gap-3">
          <img src="/images/payment/visa-secure.png" alt="Visa Secure" height={20} className="opacity-70 hover:opacity-100 transition-opacity" />
          <img src="/images/payment/mastercard-secure.png" alt="Mastercard SecureCode" height={20} className="opacity-70 hover:opacity-100 transition-opacity" />
          <img src="/images/payment/jcb-secure.png" alt="JCB J/Secure" height={20} className="opacity-70 hover:opacity-100 transition-opacity" />
          <img src="/images/payment/amex-safekey.png" alt="Amex SafeKey" height={20} className="opacity-70 hover:opacity-100 transition-opacity" />
          <img src="/images/payment/3d-secure.png" alt="3D Secure" height={20} className="opacity-70 hover:opacity-100 transition-opacity" />
          <img src="/images/payment/pci-dss.png" alt="PCI DSS" height={20} className="opacity-70 hover:opacity-100 transition-opacity" />
        </div>
      </div>

      {/* Security note */}
      <div className="flex items-center gap-3 bg-[rgb(var(--vj-green-rgb))]/10 border border-[rgb(var(--vj-green-rgb))]/30 rounded-vj p-4 text-sm text-[var(--vj-green)]">
        <Icon name="ShieldCheckIcon" size={20} className="text-[var(--vj-green)] flex-shrink-0" />
        <span>
          Thanh toán được bảo mật bằng mã hóa SSL 256-bit. Thông tin thẻ của bạn an toàn tuyệt đối.
        </span>
      </div>
    </>
  );
}