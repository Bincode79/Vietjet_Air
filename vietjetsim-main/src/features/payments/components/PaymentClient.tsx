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

import type { PaymentMethod } from '@/features/payments/types';
import { apiRequest, ApiRequestError } from '@/shared/services';
import { MOVI_HOLD_MINUTES } from '@/lib/movi';
import PaymentModal from './PaymentModal';
import ReservationCountdown from './ReservationCountdown';
import BookingTicketCard from './BookingTicketCard';
import GatewayQrPage from './GatewayQrPage';
import CardGatewayContent from './gateway/CardGatewayContent';
import MoviGatewayContent from './gateway/MoviGatewayContent';
import {
  VisaLogo,
  MastercardLogo,
  JcbLogo,
  AmexLogo,
  NapasLogo,
  VietQrLogo,
  VnpayLogo,
  MomoLogo,
  ZaloPayLogo,
  ApplePayLogo,
  GooglePayLogo,
  SkyJoyLogo,
  MoviLogo,
  GalaxyPayBadge,
  PaymentSecurityFooter,
} from './PaymentMethodLogos';

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
  const [hasPromoChecked, setHasPromoChecked] = useState(false);
  const [selectedMethodGroup, setSelectedMethodGroup] = useState<string>(() => {
    if (typeof window === 'undefined') return 'vnpay_qr';
    const param = new URLSearchParams(window.location.search).get('method');
    return param || 'vnpay_qr';
  });
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(() => {
    if (typeof window === 'undefined') return 'vietqr';
    const param = new URLSearchParams(window.location.search).get('method');
    if (param === 'card') return 'card';
    if (param === 'bank') return 'bank';
    if (param === 'wallet') return 'wallet';
    if (param === 'skypoint') return 'skypoint';
    return 'vietqr';
  });
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
  const [showFlightInfoAccordion, setShowFlightInfoAccordion] = useState<boolean>(true);
  const [showPaxInfoAccordion, setShowPaxInfoAccordion] = useState<boolean>(true);

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
    } catch (err) {
      // Không giữ được chỗ thì vẫn cho khách thanh toán (đây là phương thức
      // thanh toán, không phải điều kiện được phép thanh toán) — nhưng phải
      // nói rõ, vì lúc đó không có ai hủy booking giúp khách.
      console.error('[MOVI] Failed to reserve the booking hold:', err);
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
    )
      .then((data) => {
        if (data.expired || data.booking_status === 'cancelled') {
          toast.error(
            'Hết thời gian giữ chỗ',
            'Mã đặt chỗ đã bị hủy. Vui lòng đặt vé lại để tiếp tục.'
          );
        }
      })
      .catch((err) => console.error('[MOVI] Failed to expire the booking hold:', err));
  }, [effectiveLookupTarget, toast]);

  /** Gia hạn lượt giữ chỗ MOVI (nút "Gia hạn" của đồng hồ đếm ngược). */
  const renewMoviHold = useCallback(() => {
    void acquireMoviHold();
  }, [acquireMoviHold]);

  const effectiveBookingCode = useMemo(() => {
    if (bookingCode && bookingCode !== '—') return bookingCode;
    if (booking?.bookingCode && booking.bookingCode !== '—') return booking.bookingCode;
    if (bookingId && bookingId.length >= 6) {
      return bookingId
        .replace(/[^a-zA-Z0-9]/g, '')
        .slice(-6)
        .toUpperCase();
    }
    return '';
  }, [bookingCode, booking?.bookingCode, bookingId]);

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
          <div className="text-center py-10">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
              <Icon name="CheckCircleIcon" size={32} className="text-green-600" />
            </div>
            <h2 className="text-xl font-black text-vj-text font-koho">
              Thanh toán thành công
            </h2>
            <p className="mt-2 text-sm text-vj-gray">
              Đơn hàng {bookingCodeLabel} đã được xác nhận. Vé điện tử sẽ được xuất ngay sau đây.
            </p>
            <button
              type="button"
              onClick={() => setGatewayDownloaded(true)}
              disabled={gatewayDownloaded}
              className="mt-6 px-6 py-2.5 rounded-vj bg-primary hover:bg-primary-dark text-white font-bold text-sm uppercase tracking-wide transition-all shadow-vj-md flex items-center justify-center gap-2 inline-flex"
            >
              <Icon name="ArrowDownTrayIcon" size={16} />
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
                onSuccess={(payload) => {
                  console.log('[MOVI] Hồ sơ tín dụng:', payload);
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
          className="bg-vj-yellow text-vj-dark shadow-vj-sm border-b border-amber-300 py-2.5 px-3 sm:px-6 z-20 font-koho sticky top-[74px]"
          data-testid="trip-board"
        >
          <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-y-1 text-2xs sm:text-xs">
            <div className="flex items-center gap-1.5 font-bold">
              <span>Mã đặt chỗ :</span>
              <span className="text-red-600 font-black text-xs sm:text-sm">{bookingCodeLabel}</span>
            </div>
            <div className="flex items-center gap-1.5 font-bold">
              <span>Trạng thái thanh toán :</span>
              <span className="text-red-600 font-black">Chưa thanh toán</span>
            </div>
            <div className="flex items-center gap-1 text-right font-bold">
              <span>Yêu cầu thanh toán :</span>
              <span className="text-red-600 font-black">{total.toLocaleString('vi-VN')} VND</span>
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
            <div className="flex sm:hidden items-center gap-2">
              <button
                type="button"
                onClick={() => setShowSummaryModal(true)}
                className="bg-white rounded-full px-2.5 py-1 text-2xs font-bold text-vj-text flex items-center gap-1 shadow-xs cursor-pointer hover:bg-vj-surface-2 active:scale-98 transition-all border border-amber-200 shrink-0"
              >
                <span>Tổng:</span>
                <span className="text-vj-red-dark font-bold">
                  {total > 0 ? `${total.toLocaleString('vi-VN')} VND` : '0 VND'}
                </span>
                <span className="text-3xs text-vj-gray">▾</span>
              </button>
              <div className="flex items-center gap-1 font-koho text-2xs font-semibold text-vj-text truncate">
                <span>{booking.fromCity || booking.from}</span>
                <span className="text-vj-red-dark">✈</span>
                <span>{booking.toCity || booking.to}</span>
              </div>
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

            {/* 4 Green Circle Badges matching Image #1 */}
            <div className="flex items-center gap-2 font-koho">
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

      <div className="pt-4 sm:pt-6 pb-28 sm:pb-12">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
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
            {/* Payment Form */}
            <div className="space-y-4">
              {/* Accordions Thông tin chuyến bay & hành khách khi tra cứu vé giữ chỗ chuẩn Image #8 */}
              {isPnrLookup && booking && (
                <div className="space-y-3 font-koho text-xs">
                  {/* 1. Thông tin chuyến bay */}
                  <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-2xs">
                    <button
                      type="button"
                      onClick={() => setShowFlightInfoAccordion((prev) => !prev)}
                      className="w-full flex items-center justify-between p-3.5 bg-gray-50/80 hover:bg-gray-100 transition-colors cursor-pointer text-left font-bold text-gray-900 border-b border-gray-100"
                    >
                      <span className="text-sm">Thông tin chuyến bay</span>
                      <span className="text-xs text-gray-500 font-mono">
                        {showFlightInfoAccordion ? '▲' : '▼'}
                      </span>
                    </button>
                    {showFlightInfoAccordion && (
                      <div className="p-4 space-y-2 text-gray-700 bg-white">
                        <div className="font-bold text-gray-900 text-sm">
                          Chuyến đi: {booking.from}-{booking.to}
                        </div>
                        <div className="text-red-600 font-semibold text-xs">
                          Số hiệu chuyến bay: {booking.flightNo}
                        </div>
                        <div className="text-xs leading-relaxed">
                          <span className="text-red-600 font-bold">* Khởi hành: </span>
                          <span>
                            {booking.departTime}, {formatBookingDay(booking.date)} (Giờ địa phương)
                          </span>
                          <div className="text-gray-500 ml-3">
                            {booking.fromCity} - Sân bay ({booking.from}) - Nhà ga 1
                          </div>
                        </div>
                        <div className="text-xs leading-relaxed">
                          <span className="text-vj-pay-green font-bold">• Đến: </span>
                          <span>
                            {booking.arriveTime}, {formatBookingDay(booking.date)} (Giờ địa phương)
                          </span>
                          <div className="text-gray-500 ml-3">
                            {booking.toCity} - Sân bay ({booking.to})
                          </div>
                        </div>
                        <div className="text-gray-500 text-3xs pt-1.5 border-t border-gray-100">
                          Thời gian: 2 giờ 10 phút &nbsp;|&nbsp; Airbus: A321 &nbsp;|&nbsp; Khai
                          thác bởi: Vietjet
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 2. Thông tin hành khách */}
                  <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-2xs">
                    <button
                      type="button"
                      onClick={() => setShowPaxInfoAccordion((prev) => !prev)}
                      className="w-full flex items-center justify-between p-3.5 bg-gray-50/80 hover:bg-gray-100 transition-colors cursor-pointer text-left font-bold text-gray-900 border-b border-gray-100"
                    >
                      <span className="text-sm">Thông tin hành khách</span>
                      <span className="text-xs text-gray-500 font-mono">
                        {showPaxInfoAccordion ? '▲' : '▼'}
                      </span>
                    </button>
                    {showPaxInfoAccordion && (
                      <div className="p-4 space-y-1.5 text-gray-700 bg-white text-xs">
                        <div className="font-bold text-gray-900 flex items-center gap-1.5">
                          <span>👤</span>
                          <span>Người lớn: {booking.passengers?.[0]?.name || '—'}</span>
                        </div>
                        <div className="font-semibold text-gray-600">
                          {booking.from} ➔ {booking.to}
                        </div>
                        <div>
                          Số ghế: {booking.flightNo}-{booking.passengers?.[0]?.seat || '15A'}
                        </div>
                        <div>Hành lý ký gửi: Gói 20kg</div>
                      </div>
                    )}
                  </div>
                </div>
              )}
              {/* Payment Method Card */}
              <div className="bg-white rounded-2xl border border-[var(--border)] p-4 sm:p-5 shadow-vj-sm">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-bold font-koho text-vj-text">
                      Phương thức thanh toán
                    </h2>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-vj-gray font-koho">
                    <span>Được xử lý bởi Cổng thanh toán</span>
                    <GalaxyPayBadge />
                  </div>
                </div>

                {/* 1. Thẻ và tài khoản ngân hàng (Screenshot 3) */}
                <div className="mb-5">
                  <h3 className="text-2xl3 font-semibold font-koho uppercase text-vj-text tracking-normal mb-2.5">
                    Thẻ và tài khoản ngân hàng
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {/* 1. Quét mã QR VNPAY (Khuyên dùng - Mặc định) */}
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedMethodGroup('vnpay_qr');
                        setPaymentMethod('vietqr');
                      }}
                      className={`p-3 rounded-vj border flex flex-col justify-between text-left transition-all cursor-pointer min-h-[96px] relative overflow-hidden ${
                        selectedMethodGroup === 'vnpay_qr'
                          ? 'border-2 border-primary bg-[rgb(var(--vj-red-rgb))]/10 shadow-xs'
                          : 'border-vj-border-light hover:border-vj-line bg-white'
                      }`}
                    >
                      <div className="absolute top-0 right-0 bg-primary text-white text-4xs font-black px-1.5 py-0.5 rounded-bl-md uppercase tracking-wider">
                        Khuyên dùng
                      </div>
                      <div className="flex items-center h-8">
                        <VnpayLogo className="h-5 w-auto max-w-[104px]" />
                      </div>
                      <span className="text-xs font-bold text-vj-text mt-2 line-clamp-2 leading-tight">
                        Quét mã VNPAY-QR
                      </span>
                    </button>

                    {/* 2. Mobile Banking VietQR */}
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedMethodGroup('vietqr');
                        setPaymentMethod('vietqr');
                      }}
                      className={`p-3 rounded-vj border flex flex-col justify-between text-left transition-all cursor-pointer min-h-[96px] relative overflow-hidden ${
                        selectedMethodGroup === 'vietqr'
                          ? 'border-2 border-primary bg-[rgb(var(--vj-red-rgb))]/10 shadow-xs'
                          : 'border-vj-border-light hover:border-vj-line bg-white'
                      }`}
                    >
                      <div className="flex items-center h-8">
                        <VietQrLogo className="h-5 w-auto max-w-[104px]" />
                      </div>
                      <span className="text-xs font-bold text-vj-text mt-2 line-clamp-2 leading-tight">
                        Mobile Banking VietQR
                      </span>
                    </button>

                    {/* 3. Thẻ ATM nội địa Napas */}
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedMethodGroup('napas');
                        setPaymentMethod('bank');
                      }}
                      className={`p-3 rounded-vj border flex flex-col justify-between text-left transition-all cursor-pointer min-h-[96px] ${
                        selectedMethodGroup === 'napas'
                          ? 'border-2 border-primary bg-[rgb(var(--vj-red-rgb))]/10 shadow-xs'
                          : 'border-vj-border-light hover:border-vj-line bg-white'
                      }`}
                    >
                      <div className="flex items-center h-8">
                        <NapasLogo className="h-4 w-auto max-w-[104px]" />
                      </div>
                      <span className="text-xs font-bold text-vj-text mt-2">Thẻ ATM nội địa</span>
                    </button>

                    {/* 4. Thẻ tín dụng / ghi nợ quốc tế */}
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedMethodGroup('card');
                        setPaymentMethod('card');
                      }}
                      className={`p-3 rounded-vj border flex flex-col justify-between text-left transition-all cursor-pointer min-h-[96px] ${
                        selectedMethodGroup === 'card'
                          ? 'border-2 border-primary bg-[rgb(var(--vj-red-rgb))]/10 shadow-xs'
                          : 'border-vj-border-light hover:border-vj-line bg-white'
                      }`}
                    >
                      {/* Bốn logo mạng thẻ xếp 2×2 để không bị chồng lên nhau */}
                      <div className="grid grid-cols-2 gap-x-2 gap-y-1 h-8 items-center">
                        <VisaLogo className="h-4 w-auto" />
                        <MastercardLogo className="h-4 w-auto" />
                        <JcbLogo className="h-4 w-auto" />
                        <AmexLogo className="h-4 w-auto" />
                      </div>
                      <span className="text-xs font-bold text-vj-text mt-2 line-clamp-2 leading-tight">
                        Thẻ tín dụng / ghi nợ quốc tế
                      </span>
                    </button>

                    {/* 5. Thanh toán nội địa VNPAY */}
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedMethodGroup('vnpay_dom');
                        setPaymentMethod('vietqr');
                      }}
                      className={`p-3 rounded-vj border flex flex-col justify-between text-left transition-all cursor-pointer min-h-[96px] ${
                        selectedMethodGroup === 'vnpay_dom'
                          ? 'border-2 border-primary bg-[rgb(var(--vj-red-rgb))]/10 shadow-xs'
                          : 'border-vj-border-light hover:border-vj-line bg-white'
                      }`}
                    >
                      <div className="flex items-center h-8">
                        <VnpayLogo className="h-4 w-auto max-w-[104px]" />
                      </div>
                      <span className="text-xs font-bold text-vj-text mt-2 line-clamp-2 leading-tight">
                        Thanh toán nội địa VNPAY
                      </span>
                    </button>
                  </div>
                </div>

                {/* 2. Ví điện tử (Screenshot 3) */}
                <div className="mb-5">
                  <h3 className="text-2xl3 font-semibold font-koho uppercase text-vj-text tracking-normal mb-2.5">
                    Ví điện tử
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {/* SkyJoy (ví tích lũy / điểm SkyPoint) */}
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedMethodGroup('skypay');
                        setPaymentMethod('skypoint');
                      }}
                      className={`p-3 rounded-vj border flex flex-col justify-between text-left transition-all cursor-pointer min-h-[90px] ${
                        selectedMethodGroup === 'skypay'
                          ? 'border-2 border-primary bg-[rgb(var(--vj-red-rgb))]/10 shadow-xs'
                          : 'border-vj-border-light hover:border-vj-line bg-white'
                      }`}
                    >
                      <div className="flex items-center h-8">
                        <SkyJoyLogo className="h-7 w-auto" />
                      </div>
                      <span className="text-xs font-bold text-vj-text mt-2">Ví SkyJoy</span>
                    </button>

                    {/* MoMo */}
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedMethodGroup('momo');
                        setPaymentMethod('e_wallet');
                      }}
                      className={`p-3 rounded-vj border flex flex-col justify-between text-left transition-all cursor-pointer min-h-[90px] ${
                        selectedMethodGroup === 'momo'
                          ? 'border-2 border-primary bg-[rgb(var(--vj-red-rgb))]/10 shadow-xs'
                          : 'border-vj-border-light hover:border-vj-line bg-white'
                      }`}
                    >
                      <div className="flex items-center h-8">
                        <MomoLogo className="h-7 w-auto" />
                      </div>
                      <span className="text-xs font-bold text-vj-text mt-2">Ví MoMo</span>
                    </button>

                    {/* ZaloPay */}
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedMethodGroup('zalopay');
                        setPaymentMethod('e_wallet');
                      }}
                      className={`p-3 rounded-vj border flex flex-col justify-between text-left transition-all cursor-pointer min-h-[90px] ${
                        selectedMethodGroup === 'zalopay'
                          ? 'border-2 border-primary bg-[rgb(var(--vj-red-rgb))]/10 shadow-xs'
                          : 'border-vj-border-light hover:border-vj-line bg-white'
                      }`}
                    >
                      <div className="flex items-center h-8">
                        <ZaloPayLogo className="h-5 w-auto max-w-[104px]" />
                      </div>
                      <span className="text-xs font-bold text-vj-text mt-2">Ví ZaloPay</span>
                    </button>

                    {/* Apple Pay */}
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedMethodGroup('applepay');
                        setPaymentMethod('card');
                      }}
                      className={`p-3 rounded-vj border flex flex-col justify-between text-left transition-all cursor-pointer min-h-[90px] ${
                        selectedMethodGroup === 'applepay'
                          ? 'border-2 border-primary bg-[rgb(var(--vj-red-rgb))]/10 shadow-xs'
                          : 'border-vj-border-light hover:border-vj-line bg-white'
                      }`}
                    >
                      <div className="flex items-center h-8">
                        <ApplePayLogo className="h-6 w-auto max-w-[104px]" />
                      </div>
                      <span className="text-xs font-bold text-vj-text mt-2">Apple Pay</span>
                    </button>

                    {/* Google Pay */}
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedMethodGroup('googlepay');
                        setPaymentMethod('card');
                      }}
                      className={`p-3 rounded-vj border flex flex-col justify-between text-left transition-all cursor-pointer min-h-[90px] ${
                        selectedMethodGroup === 'googlepay'
                          ? 'border-2 border-primary bg-[rgb(var(--vj-red-rgb))]/10 shadow-xs'
                          : 'border-vj-border-light hover:border-vj-line bg-white'
                      }`}
                    >
                      <div className="flex items-center h-8">
                        <GooglePayLogo className="h-5 w-auto max-w-[104px]" />
                      </div>
                      <span className="text-xs font-bold text-vj-text mt-2">Google Pay</span>
                    </button>
                  </div>
                </div>

                {/* 3. Giữ mã đặt chỗ & thanh toán sau (Screenshot 4) */}
                <div className="mb-5">
                  <h3 className="text-2xl3 font-semibold font-koho uppercase text-vj-text tracking-normal mb-2.5">
                    Giữ mã đặt chỗ & thanh toán sau
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedMethodGroup('movi');
                        setPaymentMethod('movi');
                      }}
                      className={`p-3 rounded-vj border flex flex-col justify-between text-left transition-all cursor-pointer min-h-[90px] ${
                        selectedMethodGroup === 'movi'
                          ? 'border-2 border-primary bg-[rgb(var(--vj-red-rgb))]/10 shadow-xs'
                          : 'border-vj-border-light hover:border-vj-line bg-white'
                      }`}
                    >
                      <div className="flex items-center h-8">
                        <MoviLogo className="h-6 w-auto max-w-[104px]" />
                      </div>
                      <span className="text-4xs text-vj-gray font-medium block mt-0.5">
                        Bay trước, trả sau
                      </span>
                      <span className="text-xs font-bold text-vj-text mt-1">Trả góp Movi</span>
                    </button>
                  </div>
                </div>

                {/* CTA dẫn sang cổng thanh toán riêng của từng phương thức */}
                <div className="pt-4 border-t border-vj-border-light space-y-3">
                  <button
                    type="button"
                    onClick={goToPaymentGateway}
                    className="w-full py-3.5 rounded-vj bg-primary hover:bg-primary-dark text-white font-black text-sm uppercase tracking-wide transition-all shadow-vj-md cursor-pointer"
                  >
                    Tiếp tục thanh toán
                    {total > 0 ? ` • ${total.toLocaleString('vi-VN')}₫` : ''}
                  </button>
                  <p className="text-3xs text-vj-muted text-center font-koho">
                    Bạn sẽ được chuyển đến cổng bảo mật để hoàn tất thanh toán.
                  </p>
                </div>

                {/* Security and Accepted Logos Footer - hidden on MOVI matching Image #1 */}
                {paymentMethod !== 'movi' && <PaymentSecurityFooter />}
              </div>

              {/* Security note - hidden on MOVI matching Image #1 */}
              {paymentMethod !== 'movi' && (
                <div className="flex items-center gap-3 bg-[rgb(var(--vj-green-rgb))]/10 border border-[rgb(var(--vj-green-rgb))]/30 rounded-vj p-4 text-sm text-[var(--vj-green)]">
                  <Icon
                    name="ShieldCheckIcon"
                    size={20}
                    className="text-[var(--vj-green)] flex-shrink-0"
                  />
                  <span>
                    Thanh toán được bảo mật bằng mã hóa SSL 256-bit. Thông tin thẻ của bạn an toàn
                    tuyệt đối.
                  </span>
                </div>
              )}
            </div>

            {/* Order Summary */}
            <div className="space-y-4">
              {/* Realistic Vietjet Ticket Card */}
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
                onOpenDetails={() => setShowSummaryModal(true)}
              />

              <div className="bg-white rounded-2xl border border-[var(--border)] p-5 shadow-vj-sm">
                <h3 className="font-extrabold text-sm text-[var(--foreground)] mb-3">
                  Chi tiết giá & thanh toán
                </h3>

                  {/* Promo code — chuẩn underline MUI 40px Vietjet live */}
                  <div className="mt-4">
                    <label className="block text-xs font-semibold text-[var(--foreground-subtle)] uppercase tracking-wider mb-1.5">
                      Mã khuyến mãi
                    </label>
                    <div className="flex items-center gap-2">
                      <div className="vj-lookup-field relative flex-1 mt-2 flex items-center h-[42px] px-3 bg-white border border-vj-line rounded-vj shadow-2xs focus-within:border-primary focus-within:ring-1 focus-within:ring-primary transition-all">
                        <input
                          id="promo-code-input"
                          name="promoCode"
                          type="text"
                          value={promoCode}
                          onChange={(e) => {
                            setPromoCode(e.target.value.toUpperCase());
                            setPromoError('');
                          }}
                          placeholder=" "
                          disabled={promoApplied}
                          className={`vj-lookup-input font-mono uppercase font-bold text-black !text-black !border-b-0 w-full disabled:opacity-50 ${promoApplied ? 'form-input-valid' : ''}`}
                        />
                        <label
                          htmlFor="promo-code-input"
                          className={`vj-lookup-label font-medium font-koho pointer-events-none transition-all ${
                            promoCode
                              ? '-top-2 bg-white px-1 text-3xs font-medium text-vj-gray !text-vj-gray'
                              : 'left-3 text-sm text-vj-muted !text-vj-muted'
                          }`}
                        >
                          VJ2026
                        </label>
                      </div>
                      <button
                        onClick={applyPromo}
                        disabled={promoApplied || !promoCode || isApplyingPromo}
                        className="h-[40px] px-3 bg-accent text-[var(--foreground)] font-bold rounded-vj text-xs hover:bg-accent-dark transition-colors disabled:opacity-50 min-w-[80px] flex items-center justify-center shrink-0"
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
                    {promoError && <p className="text-xs text-primary mt-1">{promoError}</p>}
                    {promoApplied && promoData && (
                      <p className="text-xs text-[var(--vj-green)] mt-1 font-semibold">
                        ✓ Đã áp dụng mã {promoData.code}
                      </p>
                    )}
                  </div>

                  {/* Price breakdown */}
                  <div className="mt-4 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-[var(--foreground-muted)]">Giá vé cơ bản</span>
                      <span className="font-semibold">
                        {booking?.fareSubtotal.toLocaleString('vi-VN')}₫
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--foreground-muted)]">
                        Thuế &amp; phí sân bay ({Math.round(TAX_AND_FEE_RATE * 100)}%)
                      </span>
                      <span className="font-semibold">
                        +{(booking?.tax ?? 0).toLocaleString('vi-VN')}₫
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--foreground-muted)]">Phí chọn chỗ</span>
                      <span className="font-semibold">
                        +{(booking?.seatFee ?? 0).toLocaleString('vi-VN')}₫
                      </span>
                    </div>
                    {(booking?.ancillaryFee ?? 0) > 0 && (
                      <div className="flex justify-between">
                        <span className="text-[var(--foreground-muted)]">
                          Dịch vụ bổ sung
                          {booking?.ancillaries?.length
                            ? ` (${booking.ancillaries
                                .map((id) => ANCILLARY_OPTIONS.find((o) => o.id === id)?.title)
                                .filter(Boolean)
                                .join(', ')})`
                            : ''}
                        </span>
                        <span className="font-semibold">
                          +{booking!.ancillaryFee!.toLocaleString('vi-VN')}₫
                        </span>
                      </div>
                    )}
                    {promoApplied && (
                      <div className="flex justify-between text-[var(--vj-green)] font-medium">
                        <span>
                          Giảm giá {promoData?.type === 'percentage' ? `(${promoData.value}%)` : ''}
                        </span>
                        <span className="font-bold">
                          -{discountAmount.toLocaleString('vi-VN')}₫
                        </span>
                      </div>
                    )}
                    <div className="border-t border-[var(--border)] pt-2 flex justify-between font-bold text-[var(--foreground)]">
                      <span>Tổng thanh toán</span>
                      <span className="text-primary text-lg">{total.toLocaleString('vi-VN')}₫</span>
                    </div>
                  </div>

                  <Link
                    href="/tim-ve"
                    className="mt-3 flex min-h-9 items-center gap-1.5 text-xs text-[var(--foreground-subtle)] hover:text-[var(--foreground-muted)] transition-colors"
                  >
                    <Icon name="ArrowLeftIcon" size={12} />
                    Quay lại chọn chuyến bay
                  </Link>
                </div>
            </div>
          </div>

          {/* Desktop Bottom Action Buttons matching Image #1 & Image #8 */}
          {isPnrLookup ? (
            <div className="hidden sm:flex justify-between items-center w-full pt-10 pb-6">
              <button
                type="button"
                onClick={() =>
                  router.push(bookingCode ? `/dat-ve/${bookingCode}` : '/chuyen-bay-cua-toi')
                }
                className="px-10 py-2.5 rounded-full border border-gray-300 bg-white text-gray-700 font-bold text-xs hover:bg-gray-50 shadow-2xs transition-all active:scale-98 cursor-pointer"
              >
                Quay lại
              </button>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() =>
                    router.push(bookingCode ? `/dat-ve/${bookingCode}` : '/chuyen-bay-cua-toi')
                  }
                  className="px-8 py-2.5 rounded-full bg-vjgold hover:bg-vjamber text-black font-bold text-xs shadow-2xs transition-all active:scale-98 cursor-pointer"
                >
                  Hủy bỏ
                </button>
                <button
                  type="button"
                  onClick={goToPaymentGateway}
                  className="px-8 py-2.5 rounded-full bg-vjyellow hover:bg-vjamber text-black font-bold text-xs shadow-2xs transition-all active:scale-98 cursor-pointer"
                >
                  Thanh toán
                </button>
              </div>
            </div>
          ) : (
            <div className="hidden sm:flex justify-center items-center gap-4 pt-10 pb-6">
              <button
                type="button"
                onClick={() => router.push('/tim-ve')}
                className="px-10 py-2.5 rounded-full border border-gray-300 bg-white text-gray-700 font-bold text-xs hover:bg-gray-50 shadow-2xs transition-all active:scale-98 cursor-pointer"
              >
                Quay lại
              </button>
              <button
                type="button"
                onClick={() => router.push('/tim-ve')}
                className="px-10 py-2.5 rounded-full bg-green-500 hover:bg-green-600 text-white font-bold text-xs shadow-2xs transition-all active:scale-98 cursor-pointer"
              >
                Mua Thêm
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Mascot Amy floating banner at bottom-left matching Image #1 */}
      <div className="fixed bottom-3 left-4 z-40 hidden sm:flex items-end gap-2 pointer-events-auto">
        <div id="vj-mascot-banner" className="relative group">
          <div className="flex items-center gap-2 bg-white/95 backdrop-blur-xs rounded-full pl-1.5 pr-3 py-1 shadow-vj-lg border border-amber-200 hover:shadow-xl transition-all">
            <img
              src="/images/hero/amy-mascot.png"
              alt="Vietjet Mascot"
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

      {/* Mobile Sticky Bottom Bar matching Screenshots 3 & 4 */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-vj-border-light px-4 py-3 shadow-vj-up-md flex items-center gap-3 sm:hidden">
        <button
          type="button"
          onClick={() => router.push('/tim-ve')}
          className="flex-1 bg-vj-pay-green hover:bg-vj-pay-green-hover text-white font-black italic text-sm py-3 rounded-vj shadow transition-all active:scale-98 cursor-pointer text-center"
        >
          Mua thêm
        </button>
        <button
          type="button"
          onClick={goToPaymentGateway}
          className="flex-1 bg-vj-gold-button hover:bg-vj-gold-pure text-vj-dark font-black italic text-sm py-3 rounded-vj shadow transition-all active:scale-98 cursor-pointer text-center"
        >
          Thanh toán
        </button>
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
