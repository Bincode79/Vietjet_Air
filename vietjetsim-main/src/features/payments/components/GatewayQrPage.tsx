'use client';
import React from 'react';
import Link from 'next/link';
import { Icon } from '@/shared/components/ui';
import VietQrBox from '@/features/payments/components/VietQrBox';

const METHOD_BADGE: Record<string, string> = {
  qr: 'bg-blue-50 border-blue-200 text-vj-bank-blue',
  card: 'bg-red-50 border-red-200 text-primary',
  napas: 'bg-blue-50 border-blue-200 text-vj-bank-blue',
  ewallet: 'bg-purple-50 border-purple-200 text-vj-purple',
  skypoint: 'bg-indigo-50 border-indigo-200 text-vj-indigo',
  movi: 'bg-amber-50 border-amber-200 text-amber-800',
  wallet: 'bg-green-50 border-green-200 text-vj-green',
  bank: 'bg-blue-50 border-blue-200 text-vj-bank-blue',
};

interface GatewayQrPageProps {
  method: string;
  bookingId: string;
  bookingCode?: string | null;
  amount: number;
  onBack: () => void;
  discountCode?: string | null;
}

export default function GatewayQrPage({
  method,
  bookingId,
  bookingCode,
  amount,
  onBack,
  discountCode,
}: GatewayQrPageProps) {
  const badgeClass = METHOD_BADGE[method] || 'bg-blue-50 border-blue-200 text-vj-bank-blue';
  const effectiveNote = `VJ ${bookingCode || 'DATVE'}`;

  return (
    <div className="w-full max-w-[420px] mx-auto space-y-3.5 font-koho animate-fadeIn">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Link
          href="/thanh-toan"
          onClick={(e) => {
            e.preventDefault();
            onBack();
          }}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline transition-colors"
        >
          <Icon name="ArrowLeftIcon" size={14} /> Quay lại chọn phương thức
        </Link>
      </div>

      {/* Method title */}
      <div className="text-center">
        <div
          className={`inline-flex items-center gap-2 px-5 py-1.5 rounded-full border ${badgeClass} text-sm sm:text-base font-black uppercase tracking-wider shadow-2xs`}
        >
          <Icon name="QrCodeIcon" size={20} />
          CỔNG THANH TOÁN
        </div>
      </div>

      {/* QR Code */}
      <div className="w-full">
        <VietQrBox
          bookingId={bookingId}
          fallbackAmount={amount}
          fallbackPnr={bookingCode || 'VJ'}
          fallbackAddInfo={effectiveNote}
          methodType="vietqr"
          variant="full"
          hideGatewayHeader={false}
          hidePaymentDetails={false}
          hidePollStatus
          hideSteps
          hideScanGuide
          discountCode={discountCode}
        />
      </div>

      {/* Action buttons */}
      <div className="border-t border-vj-border-light pt-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <button
            type="button"
            className="w-full py-2.5 px-3 bg-gradient-to-b from-amber-300 via-yellow-400 to-amber-500 text-black font-bold rounded-vj hover:from-amber-200 hover:via-yellow-300 hover:to-amber-400 transition-all active:scale-98 shadow-sm border border-amber-600/30 inline-flex items-center justify-center gap-1.5 text-xs uppercase tracking-wider cursor-pointer"
          >
            <Icon name="CheckCircleIcon" size={16} />
            Đã thanh toán
          </button>
          <button
            type="button"
            className="w-full py-2.5 px-3 bg-vj-navy text-white font-bold rounded-vj hover:bg-vjnavy-dark transition-all active:scale-98 shadow-2xs inline-flex items-center justify-center gap-1.5 text-xs uppercase tracking-wider cursor-pointer"
          >
            <Icon name="ArrowUpTrayIcon" size={16} />
            Tải ảnh lên
          </button>
        </div>
      </div>

      {/* Polling status */}
      <div className="flex items-center justify-center gap-1.5 pt-1 text-3xs font-medium text-vj-gray">
        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        <span>Hệ thống đang kiểm tra giao dịch thanh toán…</span>
      </div>
    </div>
  );
}
