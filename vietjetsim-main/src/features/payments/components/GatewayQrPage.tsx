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
}

export default function GatewayQrPage({
  method,
  bookingId,
  bookingCode,
  amount,
  onBack,
}: GatewayQrPageProps) {
  const badgeClass = METHOD_BADGE[method] || 'bg-blue-50 border-blue-200 text-vj-bank-blue';
  const effectiveNote = `VJ ${bookingCode || 'DATVE'}`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <Link
          href="/thanh-toan"
          onClick={(e) => {
            e.preventDefault();
            onBack();
          }}
          className="inline-flex items-center gap-2 text-sm font-bold text-primary hover:underline"
        >
          <Icon name="ArrowLeftIcon" size={16} /> Quay lại chọn phương thức
        </Link>
      </div>

      {/* Method title */}
      <div className="text-center space-y-3">
        <div
          className={`inline-flex items-center gap-2 px-5 py-2 rounded-full border ${badgeClass} text-base sm:text-lg font-black font-koho uppercase tracking-wider`}
        >
          <Icon name="QrCodeIcon" size={24} />
          CỔNG THANH TOÁN
        </div>
      </div>

      {/* QR Code */}
      <div className="flex justify-center">
        <div className="w-full max-w-md">
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
          />
        </div>
      </div>

      {/* Action buttons */}
      <div className="border-t border-vj-border-light pt-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            className="w-full py-3.5 px-4 bg-gradient-to-b from-emerald-500 via-green-600 to-green-700 text-white font-black font-koho rounded-vj hover:from-emerald-400 hover:via-green-500 hover:to-green-600 transition-all active:scale-98 shadow-lg shadow-green-600/40 border border-green-800/30"
          >
            <Icon name="CheckCircleIcon" size={20} className="mr-2" />
            Đã xác nhận thanh toán
          </button>
          <button
            type="button"
            className="w-full py-3 px-4 bg-vj-navy text-white font-bold font-koho rounded-vj hover:bg-vj-navy-2 transition-all active:scale-98 shadow-vj-sm"
          >
            <Icon name="ArrowUpTrayIcon" size={20} className="mr-2" />
            Tải ảnh lên
          </button>
        </div>
      </div>

      {/* Polling status */}
      <div className="flex items-center justify-center gap-2 pt-2 text-xs font-medium text-vj-gray font-koho">
        <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
        <span>Hệ thống đang kiểm tra giao dịch thanh toán…</span>
      </div>
    </div>
  );
}
