'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/shared/components/ui';

interface Passenger {
  name: string;
  seat?: string;
  type?: string;
  baggage?: string;
  idNumber?: string;
  phone?: string;
  email?: string;
}

interface BookingTicketCardProps {
  flightNo?: string;
  from?: string;
  to?: string;
  fromCity?: string;
  toCity?: string;
  departTime?: string;
  arriveTime?: string;
  date?: string;
  bookingCode?: string | null; // kept for API compatibility
  passengers?: Passenger[];
  fareClass?: string;
  ancillaries?: string[];
  fareSubtotal?: number;
  tax?: number;
  seatFee?: number;
  ancillaryFee?: number;
  total?: number;
  terminal?: string;
  aircraft?: string;
  duration?: string;
  contactEmail?: string;
  contactPhone?: string;
  onOpenDetails?: () => void;
  // Chi tiết giá & thanh toán props
  promoCode?: string;
  onPromoCodeChange?: (code: string) => void;
  onApplyPromo?: () => void;
  isApplyingPromo?: boolean;
  promoApplied?: boolean;
  promoData?: { code: string; type?: string; value: number } | null;
  promoError?: string;
  discountAmount?: number;
  taxRate?: number;
}

export default function BookingTicketCard({
  flightNo = 'VJ134',
  from = 'SGN',
  to = 'HAN',
  fromCity = 'Tp. Hồ Chí Minh',
  toCity = 'Hà Nội',
  departTime = '05:00',
  arriveTime = '07:10',
  date = 'T2, 30/11/2026',
  bookingCode: _bookingCode, // kept for API compatibility
  passengers = [],
  fareClass = 'Eco',
  ancillaries = ['Hành lý xách tay 7kg'],
  fareSubtotal = 1738800,
  tax = 581581,
  seatFee = 259200,
  ancillaryFee = 44000,
  total = 2677581,
  terminal = 'Nhà ga 1',
  aircraft = 'A321',
  duration = '2 giờ 10 phút',
  onOpenDetails,
  promoCode = '',
  onPromoCodeChange,
  onApplyPromo,
  isApplyingPromo = false,
  promoApplied = false,
  promoData,
  promoError = '',
  discountAmount = 0,
  taxRate = 0.15,
}: BookingTicketCardProps) {
  const [showFlightInfo, setShowFlightInfo] = useState(true);
  const [showPriceDetails, setShowPriceDetails] = useState(true);
  const [showFareSub, setShowFareSub] = useState(false);
  const [showTaxSub, setShowTaxSub] = useState(false);
  const [showServiceSub, setShowServiceSub] = useState(false);

  // Tính tổng chuyến đi = giá vé + thuế phí + dịch vụ ghế
  const outboundTotal = fareSubtotal + tax + seatFee;

  return (
    <div className="bg-white rounded-vj border border-vj-border-light shadow-vj-sm overflow-hidden transition-all">
      {/* 1. Header bar: Red with "THÔNG TIN ĐẶT CHỖ" and "Chi Tiết" pill */}
      <div className="bg-vj-red-dark px-3 sm:px-4 py-2.5 sm:py-3 text-white flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="font-koho text-xs sm:text-base font-bold uppercase tracking-wide text-white truncate">
            THÔNG TIN ĐẶT CHỖ
          </h3>
          {_bookingCode && _bookingCode !== '—' && (
            <span className="text-3xs bg-white/20 text-white font-mono font-bold px-2 py-0.5 rounded">
              {_bookingCode}
            </span>
          )}
        </div>
        {onOpenDetails && (
          <button
            type="button"
            onClick={onOpenDetails}
            className="bg-vj-yellow hover:bg-vj-yellow text-black font-black text-3xs uppercase px-2.5 sm:px-3 py-1 rounded-full shadow-2xs transition-transform active:scale-98 cursor-pointer font-koho shrink-0"
          >
            Chi Tiết
          </button>
        )}
      </div>

      {/* 2. Accordion: Thông tin chuyến bay (Chuyến đi) */}
      <div className="border-b border-vj-border-light/90">
        <div
          className="bg-vj-bar-gray hover:bg-vj-surface-3/80 px-3 sm:px-4 py-2.5 flex items-center justify-between cursor-pointer transition-colors select-none gap-2"
          onClick={() => setShowFlightInfo(!showFlightInfo)}
        >
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
            <span className="font-koho text-xs sm:text-sm font-bold text-vj-text-strong truncate">
              Chuyến bay: {from} ➔ {to}
            </span>
            <span className="text-3xs bg-red-100 text-red-700 font-bold px-1.5 py-0.5 rounded shrink-0">
              {flightNo}
            </span>
          </div>
          <div className="flex items-center gap-1 sm:gap-1.5 font-bold font-koho text-xs sm:text-sm shrink-0">
            <span className="text-vj-red-dark">{outboundTotal.toLocaleString('vi-VN')} VND</span>
            <span className="text-3xs text-vj-muted">{showFlightInfo ? '▲' : '▼'}</span>
          </div>
        </div>

        {showFlightInfo && (
          <div className="p-3 sm:p-4 bg-white text-xs space-y-3 border-t border-vj-border-light">
            {/* Chi tiết lộ trình & số hiệu chuyến bay */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 sm:gap-2 pb-2 border-b border-gray-100">
              <div>
                <div className="font-bold text-gray-900 text-xs sm:text-sm">
                  Chuyến đi: {fromCity || from} ({from}) ➔ {toCity || to} ({to})
                </div>
                <div className="text-red-600 font-semibold text-2xs sm:text-xs mt-0.5">
                  Số hiệu chuyến bay: {flightNo} &nbsp;|&nbsp; Hạng: {fareClass}
                </div>
                {passengers && passengers.length > 0 && (
                  <div className="text-2xs text-gray-700 font-medium mt-1">
                    Hành khách: {passengers.map((p) => p.name).join(', ')}
                  </div>
                )}
              </div>
              <div className="text-2xs sm:text-xs text-left sm:text-right font-medium text-gray-500">
                Ngày bay: <span className="font-bold text-gray-800">{date}</span>
              </div>
            </div>

            {/* Chi tiết giờ khởi hành và giờ đến */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              <div className="bg-gray-50/90 rounded-lg p-2.5 border border-gray-100">
                <div className="text-red-600 font-bold text-xs flex items-center gap-1">
                  <span>* Khởi hành:</span>
                  <span className="text-gray-900 font-semibold">
                    {departTime}, {date}
                  </span>
                </div>
                <div className="text-gray-600 mt-1 pl-3 text-2xs sm:text-xs">
                  {fromCity || from} - Sân bay ({from}) {terminal ? `- ${terminal}` : ''}
                </div>
                <div className="text-3xs text-gray-400 pl-3">(Giờ địa phương)</div>
              </div>

              <div className="bg-gray-50/90 rounded-lg p-2.5 border border-gray-100">
                <div className="text-emerald-700 font-bold text-xs flex items-center gap-1">
                  <span>• Đến:</span>
                  <span className="text-gray-900 font-semibold">
                    {arriveTime}, {date}
                  </span>
                </div>
                <div className="text-gray-600 mt-1 pl-3 text-2xs sm:text-xs">
                  {toCity || to} - Sân bay ({to})
                </div>
                <div className="text-3xs text-gray-400 pl-3">(Giờ địa phương)</div>
              </div>
            </div>

            {/* Chi tiết máy bay & đơn vị khai thác */}
            <div className="text-gray-500 text-3xs pt-1 flex flex-wrap items-center justify-between gap-1 border-t border-gray-100">
              <span>Thời gian: {duration}</span>
              <span>Airbus: {aircraft}</span>
              <span>Khai thác bởi: Vietjet</span>
            </div>

            {/* Phân rã giá chuyến đi */}
            <div className="pt-2 border-t border-gray-100 space-y-1 text-3xs sm:text-xs">
              {/* Giá vé */}
              <div
                className="flex justify-between items-center text-vj-text-dim cursor-pointer hover:text-black py-1 border-t border-vj-border-light"
                onClick={() => setShowFareSub(!showFareSub)}
              >
                <span className="font-medium flex items-center gap-1">
                  Giá vé <span className="text-3xs text-vj-muted">{showFareSub ? '▲' : '▼'}</span>
                </span>
                <span className="font-semibold text-vj-text">
                  {fareSubtotal.toLocaleString('vi-VN')} VND
                </span>
              </div>
              {showFareSub && (
                <div className="pl-3 py-1.5 text-vj-gray text-3xs space-y-1 bg-vj-surface-2 rounded">
                  <div className="flex justify-between">
                    <span>Người lớn x {passengers.length || 1}</span>
                    <span>{fareSubtotal.toLocaleString('vi-VN')} VND</span>
                  </div>
                </div>
              )}

              {/* Thuế, phí */}
              <div
                className="flex justify-between items-center text-vj-text-dim cursor-pointer hover:text-black py-1 border-t border-vj-border-light"
                onClick={() => setShowTaxSub(!showTaxSub)}
              >
                <span className="font-medium flex items-center gap-1">
                  Thuế, phí <span className="text-3xs text-vj-muted">{showTaxSub ? '▲' : '▼'}</span>
                </span>
                <span className="font-semibold text-vj-text">
                  {tax.toLocaleString('vi-VN')} VND
                </span>
              </div>
              {showTaxSub && (
                <div className="pl-3 py-1.5 text-vj-gray text-3xs space-y-1 bg-vj-surface-2 rounded">
                  <div className="flex justify-between">
                    <span>Phí an ninh soi chiếu</span>
                    <span>{Math.round(tax * 0.15).toLocaleString('vi-VN')} VND</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Domestic airport tax</span>
                    <span>{Math.round(tax * 0.25).toLocaleString('vi-VN')} VND</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Phí quản trị hệ thống</span>
                    <span>{Math.round(tax * 0.45).toLocaleString('vi-VN')} VND</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Thuế VAT</span>
                    <span>{Math.round(tax * 0.15).toLocaleString('vi-VN')} VND</span>
                  </div>
                </div>
              )}

              {/* Dịch vụ */}
              <div
                className="flex justify-between items-center text-vj-text-dim cursor-pointer hover:text-black py-1 border-t border-vj-border-light"
                onClick={() => setShowServiceSub(!showServiceSub)}
              >
                <span className="font-medium flex items-center gap-1">
                  Dịch vụ ghế &amp; tiện ích{' '}
                  <span className="text-3xs text-vj-muted">{showServiceSub ? '▲' : '▼'}</span>
                </span>
                <span className="font-semibold text-vj-text">
                  {seatFee.toLocaleString('vi-VN')} VND
                </span>
              </div>
              {showServiceSub && (
                <div className="pl-3 py-1.5 text-vj-gray text-3xs space-y-1 bg-vj-surface-2 rounded">
                  <div className="flex justify-between">
                    <span>Phí chọn chỗ ngồi</span>
                    <span>{seatFee.toLocaleString('vi-VN')} VND</span>
                  </div>
                  {ancillaries.map((a, i) => (
                    <div key={i} className="flex justify-between text-vj-muted">
                      <span>• {a}</span>
                      <span>Đã bao gồm</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 3. Accordion: Chi tiết giá & thanh toán (gộp trực tiếp vào THÔNG TIN ĐẶT CHỖ) */}
      <div className="border-b border-vj-border-light/90">
        <div
          className="bg-vj-bar-gray hover:bg-vj-surface-3/80 px-4 py-2.5 flex items-center justify-between cursor-pointer transition-colors select-none"
          onClick={() => setShowPriceDetails(!showPriceDetails)}
        >
          <span className="font-koho text-xs sm:text-sm font-semibold text-vj-text-strong">
            Chi tiết giá &amp; thanh toán
          </span>
          <div className="flex items-center gap-1 font-bold text-vj-text-strong text-xs font-koho">
            <span className="text-3xs text-vj-muted">{showPriceDetails ? '▲' : '▼'}</span>
          </div>
        </div>

        {showPriceDetails && (
          <div className="p-3 sm:p-4 bg-white space-y-4 border-t border-vj-border-light text-xs">
            {/* Promo code form */}
            {onApplyPromo && (
              <div className="bg-gray-50/80 rounded-lg p-3 border border-gray-100">
                <label className="block text-2xs font-semibold text-[var(--foreground-subtle)] tracking-wider mb-1">
                  Mã khuyến mãi
                </label>
                <div className="flex items-center gap-2">
                  <div className="vj-lookup-field relative flex-1 flex items-center h-[42px] sm:h-[38px] px-3 bg-white border border-vj-line rounded-vj shadow-2xs focus-within:border-primary focus-within:ring-1 focus-within:ring-primary transition-all">
                    <input
                      id="card-promo-code-input"
                      name="cardPromoCode"
                      type="text"
                      value={promoCode}
                      onChange={(e) => onPromoCodeChange?.(e.target.value)}
                      placeholder=" "
                      disabled={promoApplied}
                      className={`vj-lookup-input normal-case !font-normal !text-vj-muted !border-b-0 w-full text-sm disabled:opacity-50 ${
                        promoApplied ? 'form-input-valid' : ''
                      }`}
                    />
                    <label
                      htmlFor="card-promo-code-input"
                      className={`vj-lookup-label font-medium font-koho pointer-events-none transition-all ${
                        promoCode
                          ? '-top-2 bg-white px-1 text-3xs font-medium text-vj-gray !text-vj-gray'
                          : 'left-3 text-xs text-vj-muted !text-vj-muted'
                      }`}
                    >
                      VJ2026
                    </label>
                  </div>
                  <button
                    type="button"
                    onClick={onApplyPromo}
                    disabled={promoApplied || !promoCode || isApplyingPromo}
                    className="h-[38px] sm:h-[36px] px-4 sm:px-5 bg-gradient-to-b from-yellow-300 via-yellow-400 to-yellow-500 text-black font-koho font-black uppercase text-sm tracking-wide hover:from-yellow-200 hover:via-yellow-300 hover:to-yellow-400 transition-all disabled:opacity-50 min-w-[80px] flex items-center justify-center shrink-0 cursor-pointer active:scale-98 shadow-xl shadow-yellow-400/60 border-2 border-yellow-500 ring-2 ring-yellow-300/40"
                  >
                    {isApplyingPromo ? (
                      <div className="w-4 h-4 border-2 border-[rgb(var(--foreground-rgb))]/20 border-t-[var(--foreground)] rounded-full animate-spin" />
                    ) : promoApplied ? (
                      '✓'
                    ) : (
                      'Áp dụng'
                    )}
                  </button>
                </div>
                {promoError && <p className="text-2xs text-primary mt-1">{promoError}</p>}
                {promoApplied && promoData && (
                  <p className="text-2xs text-[var(--vj-green)] mt-1 font-semibold">
                    ✓ Đã áp dụng mã {promoData.code}
                  </p>
                )}
              </div>
            )}

            {/* Price breakdown table */}
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-[var(--foreground-muted)]">Giá vé cơ bản</span>
                <span className="font-semibold">{fareSubtotal.toLocaleString('vi-VN')}₫</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--foreground-muted)]">
                  Thuế &amp; phí sân bay ({Math.round(taxRate * 100)}%)
                </span>
                <span className="font-semibold">+{(tax ?? 0).toLocaleString('vi-VN')}₫</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--foreground-muted)]">Phí chọn chỗ</span>
                <span className="font-semibold">+{(seatFee ?? 0).toLocaleString('vi-VN')}₫</span>
              </div>
              {(ancillaryFee > 0 || ancillaries.length > 0) && (
                <div className="flex justify-between">
                  <span className="text-[var(--foreground-muted)]">
                    Dịch vụ bổ sung {ancillaries.length ? `(${ancillaries.join(', ')})` : ''}
                  </span>
                  <span className="font-semibold">+{ancillaryFee.toLocaleString('vi-VN')}₫</span>
                </div>
              )}
              {promoApplied && (
                <div className="flex justify-between text-[var(--vj-green)] font-medium">
                  <span>
                    Giảm giá {promoData?.type === 'percentage' ? `(${promoData.value}%)` : ''}
                  </span>
                  <span className="font-bold">
                    -{(discountAmount ?? 0).toLocaleString('vi-VN')}₫
                  </span>
                </div>
              )}
              <div className="border-t border-[var(--border)] pt-2 flex justify-between font-bold text-[var(--foreground)] text-sm">
                <span>Tổng thanh toán</span>
                <span className="text-primary text-base font-black">
                  {(total || outboundTotal + ancillaryFee - (discountAmount ?? 0)).toLocaleString(
                    'vi-VN'
                  )}
                  ₫
                </span>
              </div>
            </div>

            <Link
              href="/tim-ve"
              className="mt-2 flex min-h-8 items-center gap-1.5 text-2xs text-[var(--foreground-subtle)] hover:text-[var(--foreground-muted)] transition-colors"
            >
              <Icon name="ArrowLeftIcon" size={12} />
              Quay lại chọn chuyến bay
            </Link>
          </div>
        )}
      </div>

      {/* 5. Section: Tổng tiền */}
      <div className="bg-vj-red-dark text-white px-4 py-3 flex items-center justify-between font-bold">
        <span className="font-koho text-xs sm:text-sm font-bold text-white uppercase tracking-wider">
          Tổng tiền
        </span>
        <span className="font-koho text-base sm:text-lg font-black text-white">
          {(total || outboundTotal + ancillaryFee - (discountAmount ?? 0)).toLocaleString('vi-VN')}{' '}
          VND
        </span>
      </div>
    </div>
  );
}
