'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/shared/components/ui';
import VietQrBox from '@/features/payments/components/VietQrBox';

const METHOD_LABELS: Record<string, string> = {
  qr: 'VNPAY-QR • VietQR',
  card: 'Thẻ tín dụng / ghi nợ quốc tế',
  napas: 'Thẻ ATM nội địa Napas',
  ewallet: 'Ví điện tử (MoMo / ZaloPay)',
  skypoint: 'SkyJoy / Ví SkyPoint',
  movi: 'Trả góp sau (MOVI)',
  wallet: 'Ví Vietjet Air',
  bank: 'Chuyển khoản ngân hàng',
};

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
  flightNo?: string;
  from?: string;
  to?: string;
  departTime?: string;
  date?: string;
}

export default function GatewayQrPage({
  method,
  bookingId,
  bookingCode,
  amount,
  onBack,
  flightNo,
  from,
  to,
  departTime,
  date,
}: GatewayQrPageProps) {
  const [copiedNote, setCopiedNote] = useState(false);
  const label = METHOD_LABELS[method] || 'Thanh toán';
  const badgeClass = METHOD_BADGE[method] || 'bg-blue-50 border-blue-200 text-vj-bank-blue';
  const effectiveNote = `VJ ${bookingCode || 'DATVE'}`;

  const handleCopyNote = () => {
    navigator.clipboard.writeText(effectiveNote);
    setCopiedNote(true);
    setTimeout(() => setCopiedNote(false), 2000);
  };

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
      <div className="text-center space-y-2">
        <div
          className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border ${badgeClass} text-xs font-bold font-koho uppercase tracking-wider`}
        >
          <Icon name="QrCodeIcon" size={16} />
          CỔNG THANH TOÁN
        </div>
        <h2 className="text-xl sm:text-2xl font-black text-vj-text font-koho">{label}</h2>
        <p className="text-xs sm:text-sm text-vj-gray max-w-md mx-auto">
          Quét mã QR hoặc sao chép nội dung chuyển khoản để hoàn tất thanh toán đơn
          {bookingCode || bookingId}.
        </p>
      </div>
      {/* Order details */}
      {bookingCode || flightNo || from || to ? (
        <div className="bg-white rounded-2xl border border-vj-border-light p-4 sm:p-5 shadow-vj-sm space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-vj-text-strong uppercase tracking-wider font-koho mb-1">
            <Icon name="TicketIcon" size={14} />
            Chi tiết đơn hàng
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
            <div>
              <span className="text-vj-gray block text-3xs uppercase tracking-wider">
                Mã đặt chỗ
              </span>
              <span className="font-bold">{bookingCode || bookingId}</span>
            </div>
            {flightNo && (
              <div>
                <span className="text-vj-gray block text-3xs uppercase tracking-wider">
                  Chuyến bay
                </span>
                <span className="font-bold">{flightNo}</span>
              </div>
            )}
            {from && to && (
              <div>
                <span className="text-vj-gray block text-3xs uppercase tracking-wider">
                  Tuyến bay
                </span>
                <span className="font-bold">
                  {from} → {to}
                </span>
              </div>
            )}
            {departTime && date && (
              <div>
                <span className="text-vj-gray block text-3xs uppercase tracking-wider">
                  Giờ bay
                </span>
                <span className="font-bold">
                  {departTime}, {date}
                </span>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* QR Code */}
      <div className="flex justify-center">
        <div className="w-full max-w-md">
          <VietQrBox
            bookingId={bookingId}
            fallbackAmount={amount}
            fallbackPnr={bookingCode || 'VJ'}
            fallbackAddInfo={effectiveNote}
            methodType="vietqr"
          />
        </div>
      </div>

      {/* Transfer Note */}
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
        <div className="font-mono text-base font-extrabold text-amber-950 bg-white/80 px-3 py-2 rounded-vj border border-amber-200 tracking-wider text-center select-all">
          {effectiveNote}
        </div>
        <p className="text-3xs text-amber-800 text-center">
          * Vui lòng giữ nguyên nội dung trên để hệ thống tự động gạch nợ và xuất vé ngay lập tức.
        </p>
      </div>

      {/* Amount summary */}
      <div className="bg-white rounded-2xl border border-vj-border-light p-5 sm:p-6 shadow-vj-sm">
        <div className="flex justify-between items-center mb-1">
          <span className="text-sm font-bold text-vj-text-dim uppercase">Tổng thanh toán</span>
          <span className="text-lg font-black text-primary">
            {amount.toLocaleString('vi-VN')} ₫
          </span>
        </div>
      </div>

      {/* 3 Steps */}
      <div className="border-t border-vj-border-light pt-5">
        <h3 className="text-xs font-bold text-vj-text-strong uppercase tracking-wider font-koho mb-3 text-center">
          3 bước thanh toán đơn giản
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
          <div className="bg-vj-surface-2 rounded-vj p-3 border border-vj-border-light">
            <div className="w-7 h-7 rounded-full bg-primary/10 text-primary font-bold text-xs flex items-center justify-center mx-auto mb-1.5 font-koho">
              1
            </div>
            <div className="text-xs font-bold text-vj-text-strong">Mở ứng dụng</div>
            <div className="text-3xs text-vj-gray mt-0.5">
              Mở App Ngân hàng hoặc Ví điện tử của bạn
            </div>
          </div>
          <div className="bg-vj-surface-2 rounded-vj p-3 border border-vj-border-light">
            <div className="w-7 h-7 rounded-full bg-primary/10 text-primary font-bold text-xs flex items-center justify-center mx-auto mb-1.5 font-koho">
              2
            </div>
            <div className="text-xs font-bold text-vj-text-strong">Quét mã QR</div>
            <div className="text-3xs text-vj-gray mt-0.5">
              Chọn tính năng Quét mã QR và quét mã ở trên
            </div>
          </div>
          <div className="bg-vj-surface-2 rounded-vj p-3 border border-vj-border-light">
            <div className="w-7 h-7 rounded-full bg-primary/10 text-primary font-bold text-xs flex items-center justify-center mx-auto mb-1.5 font-koho">
              3
            </div>
            <div className="text-xs font-bold text-vj-text-strong">Xác nhận</div>
            <div className="text-3xs text-vj-gray mt-0.5">
              Kiểm tra số tiền và xác thực chuyển tiền
            </div>
          </div>
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
