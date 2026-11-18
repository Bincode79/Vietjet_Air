'use client';
import React, { useState } from 'react';
import VietQrBox from '@/features/payments/components/VietQrBox';
import { Icon } from '@/shared/components/ui';

interface Props {
  bookingId: string;
  bookingCode?: string;
  amount: number;
  transferNote?: string;
  onSuccess: () => void;
  methodType?: 'vnpay_qr' | 'vietqr';
}

export default function QrGatewayContent({
  bookingId,
  bookingCode,
  amount,
  transferNote,
  onSuccess,
  methodType = 'vnpay_qr',
}: Props) {
  const [copiedNote, setCopiedNote] = useState(false);

  const effectiveNote = transferNote || (bookingCode ? `VJ ${bookingCode}` : 'VJ DATVE');

  const handleCopyNote = () => {
    navigator.clipboard.writeText(effectiveNote);
    setCopiedNote(true);
    setTimeout(() => setCopiedNote(false), 2000);
  };

  const isVnPay = methodType === 'vnpay_qr';

  return (
    <div className="max-w-2xl mx-auto py-6 px-4">
      <div className="bg-white rounded-3xl border border-gray-200/90 p-5 sm:p-8 shadow-sm space-y-6">
        {/* Gateway Title & Badges */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-vj-bank-blue text-xs font-bold font-koho uppercase tracking-wider">
            <Icon name="QrCodeIcon" size={16} />
            {isVnPay
              ? 'CỔNG THANH TOÁN VNPAY-QR • NAPAS 247'
              : 'CỔNG THANH TOÁN VIETQR • NAPAS 247'}
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-gray-900 font-koho">
            Quét mã QR để hoàn tất đặt vé
          </h2>
          <p className="text-xs sm:text-sm text-gray-500 max-w-md mx-auto">
            Hỗ trợ 40+ ứng dụng ngân hàng và Ví điện tử. Hệ thống tự động xác nhận và xuất vé ngay
            khi nhận được thanh toán.
          </p>
        </div>

        {/* QR Code Container */}
        <div className="flex justify-center">
          <div className="w-full max-w-md">
            <VietQrBox
              bookingId={bookingId}
              onPaid={onSuccess}
              fallbackAmount={amount}
              fallbackPnr={bookingCode || 'VJ'}
              fallbackAddInfo={effectiveNote}
              methodType={methodType}
            />
          </div>
        </div>

        {/* Important Transfer Note */}
        <div className="bg-amber-50/80 rounded-2xl border border-amber-200/90 p-4 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-bold text-amber-900 font-koho flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping inline-block" />
              Nội dung chuyển khoản bắt buộc:
            </span>
            <button
              type="button"
              onClick={handleCopyNote}
              className="text-2xs font-bold text-amber-800 bg-amber-200/60 hover:bg-amber-200 px-2.5 py-1 rounded transition-colors cursor-pointer"
            >
              {copiedNote ? '✓ Đã chép' : 'Sao chép nội dung'}
            </button>
          </div>
          <div className="font-mono text-base font-extrabold text-amber-950 bg-white/80 px-3 py-2 rounded-lg border border-amber-200 tracking-wider text-center select-all">
            {effectiveNote}
          </div>
          <p className="text-3xs text-amber-800 text-center">
            * Vui lòng giữ nguyên nội dung trên để hệ thống tự động gạch nợ và xuất vé ngay lập tức.
          </p>
        </div>

        {/* 3 Step Instructions */}
        <div className="border-t border-gray-100 pt-5">
          <h3 className="text-xs font-bold text-gray-800 uppercase tracking-wider font-koho mb-3 text-center">
            3 bước thanh toán đơn giản
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
            <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
              <div className="w-7 h-7 rounded-full bg-primary/10 text-primary font-bold text-xs flex items-center justify-center mx-auto mb-1.5 font-koho">
                1
              </div>
              <div className="text-xs font-bold text-gray-800">Mở ứng dụng</div>
              <div className="text-3xs text-gray-500 mt-0.5">
                Mở App Ngân hàng hoặc Ví điện tử của bạn
              </div>
            </div>

            <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
              <div className="w-7 h-7 rounded-full bg-primary/10 text-primary font-bold text-xs flex items-center justify-center mx-auto mb-1.5 font-koho">
                2
              </div>
              <div className="text-xs font-bold text-gray-800">Quét mã QR</div>
              <div className="text-3xs text-gray-500 mt-0.5">
                Chọn tính năng Quét mã QR và quét mã ở trên
              </div>
            </div>

            <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
              <div className="w-7 h-7 rounded-full bg-primary/10 text-primary font-bold text-xs flex items-center justify-center mx-auto mb-1.5 font-koho">
                3
              </div>
              <div className="text-xs font-bold text-gray-800">Xác nhận</div>
              <div className="text-3xs text-gray-500 mt-0.5">
                Kiểm tra số tiền và xác thực chuyển tiền
              </div>
            </div>
          </div>
        </div>

        {/* Polling Pulse Status */}
        <div className="flex items-center justify-center gap-2 pt-2 text-xs font-medium text-gray-500 font-koho">
          <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
          <span>Hệ thống đang tự động lắng nghe giao dịch 24/7...</span>
        </div>
      </div>
    </div>
  );
}
