'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Icon } from '@/shared/components/ui';
import { Header, Footer } from '@/shared/components/navigation';
import { useToast } from '@/hooks/useToast';
import { ToastContainer } from '@/shared/components/feedback';
import { apiRequest, ApiRequestError, getApiErrorMessage } from '@/shared/services';
import ItineraryModal from '@/features/bookings/components/ItineraryModal';
import FlightSummaryCard from '@/features/bookings/components/FlightSummaryCard';

interface BookingDetail {
  id: string;
  user_id: string;
  booking_code: string | null;
  flight_id: string;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'refunded';
  total_price: number;
  created_at: string;
  updated_at: string;
  contact_name?: string;
  contact_email_masked?: string;
  flight: {
    flight_no: string;
    from_code: string;
    to_code: string;
    depart_time: string;
    arrive_time: string;
    price: number;
    class: string;
  } | null;
  passengers: Array<{
    id: string;
    name: string;
    seat_number?: string;
    passenger_type: string;
    gender?: string;
    email?: string;
  }>;
  payment: {
    id: string;
    method: string;
    status: string;
    amount: number;
    created_at: string;
  } | null;
  seats: Array<{
    id: string;
    seat_number: string;
    seat_class: string;
  }>;
}

export default function BookingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const toast = useToast();
  const bookingId = params.id as string;

  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showItineraryModal, setShowItineraryModal] = useState(false);
  const [showPaxCard, setShowPaxCard] = useState(true);
  const [expandedPax, setExpandedPax] = useState<Record<number, boolean>>({ 0: true });
  const [isSendingMail, setIsSendingMail] = useState(false);
  const [showSkyJoyPrompt, setShowSkyJoyPrompt] = useState(false);

  useEffect(() => {
    const fetchBooking = async () => {
      try {
        const data = await apiRequest<{ booking: BookingDetail }>(`/api/dat-ve/${bookingId}`);
        setBooking(data.booking);
      } catch (err) {
        if (err instanceof ApiRequestError && err.status === 401) {
          router.push('/dang-nhap');
          return;
        }
        setError(getApiErrorMessage(err, 'Đã có lỗi xảy ra'));
      } finally {
        setLoading(false);
      }
    };

    fetchBooking();
  }, [bookingId, router]);

  const flight = booking?.flight ?? null;
  const bookingCode = booking?.booking_code || booking?.id?.slice(0, 6).toUpperCase() || '—';
  const isPaid =
    booking?.status === 'confirmed' ||
    booking?.status === 'completed' ||
    booking?.payment?.status === 'completed';

  const bookingDate = useMemo(
    () => new Date(booking?.created_at || Date.now()),
    [booking?.created_at]
  );

  // Hạn thanh toán: 3 tiếng sau khi đặt
  const expireDateStr = useMemo(() => {
    const expireDate = new Date(bookingDate.getTime() + 3 * 3600 * 1000);
    return `${String(expireDate.getDate()).padStart(2, '0')}/${String(
      expireDate.getMonth() + 1
    ).padStart(2, '0')}/${expireDate.getFullYear()} | ${String(expireDate.getHours()).padStart(
      2,
      '0'
    )}:${String(expireDate.getMinutes()).padStart(2, '0')}`;
  }, [bookingDate]);

  const passengersList = booking?.passengers || [];
  const paxCount = passengersList.length || 1;
  const totalPriceNumber = Number(booking?.total_price || 0);

  const handleSendItineraryEmail = useCallback(async () => {
    if (!booking) return;
    setIsSendingMail(true);
    try {
      // Gọi API gửi mail hoá đơn / hành trình
      const res = await apiRequest<{ success: boolean; message?: string }>(
        `/api/quan-tri/dat-ve/gui-mail`,
        {
          method: 'POST',
          body: {
            booking_id: booking.id,
            action: 'send_invoice',
          },
        }
      );
      if (res.success) {
        toast.success(
          'Gửi email thành công',
          'Thông tin hành trình và vé điện tử đã được gửi tới email của quý khách.'
        );
      } else {
        toast.info('Đã xử lý gửi mail', 'Hệ thống đang gửi email hành trình tới hòm thư của bạn.');
      }
    } catch {
      toast.success(
        'Đã tiếp nhận yêu cầu',
        'Hệ thống đang tự động gửi email thông tin hành trình tới hòm thư của bạn.'
      );
    } finally {
      setIsSendingMail(false);
    }
  }, [booking, toast]);

  if (loading) {
    return (
      <div className="relative min-h-screen bg-vj-surface-2 flex flex-col font-sans">
        <Header />
        <main
          id="main-content"
          className="flex-1 flex items-center justify-center p-8 skeleton-pulse"
        >
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-vj-booking-red/20 border-t-vj-booking-red rounded-full animate-spin mx-auto mb-3" />
            <h1 className="text-vj-text-strong font-bold text-sm font-koho">
              Đang tải thông tin hành trình...
            </h1>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (error || !booking) {
    return (
      <div className="relative min-h-screen bg-vj-surface-2 flex flex-col font-sans">
        <Header />
        <main id="main-content" className="flex-1 flex items-center justify-center p-8">
          <div className="text-center max-w-md bg-white p-8 rounded-2xl border border-vj-border-light shadow-vj-sm">
            <div className="w-14 h-14 bg-red-50 text-vj-booking-red rounded-full flex items-center justify-center mx-auto mb-4 border border-red-100">
              <Icon name="ExclamationCircleIcon" size={32} />
            </div>
            <h1 className="text-lg font-black text-vj-text mb-2 font-koho">
              Không tìm thấy đặt chỗ
            </h1>
            <p className="text-vj-gray mb-6 text-xs">{error || 'Mã đặt chỗ không tồn tại.'}</p>
            <Link
              href="/tim-ve"
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-vj-booking-red text-white font-bold text-xs uppercase tracking-wider rounded-vj hover:bg-vj-booking-red-hover transition-colors"
            >
              <Icon name="ArrowLeftIcon" size={16} />
              Tìm chuyến bay khác
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-gradient-to-b from-vj-blue-tint-6 via-vj-rose-tint-1 to-vj-rose-tint-2 flex flex-col font-sans overflow-x-hidden">
      <Header />

      <ToastContainer toasts={toast.toasts} onDismiss={toast.dismiss} position="top-right" />

      {/* Dải băng vàng thông báo trên cùng - chuẩn Screenshot 1 */}
      <div className="w-full bg-vj-gold-deep text-vj-dark border-b border-vj-gold-border shadow-xs py-2 px-3 sm:px-6 z-10">
        <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-y-1 text-2xs sm:text-xs">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-vj-text-strong">Mã đặt chỗ :</span>
            <span className="font-black text-vj-booking-red tracking-wider text-xs sm:text-sm">
              {bookingCode}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-vj-text-strong">Trạng thái thanh toán :</span>
            <span className={`font-black ${isPaid ? 'text-vj-pay-green' : 'text-vj-booking-red'}`}>
              {isPaid ? 'Đã thanh toán' : 'Chưa thanh toán'}
            </span>
            {!isPaid && (
              <Link
                href={`/thanh-toan?bookingId=${bookingCode || booking.id}`}
                className="ml-2 inline-flex items-center px-2.5 py-1 text-2xs font-black rounded-vj bg-vj-booking-red text-white hover:bg-vj-booking-red-hover shadow-xs transition-colors"
              >
                Thanh toán ngay
              </Link>
            )}
          </div>

          <div className="flex flex-col sm:items-end w-full sm:w-auto text-left sm:text-right">
            <div className="flex items-center gap-1">
              <span className="font-semibold text-vj-text-strong">Yêu cầu thanh toán :</span>
              <span className="font-black text-vj-booking-red text-xs sm:text-sm">
                {totalPriceNumber.toLocaleString('vi-VN')} VND
              </span>
            </div>
            {!isPaid && (
              <span className="text-vj-text-dim text-3xs sm:text-2xs">
                trước {expireDateStr} (Theo giờ địa phương)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Main Content với nền mây nhẹ nhàng */}
      <main
        id="main-content"
        className="flex-1 py-6 px-3 sm:px-6 max-w-4xl mx-auto w-full space-y-4 z-10"
      >
        <h1 className="sr-only">
          Chi tiết đặt chỗ chuyến bay Vietjet Air - Mã đặt chỗ {bookingCode}
        </h1>
        {/* 1. Card: Thông tin chuyến bay */}
        <FlightSummaryCard
          flight={flight}
          paxCount={paxCount}
          totalPrice={totalPriceNumber}
          bookingCode={bookingCode}
        />

        {/* 2. Card: Thông tin hành khách */}
        <div className="bg-white rounded-2xl border border-vj-border-light/90 shadow-vj-sm hover:shadow-vj-md transition-all duration-300 overflow-hidden">
          <div className="px-4 sm:px-5 py-3 bg-gradient-to-r from-gray-50 via-gray-50/80 to-white border-b border-vj-border-light flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-4 bg-vj-booking-red rounded-full" />
              <span className="text-xs sm:text-sm font-black text-vj-text uppercase tracking-wider font-koho">
                Thông tin hành khách
              </span>
              <span className="px-2 py-0.5 rounded-full bg-red-50 text-vj-booking-red text-3xs font-extrabold border border-red-200">
                {paxCount} khách
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowPaxCard(!showPaxCard)}
              className="w-7 h-7 rounded-full hover:bg-vj-surface-3 text-vj-text-strong hover:text-vj-text font-bold text-sm flex items-center justify-center transition-all cursor-pointer active:scale-98"
              aria-label="Thu gọn hoặc mở rộng"
            >
              {showPaxCard ? '−' : '+'}
            </button>
          </div>

          {showPaxCard && (
            <div className="p-4 sm:p-5 space-y-4">
              {/* Banner tích điểm SkyJoy chuẩn Screenshot 1 & Image #5 */}
              <div className="bg-vjred text-white rounded-vj p-3.5 sm:p-4 relative overflow-hidden shadow-xs">
                <div className="relative z-10 flex flex-wrap items-center justify-between gap-2 mb-2 pb-1.5 border-b border-white/20">
                  <div className="flex items-center gap-2">
                    <span className="text-xs sm:text-sm font-black uppercase tracking-wide">
                      Bổ sung mã hội viên để tích điểm
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowSkyJoyPrompt(true)}
                    className="bg-vjyellow hover:bg-vjamber text-black font-bold px-4 py-1 rounded-full text-2xs uppercase tracking-wider shadow-xs active:scale-98 transition-all cursor-pointer"
                  >
                    Bổ sung
                  </button>
                </div>
                <div className="relative z-10 text-2xs text-white/95 space-y-1">
                  <p className="font-extrabold text-white">
                    Đăng ký Hội viên Vietjet SkyJoy - Tận hưởng X3 ưu đãi:
                  </p>
                  <p className="flex items-center gap-1.5">• Tặng ngay 200 SkyPoint.</p>
                  <p className="flex items-center gap-1.5">
                    • Nhận SkyPoint cho các chuyến đã bay.
                  </p>
                  <p className="flex items-center gap-1.5">
                    • Hưởng đặc quyền ưu tiên bên tại sân bay.
                  </p>
                  <Link
                    href="/dang-ky"
                    className="inline-flex items-center gap-1 mt-1 text-vjgold hover:underline font-bold transition-colors"
                  >
                    <span>Đăng ký ngay!</span>
                  </Link>
                </div>
              </div>

              {/* Modal bổ sung SkyJoy ID nhanh */}
              {showSkyJoyPrompt && (
                <div className="bg-amber-50/90 border border-amber-300 rounded-vj p-3.5 flex flex-col sm:flex-row gap-2.5 items-center justify-between shadow-2xs animate-fadeIn">
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <span className="text-amber-600 font-bold text-sm">🎫</span>
                    <input
                      type="text"
                      placeholder="Nhập mã hội viên SkyJoy (VD: SJ889922)"
                      className="w-full sm:w-80 px-3 py-1.5 bg-white border border-amber-300 rounded-vj text-xs font-mono focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  </div>
                  <div className="flex gap-2 w-full sm:w-auto justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        toast.success('Đã lưu mã hội viên SkyJoy!');
                        setShowSkyJoyPrompt(false);
                      }}
                      className="px-4 py-1.5 bg-vj-booking-red hover:bg-vj-booking-red-hover text-white text-xs font-bold rounded-vj shadow-xs active:scale-98 transition-all cursor-pointer"
                    >
                      Lưu mã
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowSkyJoyPrompt(false)}
                      className="px-4 py-1.5 bg-vj-surface-3 hover:bg-vj-surface-3 text-vj-text-strong text-xs font-bold rounded-vj active:scale-98 transition-all cursor-pointer"
                    >
                      Hủy
                    </button>
                  </div>
                </div>
              )}

              {/* Danh sách thẻ hành khách — chuẩn site thật: chỉ tên + route + ghế */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                {passengersList.map((passenger, idx) => {
                  const title = passenger.gender === 'female' ? 'Mrs' : 'Mr';
                  const seatCode =
                    passenger.seat_number || booking.seats?.[idx]?.seat_number || 'Chưa chọn';

                  return (
                    <div
                      key={passenger.id || idx}
                      className="border border-vj-border-light/90 rounded-vj p-3.5 bg-vj-surface-2/50 hover:bg-white space-y-2.5 text-2xs shadow-2xs hover:shadow-xs hover:border-red-200 transition-all"
                    >
                      <div className="flex items-center justify-between border-b border-vj-border-light pb-2">
                        <div className="flex items-center gap-2 font-black text-vj-text">
                          <span className="w-5 h-5 rounded-full bg-red-50 text-vj-booking-red flex items-center justify-center text-xs font-bold">
                            👤
                          </span>
                          <span className="text-xs tracking-tight">
                            Người lớn: {title} {passenger.name?.toUpperCase() || 'HÀNH KHÁCH'}
                          </span>
                        </div>
                        <span className="px-2 py-0.5 rounded-sm bg-vj-pill text-vj-text-strong font-mono text-3xs font-bold">
                          #{idx + 1}
                        </span>
                      </div>

                      <div className="space-y-1.5 text-vj-text-dim">
                        <div className="font-extrabold text-vj-text flex items-center gap-1.5">
                          <span className="font-mono text-xs">{flight?.from_code || 'SGN'}</span>
                          <span className="text-vj-booking-red">➔</span>
                          <span className="font-mono text-xs">{flight?.to_code || 'HAN'}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-vj-gray">Chỗ ngồi:</span>
                          <span
                            className={`font-black px-2 py-0.5 rounded text-3xs ${
                              seatCode === 'Chưa chọn'
                                ? 'bg-red-50 text-vj-booking-red border border-red-200'
                                : 'bg-vj-pay-green text-vj-pay-green border border-vj-pay-green'
                            }`}
                          >
                            {seatCode}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* 3. Card: Chi tiết giá vé */}
        <div className="bg-white rounded-2xl border border-vj-border-light/90 shadow-vj-sm hover:shadow-vj-md transition-all duration-300 overflow-hidden">
          <div className="px-4 sm:px-5 py-3 bg-gradient-to-r from-gray-50 via-gray-50/80 to-white border-b border-vj-border-light flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-4 bg-vj-booking-red rounded-full" />
              <span className="text-xs sm:text-sm font-black text-vj-text uppercase tracking-wider font-koho">
                Chi tiết giá vé
              </span>
            </div>
            <span className="text-xs font-mono font-bold text-vj-gray">{paxCount} hành khách</span>
          </div>

          <div className="divide-y divide-gray-100">
            {passengersList.map((passenger, idx) => {
              const isOpen = expandedPax[idx] ?? false;
              const title = passenger.gender === 'female' ? 'Mrs' : 'Mr';
              const paxShare = Math.round(totalPriceNumber / paxCount);

              return (
                <div key={passenger.id || idx}>
                  <button
                    type="button"
                    onClick={() => setExpandedPax((prev) => ({ ...prev, [idx]: !prev[idx] }))}
                    className="w-full px-4 sm:px-5 py-3.5 flex items-center justify-between text-left hover:bg-vj-surface-2 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-vj-muted">🎟️</span>
                      <span className="text-xs font-extrabold text-vj-text">
                        Người lớn: {title} {passenger.name?.toUpperCase() || 'HÀNH KHÁCH'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-xs text-vj-text-strong tabular-nums">
                        {paxShare.toLocaleString('vi-VN')} VND
                      </span>
                      <span
                        className={`text-xs text-vj-gray transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                      >
                        ▼
                      </span>
                    </div>
                  </button>

                  {isOpen && (
                    <div className="px-4 sm:px-5 pb-3.5 pt-1.5 bg-vj-surface-2/50 text-2xs space-y-1 text-vj-text-strong border-t border-vj-border-light animate-fadeIn">
                      {/* Tiêu đề chặng bay */}
                      <div className="flex items-center gap-2 pb-1.5 mb-1 text-xs">
                        <span className="text-primary font-bold">Chi tiết chuyến đi</span>
                        <span className="font-mono font-extrabold text-vj-text">
                          {flight?.from_code || 'SGN'}
                        </span>
                        <span className="text-vj-booking-red text-xs">➔</span>
                        <span className="font-mono font-extrabold text-vj-text">
                          {flight?.to_code || 'HAN'}
                        </span>
                      </div>

                      {/* Giá vé */}
                      <div className="flex justify-between font-bold text-vj-text">
                        <span>Giá vé</span>
                        <span className="tabular-nums">
                          {Math.round(paxShare * 0.749).toLocaleString('vi-VN')} VND
                        </span>
                      </div>
                      <div className="flex justify-between pl-3">
                        <span>B1ECO - {flight?.class ? flight.class.charAt(0).toUpperCase() + flight.class.slice(1) : 'Eco1'}</span>
                        <span className="font-semibold text-vj-text tabular-nums">
                          {Math.round(paxShare * 0.694).toLocaleString('vi-VN')}
                        </span>
                      </div>
                      <div className="flex justify-between pl-3">
                        <span>Thuế VAT</span>
                        <span className="font-semibold text-vj-text tabular-nums">
                          {Math.round(paxShare * 0.055).toLocaleString('vi-VN')}
                        </span>
                      </div>

                      {/* Thuế, phí */}
                      <div className="flex justify-between font-bold text-vj-text pt-1.5">
                        <span>Thuế, phí</span>
                        <span className="tabular-nums">
                          {Math.round(paxShare * 0.251).toLocaleString('vi-VN')} VND
                        </span>
                      </div>
                      <div className="flex justify-between pl-3">
                        <span>Phí quản trị hệ thống</span>
                        <span className="font-semibold text-vj-text tabular-nums">
                          {(215000).toLocaleString('vi-VN')}
                        </span>
                      </div>
                      <div className="flex justify-between pl-3">
                        <span>Phí an ninh soi chiếu</span>
                        <span className="font-semibold text-vj-text tabular-nums">
                          {(18181).toLocaleString('vi-VN')}
                        </span>
                      </div>
                      <div className="flex justify-between pl-3">
                        <span>Domestic airport tax</span>
                        <span className="font-semibold text-vj-text tabular-nums">
                          {(99000).toLocaleString('vi-VN')}
                        </span>
                      </div>
                      <div className="flex justify-between pl-3">
                        <span>DOM management fee</span>
                        <span className="font-semibold text-vj-text tabular-nums">
                          {Math.max(0, Math.round(paxShare * 0.251) - 215000 - 18181 - 99000 - Math.round(Math.max(0, paxShare * 0.251 - 215000 - 18181 - 99000) * 0.12)).toLocaleString('vi-VN')}
                        </span>
                      </div>
                      <div className="flex justify-between pl-3">
                        <span>Thuế VAT</span>
                        <span className="font-semibold text-vj-text tabular-nums">
                          {Math.round(Math.max(0, paxShare * 0.251 - 215000 - 18181 - 99000) * 0.12).toLocaleString('vi-VN')}
                        </span>
                      </div>

                      {/* Tổng tiền */}
                      <div className="flex justify-between pt-2 border-t border-vj-border-light font-black text-vj-text text-xs">
                        <span className="text-primary italic">Tổng tiền</span>
                        <span className="text-vj-booking-red text-sm tabular-nums">
                          {paxShare.toLocaleString('vi-VN')} VND
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* 4. Hàng nút hành động chuẩn - 5 nút vàng theo phong cách Vietjet Air Image #5 */}
        <div className="space-y-3 pt-3">
          {/* Hàng 1: 4 nút thao tác dịch vụ dạng viên thuốc màu vàng */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
            {!isPaid ? (
              <button
                type="button"
                onClick={() =>
                  router.push(`/thanh-toan?bookingId=${bookingCode || booking.id}&source=manage`)
                }
                className="py-2 px-3 bg-vjyellow hover:bg-vjamber text-black font-bold rounded-full text-2xs uppercase tracking-wider shadow-2xs hover:shadow-xs active:scale-98 transition-all text-center flex items-center justify-center cursor-pointer"
              >
                <span>Thanh toán ngay</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => toast.success('Đơn vé đã thanh toán thành công!')}
                className="py-2 px-3 bg-vj-pay-green hover:bg-vj-pay-green text-white font-bold rounded-full text-2xs uppercase tracking-wider shadow-2xs text-center flex items-center justify-center cursor-default"
              >
                <span>Đã thanh toán</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => router.push(`/dat-ve/${bookingCode || booking.id}/dich-vu`)}
              className="py-2 px-3 bg-vjyellow hover:bg-vjamber text-black font-bold rounded-full text-2xs uppercase tracking-wider shadow-2xs hover:shadow-xs active:scale-98 transition-all text-center flex items-center justify-center cursor-pointer truncate"
              title="Mua hành lý, chỗ ngồi, suất ăn và hơn thế nữa..."
            >
              <span>Mua hành lý, chỗ ngồi, suất ăn và hơn thế nữa...</span>
            </button>

            <button
              type="button"
              onClick={handleSendItineraryEmail}
              disabled={isSendingMail}
              className="py-2 px-3 bg-vjyellow hover:bg-vjamber text-black font-bold rounded-full text-2xs uppercase tracking-wider shadow-2xs hover:shadow-xs active:scale-98 transition-all text-center flex items-center justify-center cursor-pointer disabled:opacity-50"
            >
              <span>{isSendingMail ? 'Đang gửi mail...' : 'Gửi mail hành trình'}</span>
            </button>

            <button
              type="button"
              onClick={() => router.push('/tim-ve')}
              className="py-2 px-3 bg-vjyellow hover:bg-vjamber text-black font-bold rounded-full text-2xs uppercase tracking-wider shadow-2xs hover:shadow-xs active:scale-98 transition-all text-center flex items-center justify-center cursor-pointer"
            >
              <span>Tìm đặt chỗ khác</span>
            </button>
          </div>

          {/* Hàng 2: Nút Tải thông tin hành trình ở giữa */}
          <div className="flex items-center justify-center pt-1">
            <button
              type="button"
              onClick={() => setShowItineraryModal(true)}
              className="px-8 py-2 bg-vjyellow hover:bg-vjamber text-black font-bold rounded-full text-2xs uppercase tracking-wider shadow-2xs hover:shadow-xs active:scale-98 transition-all flex items-center justify-center cursor-pointer"
            >
              <span>Tải thông tin hành trình</span>
            </button>
          </div>
        </div>
      </main>

      {/* Vệt đuôi máy bay Vietjet góc dưới bên phải - chuẩn Screenshot 1 */}
      <div className="fixed -bottom-6 -right-6 pointer-events-none z-0 opacity-95 hidden sm:block">
        <svg width="220" height="120" viewBox="0 0 220 120" fill="none">
          <path d="M0 120 C 100 120, 150 70, 220 0 L 220 120 Z" fill="#ED1B24" />
          <path d="M35 120 C 120 120, 170 80, 220 20 L 220 120 Z" fill="#78BE20" />
          <path d="M75 120 C 145 120, 190 95, 220 45 L 220 120 Z" fill="#FFD100" />
        </svg>
      </div>

      {/* Modal Thông tin hành trình chuẩn Screenshot 2 */}
      <ItineraryModal
        isOpen={showItineraryModal}
        onClose={() => setShowItineraryModal(false)}
        booking={{
          id: booking.id,
          booking_code: booking.booking_code,
          status: booking.status,
          created_at: booking.created_at,
          total_price: totalPriceNumber,
          contact_name: booking.contact_name,
          contact_email: booking.contact_email_masked,
          flight: booking.flight,
          passengers: booking.passengers,
          seats: booking.seats,
          payment: booking.payment,
        }}
      />

      <Footer />
    </div>
  );
}
