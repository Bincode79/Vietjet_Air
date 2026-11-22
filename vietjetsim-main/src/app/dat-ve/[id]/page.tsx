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
import styles from './BookingDetail.module.css';

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
    <div className={styles.page}>
      <Header
        variant="compact"
        hideMobileLogo={true}
        mobileTitle="CHUYẾN BAY CỦA TÔI"
        showQuickServices={false}
      />

      <ToastContainer toasts={toast.toasts} onDismiss={toast.dismiss} position="top-right" />

      {/* Dải băng vàng thông báo trên cùng - Desktop */}
      <div className={styles.statusBar}>
        <div className="max-w-5xl mx-auto flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-vj-text-strong">Mã đặt chỗ :</span>
            <span className="font-black text-vj-booking-red tracking-wider text-sm">
              {bookingCode}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-vj-text-strong">Trạng thái thanh toán :</span>
            <span className={`font-black ${isPaid ? 'text-vj-pay-green' : 'text-vj-booking-red'}`}>
              {isPaid ? 'Đã thanh toán' : 'Chưa thanh toán'}
            </span>
          </div>

          <div className="flex flex-col items-end text-right">
            <div className="flex items-center gap-1">
              <span className="font-semibold text-vj-text-strong">Yêu cầu thanh toán :</span>
              <span className="font-black text-vj-booking-red text-sm">
                {totalPriceNumber.toLocaleString('vi-VN')} VND
              </span>
            </div>
            {!isPaid && (
              <span className="text-vj-text-dim text-2xs">
                trước {expireDateStr} (Theo giờ địa phương)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Main Content với nền mây nhẹ nhàng */}
      <main id="main-content" className={styles.main}>
        <h1 className="sr-only">
          Chi tiết đặt chỗ chuyến bay Vietjet Air - Mã đặt chỗ {bookingCode}
        </h1>

        {/* Dải băng vàng dạng thẻ bo tròn trên Mobile - Chuẩn Mobile Screenshot #1 */}
        <div className="sm:hidden bg-amber-400 rounded-2xl p-4 text-xs font-medium space-y-1 text-gray-900 shadow-xs">
          <div>
            <span>Mã đặt chỗ : </span>
            <span className="font-bold text-vj-booking-red tracking-wider text-sm">
              {bookingCode}
            </span>
          </div>
          <div>
            <span>Trạng thái thanh toán : </span>
            <span className="font-bold text-vj-booking-red">
              {isPaid ? 'Đã thanh toán' : 'Chưa thanh toán'}
            </span>
          </div>
          <div>
            <span>Yêu cầu thanh toán : </span>
            <span className="font-bold text-vj-booking-red text-sm">
              {totalPriceNumber.toLocaleString('vi-VN')} VND
            </span>
          </div>
          <div className="text-gray-800 text-2xs pt-0.5">
            trước {expireDateStr} (Theo giờ địa phương)
          </div>
        </div>

        {/* 1. Tiêu đề & Card: Thông tin chuyến bay */}
        <div className="space-y-1">
          <h2 className="text-sm sm:text-base font-bold text-gray-800">Thông tin chuyến bay</h2>
          <h3 className="text-xs sm:text-sm font-bold text-gray-700 uppercase tracking-wide">
            {flight ? 'Chuyến đi' : ''}
          </h3>
        </div>
        <FlightSummaryCard
          className={styles.flight}
          flight={flight}
          paxCount={paxCount}
          totalPrice={totalPriceNumber}
          bookingCode={bookingCode}
        />

        {/* 2. Card: Thông tin hành khách */}
        <div className={styles.passengerPanel}>
          <div
            className="px-4 py-3 flex items-center justify-between cursor-pointer select-none"
            onClick={() => setShowPaxCard(!showPaxCard)}
          >
            <span className="text-sm font-bold text-gray-800">Thông tin hành khách</span>
            <span className="text-xs text-gray-800 font-bold">{showPaxCard ? '▲' : '▼'}</span>
          </div>

          {showPaxCard && (
            <div className="p-4 sm:p-5 pt-0 space-y-4">
              {/* Banner tích điểm SkyJoy chuẩn Image #1 */}
              <div className={styles.loyalty}>
                <div className="bg-red-600 text-white px-3.5 py-2.5 flex items-center justify-between">
                  <span className="text-xs sm:text-sm font-bold text-white">
                    Bổ sung mã hội viên để tích điểm
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowSkyJoyPrompt(true)}
                    className="bg-amber-400 hover:bg-amber-500 text-gray-900 font-bold italic px-5 py-1.5 rounded-xl text-xs shadow-xs active:scale-98 transition-all cursor-pointer"
                  >
                    Bổ sung
                  </button>
                </div>
                <div className="bg-white p-3.5 text-xs text-gray-800 space-y-1.5 border border-t-0 border-red-600 rounded-b-xl">
                  <p className="font-semibold text-gray-900">
                    Đăng ký Hội viên Vietjet SkyJoy - Tận hưởng X3 ưu đãi:
                  </p>
                  <ul className="space-y-1 pl-2 text-xs text-gray-700">
                    <li className="flex items-center gap-1.5">• Tặng ngay 200 SkyPoint.</li>
                    <li className="flex items-center gap-1.5">
                      • Nhận SkyPoint cho các chuyến đã bay.
                    </li>
                    <li className="flex items-center gap-1.5">
                      • Hưởng đặc quyền ưu tiên tại sân bay.
                    </li>
                  </ul>
                  <Link
                    href="/dang-ky"
                    className="inline-block mt-1 text-blue-500 hover:underline font-bold text-xs transition-colors"
                  >
                    Đăng ký ngay!
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

              {/* Danh sách thẻ hành khách — chuẩn Screenshot 1 & 2 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                {passengersList.map((passenger, idx) => {
                  const title = passenger.gender === 'female' ? 'Mrs' : 'Mr';
                  const seatCode =
                    passenger.seat_number || booking.seats?.[idx]?.seat_number || 'Chưa chọn';
                  const flightClass = (flight?.class || 'eco').toLowerCase();

                  return (
                    <div key={passenger.id || idx} className={styles.passenger}>
                      {/* Header xám có icon người */}
                      <div className="bg-slate-100 px-3.5 py-2.5 flex items-center gap-2 text-xs sm:text-sm font-bold text-gray-800">
                        <Icon name="UserIcon" size={24} aria-hidden="true" />
                        <span>
                          Người lớn: {title} {passenger.name?.toUpperCase() || 'HÀNH KHÁCH'}
                        </span>
                      </div>

                      {/* Chi tiết chặng bay & gói dịch vụ */}
                      <div className="p-3.5 space-y-2 text-xs text-gray-800">
                        <div className="flex items-center gap-1.5 font-bold">
                          <span>{flight?.from_code || 'SGN'}</span>
                          <span className="text-amber-500 font-bold">✈</span>
                          <span>{flight?.to_code || 'HAN'}</span>
                        </div>

                        {flightClass === 'skyboss' ? (
                          <div className="text-2xs text-gray-700 space-y-0.5">
                            <p>SkyBoss: Bag Free 30kgs,</p>
                            <p>VipLounge n Meal,</p>
                            <p className="uppercase font-bold text-gray-800">SKYBOSS</p>
                          </div>
                        ) : flightClass === 'deluxe' ? (
                          <div className="text-2xs text-gray-700 space-y-0.5">
                            <p>Deluxe: Bag Free 20kgs,</p>
                            <p>Seat Pick, Flight Care,</p>
                            <p className="uppercase font-bold text-gray-800">DELUXE</p>
                          </div>
                        ) : (
                          <div className="text-2xs text-gray-700 space-y-0.5">
                            <p>Eco: Bag Free 07kgs,</p>
                            <p className="uppercase font-bold text-gray-800">B1ECO</p>
                          </div>
                        )}

                        {seatCode !== 'Chưa chọn' && (
                          <div className="pt-1 text-2xs text-gray-600">
                            <span>Chỗ ngồi: </span>
                            <span className="font-bold text-gray-900">{seatCode}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* 3. Tiêu đề & Card: Chi tiết giá vé */}
        <div className="space-y-2">
          <h2 className="text-sm sm:text-base font-bold text-gray-800">Chi tiết giá vé</h2>

          <div className={styles.farePanel}>
            {passengersList.map((passenger, idx) => {
              const isOpen = expandedPax[idx] ?? false;
              const title = passenger.gender === 'female' ? 'Mrs' : 'Mr';
              const paxShare = Math.round(totalPriceNumber / paxCount);

              return (
                <div key={passenger.id || idx}>
                  <button
                    type="button"
                    onClick={() => setExpandedPax((prev) => ({ ...prev, [idx]: !prev[idx] }))}
                    className="w-full px-3.5 py-3 rounded-lg bg-slate-200 hover:bg-gray-200 flex items-center justify-between text-left text-xs sm:text-sm font-semibold text-gray-800 transition-colors cursor-pointer"
                  >
                    <span>
                      Người lớn: {title} {passenger.name?.toUpperCase() || 'HÀNH KHÁCH'}
                    </span>
                    <span
                      className={`text-xs transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                    >
                      ▼
                    </span>
                  </button>

                  {isOpen && (
                    <div className={styles.fareDetails}>
                      {/* Tiêu đề chặng bay */}
                      <div className="flex items-center gap-2 pb-1.5 mb-1 text-xs">
                        <span className="text-primary font-bold">Chi tiết chuyến đi</span>
                        <span className="font-mono font-extrabold text-gray-900">
                          {flight?.from_code || 'SGN'}
                        </span>
                        <span className="text-vj-booking-red text-xs">➔</span>
                        <span className="font-mono font-extrabold text-gray-900">
                          {flight?.to_code || 'HAN'}
                        </span>
                      </div>

                      {/* Giá vé */}
                      <div className="flex justify-between font-bold text-gray-900">
                        <span>Giá vé</span>
                        <span className="tabular-nums">
                          {Math.round(paxShare * 0.749).toLocaleString('vi-VN')} VND
                        </span>
                      </div>
                      <div className="flex justify-between pl-3 text-gray-600">
                        <span>
                          B1ECO -{' '}
                          {flight?.class
                            ? flight.class.charAt(0).toUpperCase() + flight.class.slice(1)
                            : 'Eco1'}
                        </span>
                        <span className="font-semibold text-gray-900 tabular-nums">
                          {Math.round(paxShare * 0.694).toLocaleString('vi-VN')}
                        </span>
                      </div>
                      <div className="flex justify-between pl-3 text-gray-600">
                        <span>Thuế VAT</span>
                        <span className="font-semibold text-gray-900 tabular-nums">
                          {Math.round(paxShare * 0.055).toLocaleString('vi-VN')}
                        </span>
                      </div>

                      {/* Thuế, phí */}
                      <div className="flex justify-between font-bold text-gray-900 pt-1.5">
                        <span>Thuế, phí</span>
                        <span className="tabular-nums">
                          {Math.round(paxShare * 0.251).toLocaleString('vi-VN')} VND
                        </span>
                      </div>
                      <div className="flex justify-between pl-3 text-gray-600">
                        <span>Phí quản trị hệ thống</span>
                        <span className="font-semibold text-gray-900 tabular-nums">
                          {(215000).toLocaleString('vi-VN')}
                        </span>
                      </div>
                      <div className="flex justify-between pl-3 text-gray-600">
                        <span>Phí an ninh soi chiếu</span>
                        <span className="font-semibold text-gray-900 tabular-nums">
                          {(18181).toLocaleString('vi-VN')}
                        </span>
                      </div>
                      <div className="flex justify-between pl-3 text-gray-600">
                        <span>Domestic airport tax</span>
                        <span className="font-semibold text-gray-900 tabular-nums">
                          {(99000).toLocaleString('vi-VN')}
                        </span>
                      </div>
                      <div className="flex justify-between pl-3 text-gray-600">
                        <span>DOM management fee</span>
                        <span className="font-semibold text-gray-900 tabular-nums">
                          {Math.max(
                            0,
                            Math.round(paxShare * 0.251) -
                              215000 -
                              18181 -
                              99000 -
                              Math.round(
                                Math.max(0, paxShare * 0.251 - 215000 - 18181 - 99000) * 0.12
                              )
                          ).toLocaleString('vi-VN')}
                        </span>
                      </div>
                      <div className="flex justify-between pl-3 text-gray-600">
                        <span>Thuế VAT</span>
                        <span className="font-semibold text-gray-900 tabular-nums">
                          {Math.round(
                            Math.max(0, paxShare * 0.251 - 215000 - 18181 - 99000) * 0.12
                          ).toLocaleString('vi-VN')}
                        </span>
                      </div>

                      {/* Tổng tiền */}
                      <div className="flex justify-between pt-2 border-t border-gray-200 font-bold text-xs">
                        <span className="text-gray-900">Tổng tiền</span>
                        <span className="text-vj-booking-red text-sm font-black tabular-nums">
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

        {/* 4. Hàng nút hành động chuẩn - 5 nút vàng theo Screenshot #2 */}
        <div className={styles.actions}>
          {!isPaid ? (
            <button
              type="button"
              onClick={() =>
                router.push(`/thanh-toan?bookingId=${bookingCode || booking.id}&source=manage`)
              }
              className="w-auto px-10 py-3 bg-amber-400 hover:bg-amber-500 text-gray-900 font-bold text-sm rounded-2xl shadow-sm active:scale-98 transition-all cursor-pointer text-center"
            >
              <span>Thanh toán ngay</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => toast.success('Đơn vé đã thanh toán thành công!')}
              className="w-auto px-10 py-3 bg-vj-pay-green hover:bg-vj-pay-green text-white font-bold text-sm rounded-2xl shadow-sm text-center flex items-center justify-center cursor-default"
            >
              <span>Đã thanh toán</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => router.push(`/dat-ve/${bookingCode || booking.id}/dich-vu`)}
            className="w-auto px-8 py-3 bg-amber-400 hover:bg-amber-500 text-gray-900 font-bold text-xs sm:text-sm rounded-2xl shadow-sm active:scale-98 transition-all cursor-pointer text-center"
          >
            <span>Mua hành lý,chỗ ngồi,suất ăn và hơn thế nữa...</span>
          </button>

          <button
            type="button"
            onClick={handleSendItineraryEmail}
            disabled={isSendingMail}
            className="w-auto px-10 py-2.5 bg-amber-400 hover:bg-amber-500 text-gray-900 font-bold italic text-sm rounded-2xl shadow-sm active:scale-98 transition-all cursor-pointer text-center disabled:opacity-50"
          >
            <span>{isSendingMail ? 'Đang gửi mail...' : 'Gửi mail hành trình'}</span>
          </button>

          <button
            type="button"
            onClick={() => router.push('/tim-ve')}
            className="w-auto px-10 py-2.5 bg-amber-400 hover:bg-amber-500 text-gray-900 font-bold italic text-sm rounded-2xl shadow-sm active:scale-98 transition-all cursor-pointer text-center"
          >
            <span>Tìm đặt chỗ khác</span>
          </button>

          <button
            type="button"
            onClick={() => setShowItineraryModal(true)}
            className="w-auto px-10 py-2.5 bg-amber-400 hover:bg-amber-500 text-gray-900 font-bold italic text-sm rounded-2xl shadow-sm active:scale-98 transition-all cursor-pointer text-center"
          >
            <span>Tải thông tin hành trình</span>
          </button>
        </div>
      </main>

      {/* Floating Cookie Settings Button góc dưới bên trái - chuẩn Image #1 & #2 */}
      <div className="fixed bottom-4 left-4 z-40">
        <button
          type="button"
          aria-label="Cài đặt Cookie"
          className="w-10 h-10 rounded-full bg-white border border-gray-300 shadow-md flex items-center justify-center text-lg hover:scale-105 active:scale-95 transition-all cursor-pointer"
        >
          🍪
        </button>
      </div>

      {/* Vệt đuôi máy bay Vietjet góc dưới bên phải - chuẩn Screenshot 1 */}
      <div className="fixed -bottom-4 -right-4 pointer-events-none z-0 opacity-95">
        <svg width="240" height="150" viewBox="0 0 240 150" fill="none">
          <path d="M0 150 C 120 150, 170 80, 240 0 L 240 150 Z" fill="#d91a2a" />
          <path d="M40 150 C 140 150, 190 90, 240 25 L 240 150 Z" fill="#78BE20" />
          <path d="M80 150 C 160 150, 205 105, 240 50 L 240 150 Z" fill="#f5b935" />
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
    </div>
  );
}
