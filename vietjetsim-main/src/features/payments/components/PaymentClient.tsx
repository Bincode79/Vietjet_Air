'use client';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import PassengerDetailModal from '@/app/tim-ve/components/PassengerDetailModal';
import { Icon } from '@/shared/components/ui';
import { PaymentSkeleton } from '@/shared/components/ui';
import { useToast } from '@/hooks/useToast';
import { ToastContainer } from '@/shared/components/feedback';
import { getAirportCity } from '@/features/flights';
import { TAX_AND_FEE_RATE, ANCILLARY_OPTIONS, type AncillaryId } from '@/features/bookings/pricing';

import { apiRequest, ApiRequestError } from '@/shared/services';
import { MOVI_HOLD_MINUTES } from '@/lib/movi';
import PaymentModal from './PaymentModal';
import ReservationCountdown from './ReservationCountdown';
import BookingTicketCard from './BookingTicketCard';
import GatewayQrPage from './GatewayQrPage';
import CardGatewayContent from './gateway/CardGatewayContent';
import MoviGatewayContent from './gateway/MoviGatewayContent';
import { GalaxyPayBadge } from './PaymentMethodLogos';
import { usePaymentMethod } from '@/features/payments/hooks/usePaymentMethod';
import {
  PaymentCategorySection,
  SecurityFooter,
} from '@/features/payments/components/PaymentMethodCard';

/**
 * `YYYY-MM-DD` from the booking, as `d/M/yyyy`.
 *
 * This is a calendar date, not an instant, so it is split by hand: handing
 * `'2026-10-07'` to `new Date()` would read it as UTC midnight and, anywhere
 * west of GMT, print the day before.
 */
function formatBookingDay(day: string): string {
  const [year, month, date] = day.split('-');
  if (!year || !month || !date) return day;
  return `${Number(date)}/${Number(month)}/${year}`;
}

function formatHoldExpireDate(iso?: string | null): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} | ${hours}:${mins}`;
  } catch {
    return '';
  }
}

export default function PaymentClient() {
  const router = useRouter();
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [_promoChecked] = useState(false);

  // Hook quản lý state phương thức thanh toán (nhóm theo danh mục)
  const {
    selectedMethodGroup,
    paymentMethod,
    isMovi,
    selectMethod,
    methodsByCategory,
    activeCategories,
  } = usePaymentMethod();
  const [promoCode, setPromoCode] = useState('');
  const [promoApplied, setPromoApplied] = useState(false);
  const [promoData, setPromoData] = useState<{
    id: string;
    code: string;
    type: string;
    value: number;
    discountAmount: number;
  } | null>(null);
  const [promoError, setPromoError] = useState('');
  const [isApplyingPromo, setIsApplyingPromo] = useState(false);
  const searchParams = useSearchParams();
  const bookingParam =
    searchParams?.get('bookingId') || searchParams?.get('code') || searchParams?.get('id');
  const [initialBookingId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    return params.get('bookingId') || params.get('code') || params.get('id');
  });
  const bookingId = bookingParam || initialBookingId;
  const [bookingCode, setBookingCode] = useState<string | null>(() => bookingParam ?? null);
  const [isBookingLoading, setIsBookingLoading] = useState<boolean>(() => !!bookingId);

  // Read booking data from sessionStorage (set by FlightBookingClient)
  const [booking, setBooking] = useState<{
    bookingId?: string;
    bookingCode?: string;
    returnBookingId?: string;
    contactEmail?: string;
    contactPhone?: string;
    flightNo: string;
    returnFlightNo?: string;
    from: string;
    to: string;
    fromCity: string;
    toCity: string;
    departTime: string;
    arriveTime: string;
    returnDepartTime?: string;
    returnArriveTime?: string;
    date: string;
    returnDate?: string;
    status?: string;
    hold_expires_at?: string;
    hold_method?: string;
    passengers: { name: string; seat: string; returnSeat?: string }[];
    /** Air fare across all passengers (written by FlightBookingClient). */
    fareSubtotal: number;
    tax: number;
    seatFee: number;
    ancillaryFee?: number;
    ancillaries?: AncillaryId[];
    total: number;
  } | null>(null);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('vjsim_booking');
      if (stored) {
        const parsed = JSON.parse(stored);
        setBooking(parsed);
        if (parsed.bookingCode && parsed.bookingCode !== '—') {
          setBookingCode(parsed.bookingCode);
        }
      }
      // Không có `vjsim_booking` ⇒ khách chưa có đơn đặt vé nào. Trước đây
      // nhánh `else` dựng một booking giả (VJ141 SGN→HAN, NGUYỄN VĂN AN,
      // 1.730.000đ) để "trang luôn hiển thị đầy đủ". Hậu quả: mở /thanh-toán
      // trực tiếp — hoặc từ một tab mới — hiện một vé điện tử hoàn chỉnh
      // cho một chuyến bay không tồn tại, kèm giá, giờ bay và thông tin hành
      // khách bịa. Khách đọc đó là vé của họ. `booking` phải giữ `null` để
      // trang hiện trạng thái "chưa có đơn" thật sự.
    } catch {
      // JSON hỏng ⇒ cũng coi như chưa có đơn.
    }
  }, []);

  useEffect(() => {
    if (!bookingId) return;
    let cancelled = false;
    apiRequest<{
      booking?: {
        id: string;
        booking_code: string | null;
        total_price?: number | string;
        status?: string;
        hold_expires_at?: string;
        hold_method?: string;
        flight?: {
          flight_no: string;
          from_code: string;
          to_code: string;
          depart_time: string;
          arrive_time: string;
          price: number;
          class: string;
        } | null;
        passengers?: Array<{
          name: string;
          seat_number?: string;
        }>;
        seats?: Array<{
          seat_number: string;
        }>;
      };
    }>(`/api/dat-ve/${bookingId}`)
      .then((data) => {
        if (!cancelled && data.booking) {
          const b = data.booking;
          setBookingCode(b.booking_code ?? null);
          const dbTotal = Number(b.total_price || 0);
          const dbFlight = b.flight;
          // Mọi trường dưới đây đến từ database. Trước đây chúng có
          // fallback về SGN/HAN/VJ141/08:30 và tên hành khách bịa — nghĩa là
          // một booking không có chuyến bay (dữ liệu chưa đủ) vẫn được hiện
          // như một chuyến bay hoàn chỉnh. Thiếu dữ liệu thì phải hiện
          // thiếu dữ liệu.
          const fromCode = (dbFlight?.from_code || '').toUpperCase();
          const toCode = (dbFlight?.to_code || '').toUpperCase();
          const departTimeStr = dbFlight?.depart_time
            ? new Date(dbFlight.depart_time).toLocaleTimeString('vi-VN', {
                hour: '2-digit',
                minute: '2-digit',
              })
            : '';
          const arriveTimeStr = dbFlight?.arrive_time
            ? new Date(dbFlight.arrive_time).toLocaleTimeString('vi-VN', {
                hour: '2-digit',
                minute: '2-digit',
              })
            : '';
          const dateStr = dbFlight?.depart_time
            ? new Date(dbFlight.depart_time).toISOString().split('T')[0]
            : '';
          const paxList = (b.passengers || []).map((p, idx) => ({
            name: p.name || `Hành khách ${idx + 1}`,
            seat: p.seat_number || b.seats?.[idx]?.seat_number || 'Chưa chọn',
          }));

          setBooking((prev) => ({
            ...prev,
            bookingId: b.id,
            flightNo: dbFlight?.flight_no || prev?.flightNo || '',
            from: fromCode,
            to: toCode,
            fromCity: fromCode ? getAirportCity(fromCode) : '',
            toCity: toCode ? getAirportCity(toCode) : '',
            departTime: departTimeStr,
            arriveTime: arriveTimeStr,
            date: dateStr,
            passengers:
              paxList.length > 0
                ? paxList.map((p, idx) => ({
                    ...p,
                    returnSeat: prev?.passengers?.[idx]?.returnSeat,
                  }))
                : (prev?.passengers ?? []),
            status: b.status,
            hold_expires_at: b.hold_expires_at,
            hold_method: b.hold_method,
            fareSubtotal: Math.round(dbTotal * 0.65),
            tax: Math.round(dbTotal * 0.25),
            seatFee: prev?.seatFee ?? 0,
            ancillaryFee: Math.round(dbTotal * 0.1),
            ancillaries: prev?.ancillaries || [],
            total: dbTotal > 0 ? dbTotal : (prev?.total ?? 0),
            returnBookingId: prev?.returnBookingId,
            returnFlightNo: prev?.returnFlightNo,
            returnDepartTime: prev?.returnDepartTime,
            returnArriveTime: prev?.returnArriveTime,
            returnDate: prev?.returnDate,
          }));
        }
      })
      .catch(() => {
        // A missing PNR must not block payment, and apiRequest already logged it.
        if (!cancelled) setBookingCode(null);
      })
      .finally(() => {
        if (!cancelled) {
          setIsBookingLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [bookingId]);

  const bookingCodeLabel = bookingCode ?? '—';
  const discountAmount = promoApplied && promoData ? promoData.discountAmount : 0;
  const total = booking ? booking.total - discountAmount : 0;
  const [pageLoading, setPageLoading] = useState(true);
  const [showVietQrModal, setShowVietQrModal] = useState(false);
  const [gatewaySuccess, setGatewaySuccess] = useState(false);
  const [gatewayDownloaded, setGatewayDownloaded] = useState(false);
  const [showGateway, setShowGateway] = useState(false);
  const [gatewayMethod, setGatewayMethod] = useState<string>('qr');
  const toast = useToast();

  const vietQrConvenienceFee = useMemo(() => {
    if (!booking) return 0;
    return (booking.seatFee ?? 0) + (booking.ancillaryFee ?? 0);
  }, [booking]);

  const vietQrGrandTotal = useMemo(() => {
    const subtotal = booking?.fareSubtotal ?? 0;
    return Math.max(0, subtotal + vietQrConvenienceFee - discountAmount);
  }, [booking, vietQrConvenienceFee, discountAmount]);

  useEffect(() => {
    const timer = setTimeout(() => setPageLoading(false), 50);
    return () => clearTimeout(timer);
  }, []);

  /**
   * Mốc hết hạn của lượt giữ chỗ MOVI (30 phút), do SERVER quyết định.
   *
   * Đồng hồ đếm ngược đọc mốc này, không tự đếm — vì "tự hủy sau 30 phút"
   * chỉ có nghĩa nếu mốc thời gian nằm ở server. Một bộ đếm phía client
   * đóng tab là mất trắng, và chỉnh ngày giờ máy là thay đổi luật.
   */
  const [moviHoldExpiresAt, setMoviHoldExpiresAt] = useState<string | null>(null);

  // Ưu tiên dùng PNR (booking_code) làm lookup target cho cả hold lẫn thanh toán
  // để mọi khách (dù chưa đăng nhập hoặc tra cứu lại vé) đều được cấp quyền qua canAccessBooking
  const effectiveLookupTarget =
    (bookingCode && bookingCode !== '—' ? bookingCode : null) ||
    (booking?.bookingCode && booking.bookingCode !== '—' ? booking.bookingCode : null) ||
    booking?.bookingId ||
    bookingId;

  const isPnrLookup = useMemo(() => {
    const src = searchParams?.get('source');
    if (src === 'manage') return true;
    if (typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search);
      if (sp.get('source') === 'manage') return true;
    }
    if (booking?.hold_expires_at || booking?.status === 'pending_hold') return true;
    return false;
  }, [searchParams, booking?.hold_expires_at, booking?.status]);

  const acquireMoviHold = useCallback(async () => {
    if (!effectiveLookupTarget) return;
    try {
      const data = await apiRequest<{
        hold?: { method?: string; expiresAt?: string; minutes?: number } | null;
      }>(`/api/dat-ve/${effectiveLookupTarget}/giu-cho`, {
        method: 'POST',
        body: { action: 'hold' },
      });
      if (data.hold?.expiresAt) {
        setMoviHoldExpiresAt(data.hold.expiresAt);
      }
    } catch (_err) {
      // Không giữ được chỗ thì vẫn cho khách thanh toán (đây là phương thức
      // thanh toán, không phải điều kiện được phép thanh toán) — nhưng phải
      // nói rõ, vì lúc đó không có ai hủy booking giúp khách.
      toast.error(
        'Không giữ được chỗ vé',
        'Vui lòng kiểm tra kết nối và thử lại. Mã đặt chỗ sẽ không tự hủy nếu chưa đặt giữ chỗ thành công.'
      );
    }
  }, [effectiveLookupTarget, toast]);

  useEffect(() => {
    if (paymentMethod !== 'movi') return;
    if (!effectiveLookupTarget) return;
    void acquireMoviHold();
  }, [paymentMethod, effectiveLookupTarget, acquireMoviHold]);

  /**
   * Đồng hồ đếm về 0 ⇒ báo cho server hủy booking NGAY, thay vì chờ một
   * request khác chạm vào nó. Endpoint cũng quét mọi lượt giữ chỗ quá hạn,
   * nên "tự hủy" không phụ thuộc vào việc khách còn mở trang này.
   */
  const handleMoviHoldExpired = useCallback(() => {
    if (!effectiveLookupTarget) return;
    void apiRequest<{ expired?: boolean; booking_status?: string }>(
      `/api/dat-ve/${effectiveLookupTarget}/giu-cho`,
      { method: 'POST', body: { action: 'expire' } }
    ).then((data) => {
      if (data.expired || data.booking_status === 'cancelled') {
        toast.error(
          'Hết thời gian giữ chỗ',
          'Mã đặt chỗ đã bị hủy. Vui lòng đặt vé lại để tiếp tục.'
        );
      }
    });
  }, [effectiveLookupTarget, toast]);

  /** Gia hạn lượt giữ chỗ MOVI (nút "Gia hạn" của đồng hồ đếm ngược). */
  const renewMoviHold = useCallback(() => {
    void acquireMoviHold();
  }, [acquireMoviHold]);

  // Transfer content the customer must paste into their bank app. Admins
  // control the template (Admin → Ngân hàng); the amounts are rendered without
  // thousand separators so a receiving bank cannot misread them.
  // Mỗi phương thức thanh toán có trang cổng riêng tại
  // /thanh-toan/gateway/<method> — cổng đó tự tải lại booking và gọi API,
  // nên ở đây chỉ cần chuyển hướng kèm bookingId + mã giảm giá (nếu có).
  const GATEWAY_METHOD_BY_GROUP: Record<string, string> = {
    vnpay_qr: 'qr',
    vietqr: 'qr',
    vnpay_dom: 'qr',
    napas: 'napas',
    card: 'card',
    applepay: 'card',
    googlepay: 'card',
    momo: 'ewallet',
    zalopay: 'ewallet',
    skypoint: 'skypoint',
    movi: 'movi',
    wallet: 'wallet',
    bank: 'bank',
  };
  const goToPaymentGateway = () => {
    const gw = GATEWAY_METHOD_BY_GROUP[selectedMethodGroup] || 'qr';
    setGatewayMethod(gw);
    setGatewaySuccess(false);
    setGatewayDownloaded(false);
    setShowGateway(true);
  };

  const applyPromo = async () => {
    if (!promoCode.trim()) return;
    setPromoError('');
    setIsApplyingPromo(true);
    try {
      const data = await apiRequest<{
        valid: boolean;
        discount: typeof promoData;
        message?: string;
      }>('/api/ma-giam-gia/xac-thuc', {
        method: 'POST',
        body: {
          code: promoCode,
          // The discount is sized against the booking total — the same base the
          // server uses. The page's own split into fare / tax / ancillary is
          // fabricated, so sending the fare subtotal here made a percentage
          // code worth a different amount on the two sides.
          bookingAmount: booking?.total || 0,
        },
      });
      if (data.valid) {
        setPromoApplied(true);
        setPromoData(data.discount);
        toast.success('Thành công', 'Đã áp dụng mã giảm giá');
      } else {
        setPromoApplied(false);
        setPromoData(null);
        setPromoError(data.message || 'Mã giảm giá không hợp lệ');
      }
    } catch (error) {
      setPromoApplied(false);
      setPromoData(null);
      setPromoError(
        error instanceof ApiRequestError ? error.message : 'Có lỗi xảy ra khi kiểm tra mã giảm giá'
      );
    } finally {
      setIsApplyingPromo(false);
    }
  };

  if (pageLoading || isBookingLoading) {
    return <PaymentSkeleton />;
  }

  /**
   * Chưa có đơn đặt vé ⇒ không có gì để thanh toán.
   *
   * Đây là trạng thái thật: khách mở `/thanh-toan` mà chưa đi qua luồng đặt vé
   * (mở tab mới, quay lại sau khi session hết hạn, bấm link trực tiếp). Trước
   * đây trang dựng một booking giả và hiện một vé điện tử hoàn chỉnh — chuyến
   * bay, giờ bay, hành khách, tổng tiền, QR chuyển khoản — cho một chuyến bay
   * không tồn tại. Khách đọc đó là vé của họ.
   */
  if (isBookingLoading) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-4 py-16">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin mx-auto mb-3" />
          <h2 className="text-sm font-bold text-gray-700 font-koho">
            Đang tải thông tin đặt chỗ...
          </h2>
        </div>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-4 py-16">
        <div className="max-w-md w-full text-center">
          <div className="w-20 h-20 mx-auto rounded-2xl bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-center">
            <Icon name="TicketIcon" size={36} className="text-[var(--foreground-subtle)]" />
          </div>
          <h1 className="mt-6 text-xl font-black font-koho text-[var(--vj-navy)]">
            Chưa có đơn đặt vé để thanh toán
          </h1>
          <p className="mt-3 text-sm text-[var(--foreground-muted)] leading-relaxed">
            Bạn chưa có đơn đặt vé nào đang chờ thanh toán. Hãy chọn chuyến bay và hoàn tất thông
            tin hành khách trước, hoặc xem các chuyến đã đặt của bạn.
          </p>
          <div className="mt-7 flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/tim-ve"
              className="vj-btn vj-btn-primary px-6 py-3 rounded-vj text-sm inline-flex items-center justify-center gap-2"
            >
              <Icon name="MagnifyingGlassIcon" size={16} />
              Tìm chuyến bay
            </Link>
            <Link
              href="/chuyen-bay-cua-toi"
              className="vj-btn vj-btn-outline px-6 py-3 rounded-vj text-sm inline-flex items-center justify-center gap-2"
            >
              <Icon name="TicketIcon" size={16} />
              Chuyến bay của tôi
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Khi khách đã chọn phương thức → hiển thị trang cổng thanh toán tương ứng
  // Layout (Header/Footer) được cung cấp bởi trang cha (src/app/thanh-toan/page.tsx).
  if (showGateway) {
    return (
      <main
        id="main-content"
        className="min-h-screen bg-gradient-to-b from-vj-blue-tint-5 via-vj-blue-tint-4 to-vj-blue-tint-3 relative py-8 sm:py-12 px-4 sm:px-6"
      >
        {gatewaySuccess ? (
          <div className="mx-auto max-w-md rounded-2xl border border-vj-border-light bg-white px-5 py-8 text-center font-koho shadow-vj-sm sm:p-10">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
              <Icon name="CheckCircleIcon" size={32} className="text-green-600" />
            </div>
            <h2 className="text-xl font-black text-vj-text font-koho">Thanh toán thành công</h2>
            <p className="mt-2 text-sm text-vj-gray">
              Đơn hàng <strong className="text-vj-text">{bookingCodeLabel}</strong> đã được xác
              nhận.
            </p>
            <button
              type="button"
              onClick={() => setGatewayDownloaded(true)}
              disabled={gatewayDownloaded}
              className="mt-6 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-vj bg-primary px-6 py-2.5 text-sm font-bold text-white enabled:hover:bg-primary-dark disabled:bg-green-100 disabled:text-green-800 sm:w-auto"
            >
              <Icon name={gatewayDownloaded ? 'CheckCircleIcon' : 'ArrowDownTrayIcon'} size={16} />
              {gatewayDownloaded ? 'Đã tải vé điện tử' : 'Tải vé điện tử'}
            </button>
          </div>
        ) : (
          <>
            {gatewayMethod === 'card' ? (
              <CardGatewayContent
                bookingId={booking?.bookingId || bookingId || ''}
                bookingCode={booking?.bookingCode ?? bookingCodeLabel}
                amount={total}
                onSuccess={() => setGatewaySuccess(true)}
              />
            ) : gatewayMethod === 'movi' ? (
              <MoviGatewayContent
                bookingId={booking?.bookingId || bookingId || ''}
                bookingCode={booking?.bookingCode ?? bookingCodeLabel}
                amount={total}
                onSuccess={() => {
                  setGatewaySuccess(true);
                }}
              />
            ) : (
              <GatewayQrPage
                method={gatewayMethod}
                bookingId={booking?.bookingId || bookingId || ''}
                bookingCode={booking?.bookingCode ?? bookingCodeLabel}
                amount={total}
                flightNo={booking?.flightNo}
                from={booking?.from}
                to={booking?.to}
                departTime={booking?.departTime}
                date={booking?.date}
                onBack={() => setShowGateway(false)}
              />
            )}
          </>
        )}
      </main>
    );
  }

  return (
    <>
      {/* Trip strip — brand-yellow band directly under header matching Image #1 or Image #8 */}
      {isPnrLookup ? (
        <div
          className="bg-vj-yellow text-vj-dark shadow-vj-sm border-b border-amber-300 py-2 sm:py-2.5 px-3 sm:px-6 z-20 font-koho sticky top-[48px] lg:top-[74px]"
          data-testid="trip-board"
        >
          <div className="max-w-5xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-2 text-2xs sm:text-xs">
            <div className="flex items-center justify-between sm:justify-start gap-3">
              <div className="flex items-center gap-1.5 font-bold">
                <span>Mã đặt chỗ :</span>
                <span className="text-red-600 font-black text-xs sm:text-sm font-mono">
                  {bookingCodeLabel}
                </span>
              </div>
              <div className="flex items-center gap-1.5 font-bold">
                <span className="hidden sm:inline">Trạng thái:</span>
                <span className="text-red-600 font-bold bg-red-100 text-3xs px-2 py-0.5 rounded">
                  Chưa thanh toán
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between sm:justify-end gap-1.5 font-bold pt-1 sm:pt-0 border-t sm:border-t-0 border-amber-300/60">
              <span className="text-vj-text">Yêu cầu thanh toán:</span>
              <span className="text-red-600 font-black text-xs sm:text-sm">
                {total.toLocaleString('vi-VN')} VND
              </span>
              {moviHoldExpiresAt && (
                <span className="text-red-600 text-3xs font-medium ml-1">
                  trước {formatHoldExpireDate(moviHoldExpiresAt)} (Theo giờ địa phương)
                </span>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div
          className="bg-vj-yellow text-vj-dark shadow-vj-sm border-b border-amber-300"
          data-testid="trip-board"
        >
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-x-3 px-3 py-2 sm:px-6 sm:py-2 text-xs">
            {/* Mobile compact summary */}
            <div className="flex sm:hidden items-center gap-2 min-w-0 flex-1">
              <button
                type="button"
                onClick={() => setShowSummaryModal(true)}
                className="bg-white rounded-full px-2.5 py-1 text-2xs font-bold text-vj-text flex items-center gap-1 shadow-xs cursor-pointer hover:bg-vj-surface-2 active:scale-98 transition-all border border-amber-200 shrink-0"
              >
                <span>Tổng:</span>
                <span className="text-vj-red-dark font-bold whitespace-nowrap">
                  {total > 0 ? `${total.toLocaleString('vi-VN')} VND` : '0 VND'}
                </span>
                <span className="text-3xs text-vj-gray">▾</span>
              </button>
              <div className="flex items-center gap-1 font-koho text-2xs font-semibold text-vj-text truncate min-w-0">
                <span className="truncate">{booking.fromCity || booking.from}</span>
                <span className="text-vj-red-dark shrink-0">✈</span>
                <span className="truncate">{booking.toCity || booking.to}</span>
              </div>
            </div>

            {/* Mobile-only Step Pill */}
            <div className="flex sm:hidden items-center gap-1 font-koho text-3xs font-bold text-white bg-vj-pay-green px-2 py-0.5 rounded-full shrink-0 shadow-2xs">
              4/4 Thanh toán
            </div>

            {/* Desktop matching Image #1: 2 lines */}
            <div className="hidden sm:flex flex-col font-koho leading-tight">
              <span className="font-bold text-xs uppercase tracking-normal text-vj-text">
                CHUYẾN BAY MỘT CHIỀU | {booking.passengers?.length || 1} Người lớn
              </span>
              <div className="text-3xs font-medium text-vj-text-strong flex items-center gap-2 mt-0.5">
                <span>
                  * Điểm khởi hành: {booking.fromCity || 'Tp. Hồ Chí Minh'} ({' '}
                  {booking.from || 'SGN'} )
                </span>
                <span>
                  * Điểm đến: {booking.toCity || 'Hà Nội'} ( {booking.to || 'HAN'} )
                </span>
              </div>
            </div>

            {/* 4 Green Circle Badges matching Image #1 (Desktop only) */}
            <div className="hidden sm:flex items-center gap-2 font-koho">
              <div
                className="w-7 h-7 rounded-full bg-vj-pay-green text-white flex items-center justify-center shadow-xs cursor-default"
                title="1. Chuyến bay"
              >
                <Icon name="AirplaneIcon" size={13} className="rotate-90" />
              </div>
              <div
                className="w-7 h-7 rounded-full bg-vj-pay-green text-white flex items-center justify-center shadow-xs cursor-default"
                title="2. Hành khách"
              >
                <Icon name="UserIcon" size={13} />
              </div>
              <div
                className="w-7 h-7 rounded-full bg-vj-pay-green text-white flex items-center justify-center shadow-xs cursor-default"
                title="3. Dịch vụ"
              >
                <Icon name="BriefcaseIcon" size={13} />
              </div>
              <div
                className="w-7 h-7 rounded-full bg-vj-pay-green text-white flex items-center justify-center shadow-xs cursor-default font-bold text-xs leading-none"
                title="4. Thanh toán"
              >
                $
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="pt-3 sm:pt-6 pb-36 sm:pb-12">
        <div className="max-w-5xl mx-auto px-3 sm:px-6">
          {/* Reservation Countdown Timer
           *
           * MOVI có đồng hồ RIÊNG, đếm theo mốc hết hạn do SERVER quyết
           * định (`bookings.hold_expires_at`, migration 055) — không phải
           * 15 phút của `sessionStorage`. Vì sao phải vậy:
           *
           *   - mốc thời gian giữ chỗ phải là của server; đồng hồ của trình
           *     duyệt là đồng hồ của RIÊNG một thiết bị, và chỉnh ngày giờ
           *     máy là thay đổi luật;
           *   - server phải biết booking nào đang được giữ chỗ để tự hủy nó
           *     khi hết hạn — không có cái đó thì "tự hủy sau 30 phút" không
           *     tồn tại;
           *   - khi đồng hồ về 0, `onExpire` báo server hủy NGAY, và
           *     `onRenew` gia hạn qua server (ghi vào `sessionStorage` thì
           *     đồng hồ lệch với mốc thật và vé vẫn bị hủy đúng lúc server
           *     nói hết hạn).
           */}
          {!isPnrLookup &&
            (paymentMethod === 'movi' ? (
              <ReservationCountdown
                initialMinutes={MOVI_HOLD_MINUTES}
                expiresAt={moviHoldExpiresAt}
                storageKey="vj_movi_reservation_expire_time"
                bookingCode={bookingCodeLabel !== '—' ? bookingCodeLabel : undefined}
                onExpire={handleMoviHoldExpired}
                onRenew={renewMoviHold}
              />
            ) : (
              <ReservationCountdown
                initialMinutes={15}
                bookingCode={bookingCodeLabel !== '—' ? bookingCodeLabel : undefined}
              />
            ))}

          {/* H1 for accessibility */}
          <h1 className="sr-only">Thanh toán vé máy bay</h1>

          <div className="space-y-6">
            {/* THÔNG TIN ĐẶT CHỖ — gộp toàn bộ chuyến bay, hành khách, chi tiết giá & thanh toán */}
            <BookingTicketCard
              flightNo={booking.flightNo}
              from={booking.from}
              to={booking.to}
              fromCity={booking.fromCity}
              toCity={booking.toCity}
              departTime={booking.departTime}
              arriveTime={booking.arriveTime}
              date={booking.date ? formatBookingDay(booking.date) : ''}
              bookingCode={bookingCodeLabel !== '—' ? bookingCodeLabel : undefined}
              passengers={booking.passengers}
              fareClass="Eco"
              ancillaries={
                booking.ancillaries?.length
                  ? (booking.ancillaries
                      .map((id) => ANCILLARY_OPTIONS.find((o) => o.id === id)?.title)
                      .filter(Boolean) as string[])
                  : ['Hành lý xách tay 7kg']
              }
              fareSubtotal={booking.fareSubtotal ?? 1738800}
              tax={booking.tax ?? 581581}
              seatFee={booking.seatFee ?? 259200}
              ancillaryFee={booking.ancillaryFee ?? 44000}
              total={total}
              terminal="Nhà ga 1"
              aircraft="A321"
              duration="2 giờ 10 phút"
              contactEmail={booking.contactEmail}
              contactPhone={booking.contactPhone}
              onOpenDetails={() => setShowSummaryModal(true)}
              promoCode={promoCode}
              onPromoCodeChange={(val) => {
                setPromoCode(val);
                setPromoError('');
              }}
              onApplyPromo={applyPromo}
              isApplyingPromo={isApplyingPromo}
              promoApplied={promoApplied}
              promoData={promoData}
              promoError={promoError}
              discountAmount={discountAmount}
              taxRate={TAX_AND_FEE_RATE}
            />

            {/* Payment Form */}
            <div className="space-y-4">
              {/* Payment Method Card */}
              <div className="bg-white rounded-2xl border border-[var(--border)] p-3.5 sm:p-5 shadow-vj-sm">
                <div className="mb-3.5 sm:mb-4 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-base sm:text-lg font-bold font-koho text-vj-text">
                      Phương thức thanh toán
                    </h2>
                  </div>
                  <div className="flex items-center gap-1.5 text-3xs sm:text-xs text-vj-gray font-koho">
                    <span className="hidden sm:inline">Được xử lý bởi Cổng thanh toán</span>
                    <GalaxyPayBadge />
                  </div>
                </div>

                {/* Render categories dynamically */}
                {activeCategories.map((category) => (
                  <PaymentCategorySection
                    key={category.key}
                    category={category.key}
                    title={category.title}
                    methods={methodsByCategory[category.key]}
                    selectedGroup={selectedMethodGroup}
                    onSelect={selectMethod}
                  />
                ))}

                {/* Security Footer - hidden on MOVI (installments category) */}
                <SecurityFooter hideOnMovi={true} isMovi={isMovi} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mascot Amy floating banner at bottom-left matching Image #1 */}
      <div className="fixed bottom-3 left-4 z-40 hidden sm:flex items-end gap-2 pointer-events-auto">
        <div id="vj-mascot-banner" className="relative group">
          <div className="flex items-center gap-2 bg-white/95 backdrop-blur-xs rounded-full pl-1.5 pr-3 py-1 shadow-vj-lg border border-amber-200 hover:shadow-xl transition-all">
            <img
              src="/images/hero/amy-mascot.png"
              alt="Vietjet Mascot"
              width={200}
              height={100}
              className="w-10 h-10 object-contain drop-shadow"
            />
            <div className="text-left font-koho">
              <div className="text-2xs font-extrabold text-vj-red leading-tight">
                DIỆN MẠO MỚI - TRẢI NGHIỆM MỚI
              </div>
              <div className="text-3xs text-amber-600 font-bold flex items-center gap-0.5">
                <span>(Khám phá ngay &gt;)</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                const el = document.getElementById('vj-mascot-banner');
                if (el) el.style.display = 'none';
              }}
              className="text-gray-400 hover:text-red-500 text-sm font-bold ml-1 cursor-pointer leading-none"
              title="Đóng"
            >
              ×
            </button>
          </div>
        </div>
      </div>
      <ToastContainer toasts={toast.toasts} onDismiss={toast.dismiss} position="top-right" />

      {/* Sticky Bottom Bar — Duy nhất 1 vị trí thanh toán trên toàn giao diện (Desktop & Mobile) */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-t border-vj-border-light px-3 sm:px-6 py-2.5 sm:py-3 shadow-vj-up-md"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0.75rem))' }}
      >
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-2.5 sm:gap-4 w-full">
          {/* Cụm nút trái */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => router.push(bookingCode ? `/dat-ve/${bookingCode}` : '/tim-ve')}
              className="h-11 px-3.5 sm:px-6 rounded-full border border-gray-300 bg-white hover:bg-gray-50 text-vj-text font-koho font-bold text-xs uppercase tracking-wide transition-all active:scale-98 shadow-2xs inline-flex items-center justify-center cursor-pointer"
            >
              Quay lại
            </button>
            <button
              type="button"
              onClick={() => router.push('/tim-ve')}
              className="h-11 px-4 sm:px-5 rounded-full border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 font-koho font-bold text-xs uppercase tracking-wide shadow-2xs transition-all active:scale-98 cursor-pointer hidden sm:inline-flex items-center justify-center"
            >
              Mua thêm
            </button>
          </div>

          {/* Hiển thị tổng tiền ở giữa (Desktop) */}
          <div className="hidden sm:flex items-center gap-1.5 font-koho font-bold text-xs">
            <span className="text-vj-text">Tổng tiền:</span>
            <span className="text-vj-red-dark font-black text-sm">
              {total > 0 ? `${total.toLocaleString('vi-VN')} VND` : '0 VND'}
            </span>
            <button
              type="button"
              onClick={() => setShowSummaryModal(true)}
              className="text-3xs text-vj-gray hover:text-vj-text cursor-pointer ml-1 underline decoration-dotted font-koho"
            >
              Chi tiết ▾
            </button>
          </div>

          {/* Nút hành động thanh toán duy nhất */}
          <button
            type="button"
            onClick={goToPaymentGateway}
            className="min-h-9 sm:min-h-10 px-4 sm:px-6 py-0.5 rounded-full bg-gradient-vj-yellow hover:brightness-105 active:scale-98 shadow-md transition-all cursor-pointer flex items-center justify-center gap-2 text-center font-koho"
          >
            <span className="font-bold text-xs sm:text-sm leading-tight text-vj-text">
              Tiếp tục thanh toán
            </span>
          </button>
        </div>
      </div>

      {/* VietQR Payment Modal */}
      <PaymentModal
        isOpen={showVietQrModal}
        onClose={() => setShowVietQrModal(false)}
        methodLabel="VietQR"
        subtotal={booking?.fareSubtotal}
        discount={discountAmount}
        convenienceFee={vietQrConvenienceFee}
        grandTotal={vietQrGrandTotal}
        onProceed={() => {
          setShowVietQrModal(false);
          toast.success(
            'Chuyển sang trang mã QR VietQR',
            'Vui lòng quét mã QR để hoàn tất thanh toán.'
          );
        }}
      />

      {/* Modal Thông tin đặt chỗ (Screenshot 7) */}
      <PassengerDetailModal
        isOpen={showSummaryModal}
        onClose={() => setShowSummaryModal(false)}
        outboundFare={booking.total ? Math.round(booking.total * 0.7) : 0}
        outboundFlightNo={booking.flightNo}
        outboundTrip={
          booking.from && booking.to
            ? `${booking.fromCity || booking.from} (${booking.from}) → ${booking.toCity || booking.to} (${booking.to})`
            : undefined
        }
      />
    </>
  );
}
