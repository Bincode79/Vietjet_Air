'use client';
import React, { useCallback, useEffect, useState, useMemo, Suspense, lazy } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import PaymentGatewayHeader from '@/features/payments/components/gateway/PaymentGatewayHeader';
import GatewaySkeleton from '@/features/payments/components/gateway/GatewaySkeleton';
import { createPayment } from '@/features/payments/services';
import type { PaymentMethod } from '@/features/payments/types';
import { apiRequest, getApiErrorMessage } from '@/shared/services';
import { Icon } from '@/shared/components/ui';

// Lazy load gateway components for better initial load performance
const QrGatewayContent = lazy(
  () => import('@/features/payments/components/gateway/QrGatewayContent')
);
const CardGatewayContent = lazy(
  () => import('@/features/payments/components/gateway/CardGatewayContent')
);
const NapasGatewayContent = lazy(
  () => import('@/features/payments/components/gateway/NapasGatewayContent')
);
const EWalletGatewayContent = lazy(
  () => import('@/features/payments/components/gateway/EWalletGatewayContent')
);
const MoviGatewayContent = lazy(
  () => import('@/features/payments/components/gateway/MoviGatewayContent')
);
const WalletGatewayContent = lazy(
  () => import('@/features/payments/components/gateway/WalletGatewayContent')
);
const BankGatewayContent = lazy(
  () => import('@/features/payments/components/gateway/BankGatewayContent')
);
const SkyPointGatewayContent = lazy(
  () => import('@/features/payments/components/gateway/SkyPointGatewayContent')
);

// Type imports for payload handling
import type { MoviGatewayApplication } from '@/features/payments/components/gateway/MoviGatewayContent';
import type { BankGatewayPayload } from '@/features/payments/components/gateway/BankGatewayContent';
import type { SkyPointGatewayPayload } from '@/features/payments/components/gateway/SkyPointGatewayContent';

/** Dữ liệu từng cổng trả về khi khách hoàn tất bước xác nhận của cổng đó. */
interface GatewayPaymentPayload {
  movi?: MoviGatewayApplication;
  bank?: BankGatewayPayload;
  skypoint?: SkyPointGatewayPayload['skypoint'];
}

interface BookingInfo {
  bookingId: string;
  bookingCode?: string;
  total: number;
  status?: string;
  flightNo?: string;
  fromCity?: string;
  toCity?: string;
  /** Mốc hết hạn giữ chỗ (ISO string) - dùng cho MOVI 30 phút server-side */
  holdExpiresAt?: string;
}

/** Phương thức thanh toán server chấp nhận cho từng cổng hiển thị. */
const GATEWAY_PAYMENT_METHOD: Record<string, PaymentMethod | undefined> = {
  card: 'card',
  napas: 'card',
  bank: 'bank',
  ewallet: 'e_wallet',
  skypoint: 'skypoint',
  movi: 'movi',
  wallet: 'wallet',
};

type LoadState = 'loading' | 'ready' | 'error';

function GatewayMessage({
  tone,
  title,
  description,
  actionHref,
  actionLabel,
}: {
  tone: 'info' | 'warning';
  title: string;
  description: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  const palette =
    tone === 'warning'
      ? 'bg-amber-50 border-amber-200 text-amber-900'
      : 'bg-blue-50 border-blue-200 text-blue-900';
  return (
    <div className={`max-w-xl mx-auto my-10 rounded-3xl border p-6 sm:p-8 text-center ${palette}`}>
      <Icon name="InformationCircleIcon" size={32} className="mx-auto mb-3 opacity-80" />
      <h2 className="text-lg font-black font-koho">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed opacity-90">{description}</p>
      {actionHref && actionLabel && (
        <Link
          href={actionHref}
          className="mt-5 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-vj bg-primary hover:bg-primary-dark text-white text-xs font-bold uppercase tracking-wider transition-all"
        >
          {actionLabel}
        </Link>
      )}
    </div>
  );
}

/**
 * Cổng thanh toán cho một phương thức (`method` từ dynamic segment).
 * Xuất ra làm default để các bài test render trực tiếp component này,
 * và page.tsx import default để Next.js không bị chặn named export trên page route.
 */
export default function GatewayDispatcher() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  const method = (params?.method as string) || 'qr';
  const bookingId = searchParams.get('bookingId') || '';
  // Mã giảm giá đã áp ở trang /thanh-toan — server tự validate lại, client
  // chỉ chuyển tiếp để cổng hiển thị đúng số tiền và render đúng memo.
  const promoCode = searchParams.get('promo') || '';
  const promoDiscount = Math.max(0, Number(searchParams.get('promoDiscount')) || 0);

  const [booking, setBooking] = useState<BookingInfo | null>(null);
  const [loadState, setLoadState] = useState<LoadState>(bookingId ? 'loading' : 'ready');
  const [loadError, setLoadError] = useState('');
  const [paymentError, setPaymentError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!bookingId) {
      setBooking(null);
      setLoadState('ready');
      return;
    }

    let cancelled = false;
    setLoadState('loading');
    setLoadError('');

    apiRequest<{ booking?: Record<string, unknown> }>(
      `/api/dat-ve/${encodeURIComponent(bookingId)}`
    )
      .then((res) => {
        if (cancelled) return;
        const raw = res?.booking;
        if (!raw) {
          setLoadError('Không tìm thấy thông tin đặt chỗ.');
          setLoadState('error');
          return;
        }
        const flight = (raw.flight ?? {}) as Record<string, unknown>;
        setBooking({
          bookingId: String(raw.id ?? bookingId),
          bookingCode: raw.booking_code ? String(raw.booking_code) : undefined,
          total: Number(raw.total_price ?? 0),
          status: raw.status ? String(raw.status) : undefined,
          flightNo: flight.flight_no ? String(flight.flight_no) : undefined,
          fromCity: flight.from_code ? String(flight.from_code) : undefined,
          toCity: flight.to_code ? String(flight.to_code) : undefined,
          holdExpiresAt: raw.hold_expires_at ? String(raw.hold_expires_at) : undefined,
        });
        setLoadState('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(getApiErrorMessage(err, 'Không tải được thông tin đặt chỗ để thanh toán.'));
        setLoadState('error');
      });

    return () => {
      cancelled = true;
    };
  }, [bookingId]);

  const methodTitle = useMemo(() => {
    switch (method) {
      case 'card':
        return 'Cổng Thẻ Quốc Tế';
      case 'napas':
        return 'Cổng Thẻ Nội Địa Napas';
      case 'ewallet':
        return 'Cổng Ví Điện Tử';
      case 'movi':
        return 'Cổng Trả Sau MOVI';
      case 'wallet':
        return 'Cổng Ví Vietjet';
      case 'bank':
        return 'Cổng Chuyển Khoản Ngân Hàng';
      case 'skypoint':
        return 'Cổng SkyJoy Rewards';
      case 'qr':
      default:
        return 'Cổng VNPAY-QR • VietQR';
    }
  }, [method]);

  const goToSuccess = useCallback(
    (id: string, code?: string) => {
      const params = new URLSearchParams();
      params.set('bookingId', id);
      if (code) params.set('bookingCode', code);
      router.push(`/thanh-toan/thanh-cong?${params.toString()}`);
    },
    [router]
  );

  const handlePaymentSuccess = useCallback(
    async (payload?: GatewayPaymentPayload) => {
      if (!booking) {
        setPaymentError('Không tìm thấy thông tin đặt chỗ để ghi nhận thanh toán.');
        return;
      }

      // Cổng QR đã được xác nhận bởi webhook VietQR (VietQrBox chỉ gọi onPaid
      // sau khi /api/thanh-toan/trang-thà trả về `confirmed`), nên không tạo
      // thêm một giao dịch ở đây.
      if (method === 'qr') {
        goToSuccess(booking.bookingId);
        return;
      }

      const paymentMethod = GATEWAY_PAYMENT_METHOD[method];
      if (!paymentMethod) {
        setPaymentError('Phương thức thanh toán không hợp lệ.');
        return;
      }

      const application = payload?.movi;
      const bankPayload = payload?.bank;
      const skypointPayload = payload?.skypoint;

      // Cổng MOVI phải có hồ sơ tín dụng — không có hồ sơ thì server từ chối
      // giao dịch, và đó là điều đúng: một đơn trả góp không có hồ sơ là
      // một đơn mà bên tín dụng không thể chấm điểm.
      if (paymentMethod === 'movi' && !application) {
        setPaymentError('Thiếu thông tin hồ sơ trả góp. Vui lòng nhập lại hồ sơ.');
        return;
      }

      setSubmitting(true);
      setPaymentError('');
      try {
        // SkyPoint: khách trả phần tiền mặt còn lại sau khi trừ điểm; các
        // phương thức khác trả đúng số tiền sau khuyến mãi. Server vẫn tự
        // tính lại và từ chối nếu `amount` không khớp.
        const payableAmount = Math.max(0, booking.total - promoDiscount);
        await createPayment({
          booking_id: booking.bookingId,
          method: paymentMethod,
          amount: skypointPayload?.cashDue ?? payableAmount,
          discount_code: promoCode || undefined,
          bank_account_id: bankPayload?.bank_account_id,
          transfer_note: bankPayload?.transfer_note,
          transfer_amount: bankPayload?.transfer_amount,
          movi:
            paymentMethod === 'movi' && application
              ? {
                  fullName: application.fullName,
                  birthDate: application.birthDate,
                  nationalId: application.nationalId,
                  phone: application.phone,
                  tenor: application.tenor,
                }
              : undefined,
        });
        goToSuccess(booking.bookingId, booking.bookingCode);
      } catch (err) {
        // 409 = đơn đã được thanh toán (lần bấm trước đã commit, hoặc webhook QR
        // về trước). Đó không phải thất bại: khách phải thấy vé, không phải một
        // banner đỏ trong khi tiền đã trừ và đơn đã `confirmed`.
        if ((err as { status?: number } | null)?.status === 409) {
          goToSuccess(booking.bookingId, booking.bookingCode);
          return;
        }
        setPaymentError(
          getApiErrorMessage(
            err,
            'Thanh toán không thành công. Vui lòng thử lại hoặc chọn phương thức khác.'
          )
        );
      } finally {
        setSubmitting(false);
      }
    },
    [booking, goToSuccess, method, promoCode, promoDiscount]
  );

  if (loadState === 'loading') {
    return (
      <div className="py-16 text-center text-sm text-vj-gray">Đang tải thông tin đặt chỗ…</div>
    );
  }

  if (loadState === 'error') {
    return (
      <div>
        <GatewayMessage
          tone="warning"
          title="Không mở được cổng thanh toán"
          description={loadError}
          actionHref={`/tra-cuu`}
          actionLabel="Tra cứu đặt chỗ"
        />
      </div>
    );
  }

  if (!bookingId) {
    return (
      <div>
        <GatewayMessage
          tone="warning"
          title="Chưa có đơn đặt vé để thanh toán"
          description="Cổng thanh toán chỉ mở từ một đơn đặt vé cụ thể. Vui lòng tra cứu mã đặt chỗ (PNR) rồi chọn “Thanh toán ngay”."
          actionHref="/tra-cuu"
          actionLabel="Tra cứu đặt chỗ"
        />
      </div>
    );
  }

  if (!booking) {
    return (
      <div>
        <GatewayMessage
          tone="warning"
          title="Không tìm thấy đơn đặt vé"
          description="Đơn đặt vé không tồn tại hoặc bạn không có quyền truy cập."
          actionHref="/tra-cuu"
          actionLabel="Tra cứu đặt chỗ"
        />
      </div>
    );
  }

  if (booking.status === 'confirmed' || booking.status === 'completed') {
    return (
      <div>
        <GatewayMessage
          tone="info"
          title="Đơn đặt vé đã được thanh toán"
          description={`Đặt chỗ ${booking.bookingCode ?? booking.bookingId} đã ở trạng thái đã xác nhận, không cần thanh toán thêm.`}
          actionHref={`/thanh-toan/thanh-cong?bookingId=${encodeURIComponent(booking.bookingId)}&bookingCode=${encodeURIComponent(booking.bookingCode || '')}`}
          actionLabel="Xem vé điện tử"
        />
      </div>
    );
  }

  // Số tiền hiển thị trên header và truyền vào các cổng = tổng vé trừ khuyến
  // mãi đã áp ở /thanh-toan. SkyPoint gateway tự trừ tiếp phần điểm bên trong.
  const effectiveAmount = Math.max(0, booking.total - promoDiscount);
  const effectiveCode = booking.bookingCode;

  return (
    <div>
      <PaymentGatewayHeader
        bookingId={booking.bookingId}
        bookingCode={effectiveCode}
        amount={effectiveAmount}
        methodTitle={methodTitle}
        expiresAt={method === 'movi' ? booking.holdExpiresAt : undefined}
      />

      <div className="py-4">
        {paymentError && (
          <div className="max-w-2xl mx-auto mt-3 px-4">
            <div
              role="alert"
              className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 flex items-start gap-3"
            >
              <Icon name="ExclamationTriangleIcon" size={20} className="shrink-0 mt-0.5" />
              <div>
                <div className="font-bold">Thanh toán chưa hoàn tất</div>
                <div className="mt-0.5">{paymentError}</div>
              </div>
            </div>
          </div>
        )}

        {submitting && (
          <div className="max-w-2xl mx-auto mt-3 px-4 text-center text-xs text-vj-gray">
            Đang ghi nhận thanh toán…
          </div>
        )}

        <Suspense fallback={<GatewaySkeleton />}>
          {method === 'qr' && (
            <QrGatewayContent
              bookingId={booking.bookingId}
              bookingCode={effectiveCode}
              amount={effectiveAmount}
              onSuccess={handlePaymentSuccess}
              methodType="vnpay_qr"
              discountCode={promoCode || null}
            />
          )}
        </Suspense>
        <Suspense fallback={<GatewaySkeleton />}>
          {method === 'card' && (
            <CardGatewayContent
              bookingId={booking.bookingId}
              bookingCode={effectiveCode}
              amount={effectiveAmount}
              onSuccess={handlePaymentSuccess}
            />
          )}
        </Suspense>
        <Suspense fallback={<GatewaySkeleton />}>
          {method === 'napas' && (
            <NapasGatewayContent
              bookingId={booking.bookingId}
              bookingCode={effectiveCode}
              amount={effectiveAmount}
              onSuccess={handlePaymentSuccess}
            />
          )}
        </Suspense>
        <Suspense fallback={<GatewaySkeleton />}>
          {method === 'ewallet' && (
            <EWalletGatewayContent
              bookingId={booking.bookingId}
              bookingCode={effectiveCode}
              amount={effectiveAmount}
              onSuccess={handlePaymentSuccess}
            />
          )}
        </Suspense>
        <Suspense fallback={<GatewaySkeleton />}>
          {method === 'movi' && (
            <MoviGatewayContent
              bookingId={booking.bookingId}
              bookingCode={effectiveCode}
              amount={effectiveAmount}
              onSuccess={handlePaymentSuccess}
              onBack={() => router.push('/thanh-toan')}
            />
          )}
        </Suspense>
        <Suspense fallback={<GatewaySkeleton />}>
          {method === 'wallet' && (
            <WalletGatewayContent
              bookingId={booking.bookingId}
              bookingCode={effectiveCode}
              amount={effectiveAmount}
              onSuccess={handlePaymentSuccess}
            />
          )}
        </Suspense>
        <Suspense fallback={<GatewaySkeleton />}>
          {method === 'bank' && (
            <BankGatewayContent
              bookingId={booking.bookingId}
              bookingCode={effectiveCode}
              originalAmount={booking.total}
              amount={effectiveAmount}
              discountAmount={promoDiscount}
              discountCode={promoCode}
              onSuccess={handlePaymentSuccess}
            />
          )}
        </Suspense>
        <Suspense fallback={<GatewaySkeleton />}>
          {method === 'skypoint' && (
            <SkyPointGatewayContent
              bookingId={booking.bookingId}
              bookingCode={effectiveCode}
              amount={effectiveAmount}
              onSuccess={handlePaymentSuccess}
            />
          )}
        </Suspense>
      </div>
    </div>
  );
}
