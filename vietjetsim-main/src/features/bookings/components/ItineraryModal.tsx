'use client';

import React, { useEffect, useState, useRef } from 'react';
import QRCode from 'qrcode';
import { getAirportCity } from '@/features/flights';

export interface ItineraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  booking: {
    id: string;
    booking_code: string | null;
    status: string;
    created_at: string;
    total_price: number;
    contact_name?: string;
    contact_email?: string;
    flight?: {
      flight_no?: string;
      from_code?: string;
      to_code?: string;
      depart_time?: string;
      arrive_time?: string;
      class?: string;
    } | null;
    passengers?: Array<{
      id?: string;
      name?: string;
      seat_number?: string;
      email?: string;
    }> | null;
    seats?: Array<{
      seat_number?: string;
    }> | null;
    payment?: {
      status?: string;
      method?: string;
    } | null;
  } | null;
}

export default function ItineraryModal({ isOpen, onClose, booking }: ItineraryModalProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const printContentRef = useRef<HTMLDivElement>(null);

  const bookingCode = booking?.booking_code || booking?.id?.slice(0, 6).toUpperCase() || 'VJ-PNR';
  const isPaid =
    booking?.status === 'confirmed' ||
    booking?.status === 'completed' ||
    booking?.payment?.status === 'completed';

  // Sinh mã QR 2D
  useEffect(() => {
    if (!bookingCode) return;
    let cancelled = false;
    QRCode.toDataURL(
      `VIETJET:${bookingCode}`,
      {
        margin: 1,
        width: 140,
        color: { dark: '#111827', light: '#FFFFFF' },
      },
      (err, url) => {
        if (!cancelled && !err && url) {
          setQrDataUrl(url);
        }
      }
    );
    return () => {
      cancelled = true;
    };
  }, [bookingCode]);

  if (!isOpen || !booking) return null;

  const firstPassenger = booking.passengers && booking.passengers[0];
  const primaryName = (booking.contact_name || firstPassenger?.name || 'QUÝ KHÁCH').toUpperCase();

  const rawEmail = booking.contact_email || firstPassenger?.email || '';
  const maskedEmail = rawEmail
    ? (() => {
        const [u, d] = rawEmail.split('@');
        if (!d) return rawEmail;
        if (u.length <= 2) return `${u[0]}*@${d}`;
        return `${u[0]}${'*'.repeat(Math.max(4, u.length - 2))}${u.slice(-1)}@${d}`;
      })()
    : 'x******@vietjetair.vn';

  const bookingDate = new Date(booking.created_at || Date.now());
  const bookingDateStr = `${String(bookingDate.getHours()).padStart(2, '0')}:${String(
    bookingDate.getMinutes()
  ).padStart(2, '0')}, ${String(bookingDate.getDate()).padStart(2, '0')}/${String(
    bookingDate.getMonth() + 1
  ).padStart(2, '0')}/${bookingDate.getFullYear()} (Giờ địa phương)`;

  // Hạn thanh toán: 3 tiếng sau khi đặt
  const expireDate = new Date(bookingDate.getTime() + 3 * 3600 * 1000);
  const expireDateStr = `${String(expireDate.getHours()).padStart(2, '0')}:${String(
    expireDate.getMinutes()
  ).padStart(2, '0')} | ${String(expireDate.getDate()).padStart(2, '0')}/${String(
    expireDate.getMonth() + 1
  ).padStart(2, '0')}/${expireDate.getFullYear()} | (GMT +7)`;

  const flight = booking.flight;
  const flightNo = flight?.flight_no || 'VJ121';
  const fromCode = flight?.from_code || 'HAN';
  const toCode = flight?.to_code || 'SGN';
  const fromCity = getAirportCity(fromCode);
  const toCity = getAirportCity(toCode);

  const departDateObj = flight?.depart_time ? new Date(flight.depart_time) : bookingDate;
  const daysOfWeek = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  const dayOfWeekStr = daysOfWeek[departDateObj.getDay()];
  const departDateFormatted = `${dayOfWeekStr}, ${String(departDateObj.getDate()).padStart(
    2,
    '0'
  )}/${String(departDateObj.getMonth() + 1).padStart(2, '0')}/${departDateObj.getFullYear()}`;

  const departTimeFormatted = flight?.depart_time
    ? new Date(flight.depart_time).toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '08:30';

  const arriveTimeFormatted = flight?.arrive_time
    ? new Date(flight.arrive_time).toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '10:45';

  const fareClassLabel = flight?.class
    ? flight.class.charAt(0).toUpperCase() + flight.class.slice(1)
    : 'Eco';

  const handlePrint = () => {
    window.print();
  };

  return (
    <div
      // MOBILE: modal trượt lên từ đáy, chiếm toàn bộ bề ngang và cao tối đa
      // 92% viewport. Trước đây nó là hộp `max-w-3xl` canh giữa trong
      // `p-3` — trên 375px nội dung bị bóp còn ~24px mỗi bên, bảng chuyến
      // bay phải cuộn ngang và nút "Tải xuống PDF" chạm mép màn hình.
      className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/60 backdrop-blur-xs sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Thông tin hành trình của bạn"
    >
      <div className="relative flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-vj bg-white shadow-2xl border border-vj-border-light animate-fadeIn print:max-h-none print:overflow-visible sm:my-6 sm:max-h-[88dvh] sm:rounded-vj">
        {/* Thanh tiêu đề Modal màu đỏ */}
        <div className="shrink-0 bg-primary text-white px-4 py-2.5 sm:py-3 flex items-center justify-between">
          <h3 className="font-bold text-sm sm:text-base tracking-wide flex items-center gap-2">
            <span>Thông tin hành trình của bạn</span>
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="text-white/90 hover:text-white p-1 rounded-vj hover:bg-white/10 transition-colors text-lg font-bold leading-none cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Nội dung tài liệu hành trình */}
        <div
          ref={printContentRef}
          className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6 pb-[calc(24px+env(safe-area-inset-bottom,0px))] sm:pb-6 space-y-4 font-koho text-vj-text bg-white print:overflow-visible"
        >
          {/* Header tài liệu: Logo Vietjet bên trái + Hotline 1900 1886 bên phải */}
          <div className="flex items-center justify-between pb-3 sm:pb-4 border-b border-vj-border-light gap-3">
            <div className="flex items-center gap-2">
              <img
                src="/images/vj-logo.svg"
                alt="Vietjet Air"
                width={160}
                height={28}
                className="h-7 sm:h-8 w-auto object-contain"
              />
              <span className="sr-only">Vietjet Air</span>
            </div>
            <a
              href="tel:19001886"
              aria-label="Hotline 1900 1886"
              className="inline-flex items-center gap-1.5 bg-accent hover:bg-accent-dark text-vj-dark font-black px-3 sm:px-3.5 py-1 sm:py-1.5 rounded-full text-xs sm:text-sm tracking-wide shadow-2xs hover:shadow-xs active:scale-95 transition-all shrink-0 cursor-pointer print:shadow-none print:border print:border-vj-border-light"
            >
              <svg
                aria-hidden="true"
                className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-vj-dark fill-current shrink-0"
                viewBox="0 0 24 24"
              >
                <path d="M6.62 10.79a15.053 15.053 0 006.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
              </svg>
              <span className="hidden sm:inline text-3xs uppercase font-bold tracking-wider text-vj-dark/80 mr-0.5">
                Hotline
              </span>
              <span className="tabular-nums">1900 1886</span>
            </a>
          </div>

          {/* Dải băng đỏ: THÔNG TIN HÀNH TRÌNH CỦA BẠN */}
          <div className="text-primary-dark font-bold text-center py-2 text-base sm:text-xl">
            THÔNG TIN HÀNH TRÌNH CỦA BẠN
          </div>

          {/* 1. THÔNG TIN ĐẶT CHỖ */}
          <div>
            <div className="bg-primary text-white font-bold text-xs uppercase px-3 py-1.5">
              1. THÔNG TIN ĐẶT CHỖ
            </div>
            <div className="border border-vj-border-light border-t-0 p-3 sm:p-4 grid grid-cols-1 md:grid-cols-[1fr_200px] gap-4 items-center">
              {/* Cột trái */}
              <div className="space-y-2 text-sm leading-snug">
                <div className="grid grid-cols-[130px_1fr] items-start">
                  <span className="text-vj-text-strong font-medium">Họ và tên:</span>
                  <span className="font-bold text-vj-text">{primaryName}</span>
                </div>
                <div className="grid grid-cols-[130px_1fr] items-start">
                  <span className="text-vj-text-strong font-medium">Email:</span>
                  <span className="break-all text-vj-text">{maskedEmail}</span>
                </div>
                <div className="grid grid-cols-[130px_1fr] items-start">
                  <span className="text-vj-text-strong font-medium">Ngày đặt chỗ:</span>
                  <span className="text-vj-text-strong">{bookingDateStr}</span>
                </div>
                <div className="grid grid-cols-[130px_1fr] items-start">
                  <span className="text-vj-text-strong font-medium">Trạng thái đặt chỗ:</span>
                  <div>
                    <span className="inline-flex items-center gap-1 text-vj-pay-green font-bold">
                      <span className="w-2 h-2 rounded-full bg-vj-pay-green inline-block" />
                      Đã xác nhận
                    </span>
                    {!isPaid && (
                      <p className="text-3xs text-primary mt-0.5 leading-snug">
                        Vé máy bay đã xác nhận: Mã đặt chỗ này sẽ bị hủy nếu không thanh toán trước{' '}
                        <span className="font-semibold">{expireDateStr}</span>
                      </p>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-[130px_1fr] items-start">
                  <span className="text-vj-text-strong font-medium">Trạng thái thanh toán:</span>
                  <span
                    className={
                      isPaid ? 'text-vj-pay-green font-bold' : 'text-vj-red-dark font-bold'
                    }
                  >
                    {isPaid ? 'Đã thanh toán' : 'Chưa thanh toán'}
                  </span>
                </div>
              </div>

              {/* Cột phải: Mã QR và PNR */}
              <div className="flex flex-col items-center justify-center p-2 rounded-vj bg-vj-surface-2 border border-vj-border-light">
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt={`QR Code ${bookingCode}`}
                    className="w-28 h-28 object-contain bg-white p-1 rounded-sm border border-vj-border-light"
                  />
                ) : (
                  <div className="w-28 h-28 bg-vj-surface-3 animate-pulse rounded-sm" />
                )}
                <span className="text-3xs font-bold text-vj-gray uppercase tracking-widest mt-1.5">
                  MÃ ĐẶT CHỖ
                </span>
                <span className="text-xl sm:text-2xl font-black text-primary tracking-wider font-mono">
                  {bookingCode}
                </span>
              </div>
            </div>
          </div>

          {/* 2. THÔNG TIN HÀNH KHÁCH */}
          <div>
            <div className="bg-primary text-white font-bold text-xs uppercase px-3 py-1.5">
              2. THÔNG TIN HÀNH KHÁCH
            </div>
            <div className="border border-vj-border-light border-t-0 overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-vj-surface-2 border-b border-vj-border-light font-bold text-vj-text-dim">
                  <tr>
                    <th className="py-2 px-3 sm:px-4">Tên hành khách</th>
                    <th className="py-2 px-3 sm:px-4 text-right">Chỗ ngồi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {booking.passengers && booking.passengers.length > 0 ? (
                    booking.passengers.map((p, idx) => {
                      const seat = p.seat_number || booking.seats?.[idx]?.seat_number || '--';
                      return (
                        <tr key={p.id || idx} className="hover:bg-vj-surface-2">
                          <td className="py-2.5 px-3 sm:px-4 font-bold text-vj-text uppercase">
                            {p.name || 'HÀNH KHÁCH'}
                          </td>
                          <td className="py-2.5 px-3 sm:px-4 text-right font-mono text-vj-text-dim">
                            {flightNo} {seat}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td className="py-2.5 px-3 sm:px-4 font-bold text-vj-text uppercase">
                        {primaryName}
                      </td>
                      <td className="py-2.5 px-3 sm:px-4 text-right font-mono text-vj-text-dim">
                        {flightNo} --
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* 3. THÔNG TIN CHUYẾN BAY */}
          <div>
            <div className="bg-primary text-white font-bold text-xs uppercase px-3 py-1.5">
              3. THÔNG TIN CHUYẾN BAY
            </div>
            <div className="border border-vj-border-light border-t-0 overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-vj-surface-2 border-b border-vj-border-light font-bold text-vj-text-dim">
                  <tr>
                    <th className="py-2 px-2.5 sm:px-3">Số hiệu chuyến bay</th>
                    <th className="py-2 px-2.5 sm:px-3">Ngày</th>
                    <th className="py-2 px-2.5 sm:px-3">Loại vé</th>
                    <th className="py-2 px-2.5 sm:px-3">Khởi hành</th>
                    <th className="py-2 px-2.5 sm:px-3">Đến</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="hover:bg-vj-surface-2">
                    <td className="py-2.5 px-2.5 sm:px-3 font-black text-vj-text font-mono">
                      {flightNo}
                    </td>
                    <td className="py-2.5 px-2.5 sm:px-3 text-vj-text-strong">
                      {departDateFormatted}
                    </td>
                    <td className="py-2.5 px-2.5 sm:px-3 font-semibold text-vj-text-strong">
                      {fareClassLabel}
                    </td>
                    <td className="py-2.5 px-2.5 sm:px-3 text-vj-text">
                      <span className="font-bold">{departTimeFormatted}</span> - {fromCity} (
                      {fromCode})
                    </td>
                    <td className="py-2.5 px-2.5 sm:px-3 text-vj-text">
                      <span className="font-bold">{arriveTimeFormatted}</span> - {toCity} ({toCode})
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Nút Print / Tải xuống PDF */}
          <div className="pt-3 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={handlePrint}
              className="px-6 py-2 vj-cta font-bold rounded-vj text-xs sm:text-sm tracking-wide shadow-xs active:scale-98 transition-all cursor-pointer flex items-center gap-1.5"
            >
              <span>Print</span>
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="px-6 py-2 vj-cta font-bold rounded-vj text-xs sm:text-sm tracking-wide shadow-xs active:scale-98 transition-all cursor-pointer flex items-center gap-1.5"
            >
              <span>Tải xuống PDF</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
