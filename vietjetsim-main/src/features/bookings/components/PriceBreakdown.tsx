'use client';

import { formatCurrency, formatNumber } from '@/lib/utils';

interface PriceBreakdownProps {
  baseFare: number;
  taxes?: number;
  serviceFee?: number;
  insuranceFee?: number;
  discount?: number;
  loyaltyPoints?: number;
  seatCount?: number;
  currency?: string;
  className?: string;
}

export function PriceBreakdown({
  baseFare,
  taxes = 0,
  serviceFee = 0,
  insuranceFee = 0,
  discount = 0,
  loyaltyPoints = 0,
  seatCount = 1,
  currency = 'VND',
  className = '',
}: PriceBreakdownProps) {
  const subtotal = baseFare;
  const totalFees = taxes + serviceFee + insuranceFee;
  const totalBeforeDiscount = subtotal + totalFees;
  const grandTotal = Math.max(0, totalBeforeDiscount - discount);

  return (
    <div className={`bg-white rounded-vj border border-vj-border-light p-4 ${className}`}>
      <h3 className="text-lg font-semibold text-vj-text mb-4">Chi tiết giá vé</h3>

      <div className="space-y-3">
        {/* Base Fare */}
        <div className="flex justify-between items-center text-sm">
          <span className="text-vj-text-strong">
            Giá vé cơ bản
            {seatCount > 1 && <span className="text-vj-muted"> ({seatCount} ghế)</span>}
          </span>
          <span className="text-vj-text font-medium">{formatCurrency(subtotal, currency)}</span>
        </div>

        {/* Taxes */}
        {taxes > 0 && (
          <div className="flex justify-between items-center text-sm">
            <span className="text-vj-text-strong">Thuế và phí sân bay</span>
            <span className="text-vj-text">{formatCurrency(taxes, currency)}</span>
          </div>
        )}

        {/* Service Fee */}
        {serviceFee > 0 && (
          <div className="flex justify-between items-center text-sm">
            <span className="text-vj-text-strong">Phí dịch vụ</span>
            <span className="text-vj-text">{formatCurrency(serviceFee, currency)}</span>
          </div>
        )}

        {/* Insurance */}
        {insuranceFee > 0 && (
          <div className="flex justify-between items-center text-sm">
            <span className="text-vj-text-strong">Phí bảo hiểm</span>
            <span className="text-vj-text">{formatCurrency(insuranceFee, currency)}</span>
          </div>
        )}

        {/* Divider */}
        <div className="border-t border-vj-border-light my-2" />

        {/* Subtotal */}
        <div className="flex justify-between items-center text-sm font-medium">
          <span className="text-vj-text-dim">Tổng phụ</span>
          <span className="text-vj-text">{formatCurrency(totalBeforeDiscount, currency)}</span>
        </div>

        {/* Discount */}
        {discount > 0 && (
          <div className="flex justify-between items-center text-sm">
            <span className="text-green-600 flex items-center gap-1">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M5 2a2 2 0 00-2 2v14l3.5-2 3.5 2 3.5-2 3.5 2V4a2 2 0 00-2-2H5zm2.5 3a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm6.207.293a1 1 0 00-1.414 0l-6 6a1 1 0 101.414 1.414l6-6a1 1 0 000-1.414zM12.5 10a1.5 1.5 0 100 3 1.5 1.5 0 000-3z"
                  clipRule="evenodd"
                />
              </svg>
              Mã giảm giá
            </span>
            <span className="text-green-600">-{formatCurrency(discount, currency)}</span>
          </div>
        )}

        {/* Loyalty Points Earned */}
        {loyaltyPoints > 0 && (
          <div className="flex justify-between items-center text-sm bg-blue-50/20 rounded-vj p-2 -mx-2">
            <span className="text-vj-blue flex items-center gap-1">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              Điểm tích lũy
            </span>
            <span className="text-vj-blue font-medium">+{formatNumber(loyaltyPoints)} điểm</span>
          </div>
        )}

        {/* Grand Total */}
        <div className="border-t border-vj-border-light pt-3 mt-3">
          <div className="flex justify-between items-center">
            <span className="text-lg font-semibold text-vj-text">Tổng cộng</span>
            <span className="text-xl font-bold text-vj-blue">
              {formatCurrency(grandTotal, currency)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
