'use client';

import React, { useState } from 'react';
import { Icon } from '@/shared/components/ui';

interface Passenger {
  name: string;
  seat: string;
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
  bookingCode?: string | null;
  passengers?: Passenger[];
  fareClass?: string;
  ancillaries?: string[];
  fareSubtotal?: number;
  tax?: number;
  seatFee?: number;
  ancillaryFee?: number;
  total?: number;
  onOpenDetails?: () => void;
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
  bookingCode,
  passengers = [],
  fareClass = 'Eco',
  ancillaries = ['Hành lý xách tay 7kg'],
  fareSubtotal = 1738800,
  tax = 581581,
  seatFee = 259200,
  ancillaryFee = 44000,
  total = 2677581,
  onOpenDetails,
}: BookingTicketCardProps) {
  const [showPax, setShowPax] = useState(false);
  const [showFare, setShowFare] = useState(false);
  const [showTax, setShowTax] = useState(false);
  const [showService, setShowService] = useState(false);

  // Tính tổng chuyến đi = giá vé + thuế phí + dịch vụ ghế
  const outboundTotal = fareSubtotal + tax + seatFee;
  const convenienceFee = 54000;

  return (
    <div className="bg-white rounded-vj border border-vj-border-light shadow-vj-sm overflow-hidden sticky top-[120px] transition-all">
      {/* 1. Header bar: Red with "THÔNG TIN ĐẶT CHỖ" and yellow pill "Chi Tiết" */}
      <div className="bg-vj-red-dark px-4 py-3 text-white flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="font-koho text-sm sm:text-base font-bold uppercase tracking-wide text-white">
            THÔNG TIN ĐẶT CHỖ
          </h3>
          {bookingCode && (
            <span className="text-3xs font-mono font-bold bg-white/20 px-1.5 py-0.5 rounded text-yellow-300">
              {bookingCode}
            </span>
          )}
        </div>
        {onOpenDetails && (
          <button
            type="button"
            onClick={onOpenDetails}
            className="bg-vj-yellow hover:bg-vj-yellow text-black font-black text-3xs uppercase px-3 py-1 rounded-full shadow-2xs transition-transform active:scale-98 cursor-pointer font-koho"
          >
            Chi Tiết
          </button>
        )}
      </div>

      {/* 2. Accordion: Thông tin hành khách */}
      <div className="border-b border-vj-border-light/90">
        <div
          className="bg-vj-bar-gray hover:bg-vj-surface-3/80 px-4 py-2.5 flex items-center justify-between cursor-pointer transition-colors select-none"
          onClick={() => setShowPax(!showPax)}
        >
          <span className="font-koho text-xs sm:text-sm font-semibold text-vj-text-strong">
            Thông tin hành khách
          </span>
          <div className="flex items-center gap-1 font-bold text-vj-text-strong text-xs font-koho">
            <span className="sr-only">{passengers.map((p) => p.name).join(', ')}</span>
            <span className="text-3xs text-vj-muted">{showPax ? '▲' : '▼'}</span>
          </div>
        </div>
        {showPax && (
          <div className="p-3 bg-white space-y-1.5 text-xs border-t border-vj-border-light">
            {(passengers.length > 0
              ? passengers
              : [{ name: 'NGUYEN VAN A', seat: 'Chưa chọn' }]
            ).map((p, idx) => (
              <div key={idx} className="flex justify-between items-center text-vj-text-dim">
                <span className="font-medium">
                  {idx + 1}. {p.name || 'Hành khách'} (Người lớn)
                </span>
                <span className="text-3xs px-2 py-0.5 rounded bg-vj-pill text-vj-text-strong font-mono">
                  Ghế: {p.seat || 'Chưa chọn'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 3. Accordion: Chuyến đi */}
      <div className="border-b border-vj-border-light/90">
        <div className="bg-vj-bar-gray px-4 py-2.5 flex items-center justify-between text-xs sm:text-sm font-semibold text-vj-text-strong">
          <span>Chuyến đi</span>
          <div className="flex items-center gap-1.5 text-vj-blue font-bold font-koho text-xs sm:text-sm">
            <span>{outboundTotal.toLocaleString('vi-VN')} VND</span>
            <span className="text-vj-red text-xs">✎</span>
          </div>
        </div>

        <div className="p-3 bg-white text-xs space-y-1.5 border-t border-vj-border-light">
          <div className="font-bold text-vj-text flex items-center gap-1.5 text-xs sm:text-sm">
            <span>
              {fromCity || from} ({from})
            </span>
            <span className="text-vj-red-dark font-bold">➔</span>
            <span>
              {toCity || to} ({to})
            </span>
          </div>
          <div className="text-vj-gray text-3xs sm:text-xs">
            {date} | {departTime} - {arriveTime} | {flightNo} | {fareClass}
          </div>

          {/* Sub breakdowns */}
          <div className="pt-2 space-y-1 text-3xs sm:text-xs">
            {/* Giá vé */}
            <div
              className="flex justify-between items-center text-vj-text-dim cursor-pointer hover:text-black py-1 border-t border-vj-border-light"
              onClick={() => setShowFare(!showFare)}
            >
              <span className="font-medium flex items-center gap-1">
                Giá vé <span className="text-3xs text-vj-muted">{showFare ? '▲' : '▼'}</span>
              </span>
              <span className="font-semibold text-vj-text">
                {fareSubtotal.toLocaleString('vi-VN')} VND
              </span>
            </div>
            {showFare && (
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
              onClick={() => setShowTax(!showTax)}
            >
              <span className="font-medium flex items-center gap-1">
                Thuế, phí <span className="text-3xs text-vj-muted">{showTax ? '▲' : '▼'}</span>
              </span>
              <span className="font-semibold text-vj-text">{tax.toLocaleString('vi-VN')} VND</span>
            </div>
            {showTax && (
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
              onClick={() => setShowService(!showService)}
            >
              <span className="font-medium flex items-center gap-1">
                Dịch vụ <span className="text-3xs text-vj-muted">{showService ? '▲' : '▼'}</span>
              </span>
              <span className="font-semibold text-vj-text">
                {seatFee.toLocaleString('vi-VN')} VND
              </span>
            </div>
            {showService && (
              <div className="pl-3 py-1.5 text-vj-gray text-3xs space-y-1 bg-vj-surface-2 rounded">
                <div className="flex justify-between">
                  <span>Phí chọn chỗ ngồi &amp; tiện ích</span>
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
      </div>

      {/* 4. Section: Dịch vụ bổ sung */}
      <div className="border-b border-vj-border-light/90">
        <div className="bg-vj-bar-gray px-4 py-2.5 flex items-center justify-between text-xs sm:text-sm font-semibold text-vj-text-strong">
          <span>Dịch vụ bổ sung</span>
          <span className="text-vj-red-dark font-bold font-koho text-xs sm:text-sm">
            {(ancillaryFee || 44000).toLocaleString('vi-VN')} VND
          </span>
        </div>
        <div className="p-3 bg-white text-xs space-y-1.5 border-t border-vj-border-light">
          <div className="flex justify-between items-center text-vj-text-strong">
            <span className="font-medium">Bảo hiểm du lịch Vietjet Travel Safe</span>
            <div className="flex items-center gap-1">
              <span className="font-semibold">
                {(ancillaryFee || 44000).toLocaleString('vi-VN')} VND
              </span>
              <span className="text-vj-red text-xs">✎</span>
            </div>
          </div>
          <div className="flex justify-between text-3xs text-vj-gray pl-2">
            <span>BaoViet Insurance</span>
            <span>{(ancillaryFee || 44000).toLocaleString('vi-VN')}</span>
          </div>
          <div className="flex justify-between text-3xs text-vj-gray pl-2">
            <span>Thuế VAT</span>
            <span>0</span>
          </div>
        </div>
      </div>

      {/* 5. Section: Phí tiện ích */}
      <div className="border-b border-vj-border-light/90 bg-vj-bar-gray px-4 py-2.5 flex items-center justify-between text-xs sm:text-sm font-semibold text-vj-text-strong">
        <span>Phí tiện ích</span>
        <span className="font-bold text-vj-text font-koho text-xs sm:text-sm">
          {convenienceFee.toLocaleString('vi-VN')} VND
        </span>
      </div>

      {/* 6. Section: Tổng tiền */}
      <div className="bg-vj-red-dark text-white px-4 py-3 flex items-center justify-between font-bold">
        <span className="font-koho text-xs sm:text-sm font-bold text-white uppercase tracking-wider">
          Tổng tiền
        </span>
        <span className="font-koho text-base sm:text-lg font-black text-white">
          {(total || outboundTotal + (ancillaryFee || 44000) + convenienceFee).toLocaleString(
            'vi-VN'
          )}{' '}
          VND
        </span>
      </div>
    </div>
  );
}
