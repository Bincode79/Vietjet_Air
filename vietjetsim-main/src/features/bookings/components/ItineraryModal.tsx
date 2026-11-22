'use client';

import React, { useEffect, useState, useRef } from 'react';
import QRCode from 'qrcode';
import styles from './ItineraryModal.module.css';
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
  const isCancelled = booking?.status === 'cancelled';
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
        width: 180,
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
  const rawName = (booking.contact_name || firstPassenger?.name || 'QUÝ KHÁCH')
    .trim()
    .toUpperCase();
  const nameParts = rawName.split(/\s+/);
  const primaryName =
    nameParts.length > 1 ? `${nameParts[0]}, ${nameParts.slice(1).join(' ')}` : rawName;

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
  const daysOfWeek = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  const expireDate = new Date(bookingDate.getTime() + 3 * 3600 * 1000);
  const expireDayOfWeek = daysOfWeek[expireDate.getDay()];
  const expireDateStr = `${expireDayOfWeek}, ${String(expireDate.getHours()).padStart(2, '0')}:${String(
    expireDate.getMinutes()
  ).padStart(2, '0')} | ${String(expireDate.getDate()).padStart(2, '0')}/${String(
    expireDate.getMonth() + 1
  ).padStart(2, '0')}/${expireDate.getFullYear()} | (GMT +7)`;

  const flight = booking.flight;
  const flightNo = flight?.flight_no || 'VJ134';
  const fromCode = flight?.from_code || 'SGN';
  const toCode = flight?.to_code || 'HAN';
  const fromCity = (getAirportCity(fromCode) || fromCode).replace(/^Tp\.\s*/i, '');
  const toCity = (getAirportCity(toCode) || toCode).replace(/^Tp\.\s*/i, '');

  const departDateObj = flight?.depart_time ? new Date(flight.depart_time) : bookingDate;
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
    : '05:00';

  const arriveTimeFormatted = flight?.arrive_time
    ? new Date(flight.arrive_time).toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '07:10';

  const fareClassLabel = flight?.class
    ? flight.class.charAt(0).toUpperCase() + flight.class.slice(1)
    : 'Eco1';

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = () => {
    const codeOrId = booking?.booking_code || booking?.id;
    if (codeOrId) {
      window.open(`/api/dat-ve/${codeOrId}/ve-dien-tu`, '_blank');
    } else {
      window.print();
    }
  };

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label="Thông tin hành trình của bạn"
    >
      <div className={styles.modal}>
        {/* Thanh tiêu đề Modal màu đỏ */}
        <div className={styles.header}>
          <h3 className="font-bold text-base tracking-wide">Thông tin hành trình của bạn</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="text-white hover:text-white/80 p-1 text-xl font-bold leading-none cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Nội dung tài liệu hành trình cuộn được */}
        <div ref={printContentRef} className={styles.content}>
          <div className={styles.document}>
            {/* Header tài liệu: Banner đỏ với logo Vietjet trắng & Hotline 1900 1886 màu vàng */}
            <div className={styles.banner}>
              <div className="flex items-center">
                <img
                  src="/images/brand/vietjet-logo-white.png"
                  alt="vietjetAir.com"
                  className="h-6 sm:h-8 w-auto object-contain"
                />
              </div>
              <div className="flex items-center">
                <span className="font-black text-sm sm:text-base tracking-wide text-vj-yellow">
                  1900 1886
                </span>
              </div>
            </div>

            {/* Tiêu đề tài liệu */}
            <div className={styles.title}>THÔNG TIN HÀNH TRÌNH CỦA BẠN</div>

            {/* 1. THÔNG TIN ĐẶT CHỖ */}
            <div>
              <div className={styles.sectionTitle}>1. THÔNG TIN ĐẶT CHỖ</div>
              <div className={styles.bookingGrid}>
                {/* Bảng thông tin đặt chỗ - chiếm 2 cột đầu (50%) */}
                <div className={styles.details}>
                  <div className="grid grid-cols-2">
                    <div className="bg-surface px-3 py-2 font-bold text-gray-700 border-r border-gray-200">
                      Họ và tên
                    </div>
                    <div className="bg-white px-3 py-2 font-bold text-gray-900 uppercase">
                      {primaryName}
                    </div>
                  </div>

                  <div className="grid grid-cols-2">
                    <div className="bg-surface px-3 py-2 font-bold text-gray-700 border-r border-gray-200">
                      Email
                    </div>
                    <div className="bg-white px-3 py-2 font-bold text-gray-900 break-all">
                      {maskedEmail}
                    </div>
                  </div>

                  <div className="grid grid-cols-2">
                    <div className="bg-surface px-3 py-2 font-bold text-gray-700 border-r border-gray-200">
                      Ngày đặt chỗ
                    </div>
                    <div className="bg-white px-3 py-2 text-gray-900">{bookingDateStr}</div>
                  </div>

                  <div className="grid grid-cols-2">
                    <div className="bg-surface px-3 py-2.5 font-bold text-gray-700 border-r border-gray-200">
                      Trạng thái đặt chỗ
                    </div>
                    <div className="bg-white px-3 py-2.5 space-y-1">
                      {isCancelled ? (
                        <div className="space-y-0.5">
                          <div className="inline-flex items-center gap-1.5 text-xs font-bold text-primary">
                            <span>✕</span>
                            <span>Đã hủy</span>
                          </div>
                          <p className="text-2xs text-primary font-bold leading-relaxed">
                            Mã đặt chỗ này đã bị hủy do quá hạn thanh toán.
                          </p>
                        </div>
                      ) : (
                        <>
                          <div className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600">
                            <span className="w-3.5 h-3.5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-3xs font-black">
                              ✓
                            </span>
                            <span>Đã xác nhận</span>
                          </div>
                          {!isPaid && (
                            <p className="text-2xs text-primary font-bold leading-relaxed">
                              Vé máy bay đã xác nhận-Mã đặt chỗ này sẽ bị hủy nếu không thanh toán
                              trước <span className="font-semibold">{expireDateStr}</span>
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2">
                    <div className="bg-surface px-3 py-2 font-bold text-gray-700 border-r border-gray-200">
                      Trạng thái thanh toán
                    </div>
                    <div className="bg-white px-3 py-2 font-bold">
                      <span className={isPaid ? 'text-emerald-600' : 'text-primary'}>
                        {isPaid ? (
                          'Đã thanh toán'
                        ) : isCancelled ? (
                          'Chưa thanh toán'
                        ) : (
                          <>Chưa thanh toán</>
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Ô QR Code - cột giữa trên desktop */}
                <div className={styles.qr}>
                  <div className="relative w-32 h-32 sm:w-40 sm:h-40 bg-white p-1 rounded border border-gray-200 flex items-center justify-center shrink-0">
                    {qrDataUrl ? (
                      <img
                        src={qrDataUrl}
                        alt={`QR Code ${bookingCode}`}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <div className="w-full h-full bg-gray-200 animate-pulse rounded" />
                    )}
                    {/* Logo Vietjet nhỏ ở tâm QR Code */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="w-6 h-6 bg-primary rounded flex items-center justify-center p-0.5 shadow-xs">
                        <img
                          src="/images/brand/vietjet-logo-white.png"
                          alt=""
                          className="w-full h-auto object-contain"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Ô Mã đặt chỗ - cột phải trên desktop */}
                <div className={styles.code}>
                  <div className="flex flex-col text-left">
                    <span className="text-xs sm:text-sm font-bold text-gray-700 uppercase tracking-wider">
                      MÃ ĐẶT CHỖ
                    </span>
                    <span className="text-2xl sm:text-3xl font-black text-primary tracking-wider font-mono">
                      {bookingCode}
                    </span>
                  </div>
                </div>
              </div>
              {/* Đường viền đỏ phân cách - chuẩn Image #3 */}
              <div className="border-b-2 border-primary my-2.5 sm:hidden" />
            </div>

            {/* 2. THÔNG TIN HÀNH KHÁCH */}
            <div>
              <div className={styles.sectionTitle}>2. THÔNG TIN HÀNH KHÁCH</div>
              <div className="border border-gray-200 border-t-0 overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-surface border-b border-gray-200 font-bold text-gray-700">
                    <tr>
                      <th className="py-2 px-3 sm:px-4 w-1/2">Tên hành khách</th>
                      <th className="py-2 px-3 sm:px-4 w-1/2">Chỗ ngồi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {booking.passengers && booking.passengers.length > 0 ? (
                      booking.passengers.map((p, idx) => {
                        const pRaw = (p.name || 'HÀNH KHÁCH').trim().toUpperCase();
                        const pParts = pRaw.split(/\s+/);
                        const pFormatted =
                          pParts.length > 1 ? `${pParts[0]}, ${pParts.slice(1).join(' ')}` : pRaw;
                        const seat = p.seat_number || booking.seats?.[idx]?.seat_number || '--';
                        return (
                          <tr key={p.id || idx}>
                            <td className="py-2.5 px-3 sm:px-4 font-bold text-gray-900 uppercase">
                              {pFormatted}
                            </td>
                            <td className="py-2.5 px-3 sm:px-4 text-gray-800">
                              {flightNo} {seat}
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td className="py-2.5 px-3 sm:px-4 font-bold text-gray-900 uppercase">
                          {primaryName}
                        </td>
                        <td className="py-2.5 px-3 sm:px-4 text-gray-800">{flightNo} --</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 3. THÔNG TIN CHUYẾN BAY */}
            <div>
              <div className={styles.sectionTitle}>3. THÔNG TIN CHUYẾN BAY</div>

              {/* Mobile Layout: 2-column key-value list (chuẩn Mobile Screenshot #2) */}
              <div className="sm:hidden border border-gray-200 border-t-0 divide-y divide-gray-200 text-xs">
                <div className="grid grid-cols-2">
                  <div className="bg-surface px-3 py-2 font-medium text-gray-700 border-r border-gray-200">
                    Số hiệu chuyến bay
                  </div>
                  <div className="bg-white px-3 py-2 text-gray-900">{flightNo}</div>
                </div>

                <div className="grid grid-cols-2">
                  <div className="bg-surface px-3 py-2 font-medium text-gray-700 border-r border-gray-200">
                    Ngày
                  </div>
                  <div className="bg-white px-3 py-2 text-gray-900">{departDateFormatted}</div>
                </div>

                <div className="grid grid-cols-2">
                  <div className="bg-surface px-3 py-2 font-medium text-gray-700 border-r border-gray-200">
                    Loại vé
                  </div>
                  <div className="bg-white px-3 py-2 text-gray-900">{fareClassLabel}</div>
                </div>

                <div className="grid grid-cols-2">
                  <div className="bg-surface px-3 py-2 font-medium text-gray-700 border-r border-gray-200">
                    Khởi hành
                  </div>
                  <div className="bg-white px-3 py-2 text-gray-900">
                    <div>
                      {departTimeFormatted} - {fromCity}
                    </div>
                    <div className="text-gray-500 text-xs">Nhà ga 1</div>
                  </div>
                </div>

                <div className="grid grid-cols-2">
                  <div className="bg-surface px-3 py-2 font-medium text-gray-700 border-r border-gray-200">
                    Đến
                  </div>
                  <div className="bg-white px-3 py-2 text-gray-900">
                    {arriveTimeFormatted} - {toCity}
                  </div>
                </div>
              </div>

              {/* Desktop Layout: 5-column table */}
              <div className="hidden sm:block border border-gray-200 border-t-0 overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-surface border-b border-gray-200 font-bold text-gray-700">
                    <tr>
                      <th className="py-2 px-3">Số hiệu chuyến bay</th>
                      <th className="py-2 px-3">Ngày</th>
                      <th className="py-2 px-3">Loại vé</th>
                      <th className="py-2 px-3">Khởi hành</th>
                      <th className="py-2 px-3">Đến</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white">
                    <tr>
                      <td className="py-2.5 px-3 text-gray-900">{flightNo}</td>
                      <td className="py-2.5 px-3 text-gray-800">{departDateFormatted}</td>
                      <td className="py-2.5 px-3 text-gray-800">{fareClassLabel}</td>
                      <td className="py-2.5 px-3 text-gray-900">
                        <div>
                          {departTimeFormatted} - {fromCity}
                        </div>
                        <div className="text-gray-500 text-3xs">Nhà ga 1</div>
                      </td>
                      <td className="py-2.5 px-3 text-gray-900">
                        {arriveTimeFormatted} - {toCity}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* Nút In / Tải xuống PDF cố định ở footer - chuẩn Image #3 & #4 */}
        <div className={styles.footer}>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button type="button" onClick={handlePrint} className={styles.action}>
              In
            </button>
            <button type="button" onClick={handleDownloadPdf} className={styles.action}>
              Tải xuống PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
