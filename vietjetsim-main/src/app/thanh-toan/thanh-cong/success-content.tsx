'use client';
import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Icon } from '@/shared/components/ui';
import { apiRequest, getApiErrorMessage } from '@/shared/services';

interface BookingSummary {
  id: string;
  bookingCode?: string;
  status: string;
  totalPrice: number;
  flightNo?: string;
  fromCode?: string;
  toCode?: string;
}

type ViewState = 'loading' | 'confirmed' | 'pending' | 'cancelled' | 'not-found';

function SummaryRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center gap-4 text-vj-text-strong">
      <span>{label}</span>
      <span className="font-bold text-vj-text text-right">{value}</span>
    </div>
  );
}

function PnrBox({ pnr }: { pnr: string }) {
  return (
    <div className="bg-red-50/80 rounded-2xl border border-red-200 p-4 space-y-1">
      <div className="text-3xs uppercase tracking-widest text-vj-gray font-bold">
        Mã đặt chỗ (PNR)
      </div>
      <div className="text-3xl sm:text-4xl font-black text-primary font-mono tracking-widest">
        {pnr}
      </div>
      <div className="text-2xs text-vj-gray">
        Vui lòng lưu lại mã đặt chỗ để làm thủ tục check-in trực tuyến.
      </div>
    </div>
  );
}

function ActionLinks({ bookingId }: { bookingId?: string }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
      <Link
        href="/chuyen-bay-cua-toi"
        className="w-full py-3 rounded-vj bg-primary hover:bg-primary-dark text-white font-bold text-xs uppercase tracking-wider font-koho transition-all shadow-vj-md inline-flex items-center justify-center gap-1.5"
      >
        <Icon name="MagnifyingGlassIcon" size={16} />
        <span>Chuyến bay của tôi</span>
      </Link>

      {bookingId ? (
        <Link
          href={`/dat-ve/${encodeURIComponent(bookingId)}`}
          className="w-full py-3 rounded-vj border border-vj-line hover:bg-vj-surface-2 text-vj-text-dim font-bold text-xs uppercase tracking-wider font-koho transition-all inline-flex items-center justify-center gap-1.5"
        >
          <Icon name="DocumentTextIcon" size={16} />
          <span>Xem hành trình</span>
        </Link>
      ) : (
        <Link
          href="/"
          className="w-full py-3 rounded-vj border border-vj-line hover:bg-vj-surface-2 text-vj-text-dim font-bold text-xs uppercase tracking-wider font-koho transition-all inline-flex items-center justify-center gap-1.5"
        >
          <Icon name="HomeIcon" size={16} />
          <span>Về trang chủ</span>
        </Link>
      )}
    </div>
  );
}

function StateCard({
  tone,
  icon,
  title,
  description,
  children,
}: {
  tone: 'amber' | 'neutral';
  icon: React.ReactNode;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  const header =
    tone === 'amber'
      ? 'bg-gradient-to-r from-amber-500 to-orange-600'
      : 'bg-gradient-to-r from-slate-600 to-slate-700';
  return (
    <div className="max-w-xl mx-auto py-10 px-4">
      <div className="bg-white rounded-3xl border border-vj-border-light/90 shadow-vj-lg overflow-hidden text-center">
        <div className={`${header} text-white p-8 space-y-3`}>
          <div className="w-16 h-16 rounded-full bg-white/20 text-white flex items-center justify-center mx-auto ring-4 ring-white/10">
            {icon}
          </div>
          <h1 className="text-2xl sm:text-3xl font-black font-koho">{title}</h1>
          <p className="text-xs sm:text-sm opacity-90">{description}</p>
        </div>
        <div className="p-6 sm:p-8 space-y-6">{children}</div>
      </div>
    </div>
  );
}

/**
 * Kết quả thanh toán cho một booking. Xuất default để page.tsx import
 * vào trong <Suspense> mà không gắn named export lên module route page.
 */
export default function SuccessContent() {
  const searchParams = useSearchParams();
  const bookingId = searchParams.get('bookingId') || '';
  const [booking, setBooking] = useState<BookingSummary | null>(null);
  const [view, setView] = useState<ViewState>(bookingId ? 'loading' : 'not-found');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!bookingId) {
      setView('not-found');
      return;
    }

    let cancelled = false;
    setView('loading');

    apiRequest<{ booking?: Record<string, unknown> }>(
      `/api/dat-ve/${encodeURIComponent(bookingId)}`
    )
      .then((res) => {
        if (cancelled) return;
        const raw = res?.booking;
        if (!raw) {
          setErrorMessage('Không tìm thấy thông tin đặt chỗ.');
          setView('not-found');
          return;
        }
        const flight = (raw.flight ?? {}) as Record<string, unknown>;
        const status = String(raw.status ?? 'pending');
        setBooking({
          id: String(raw.id ?? bookingId),
          bookingCode: raw.booking_code ? String(raw.booking_code) : undefined,
          status,
          totalPrice: Number(raw.total_price ?? 0),
          flightNo: flight.flight_no ? String(flight.flight_no) : undefined,
          fromCode: flight.from_code ? String(flight.from_code) : undefined,
          toCode: flight.to_code ? String(flight.to_code) : undefined,
        });
        if (status === 'confirmed' || status === 'completed') {
          setView('confirmed');
        } else if (status === 'cancelled' || status === 'refunded') {
          setView('cancelled');
        } else {
          setView('pending');
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setErrorMessage(
          getApiErrorMessage(err, 'Không tải được thông tin đặt chỗ. Vui lòng thử lại.')
        );
        setView('not-found');
      });

    return () => {
      cancelled = true;
    };
  }, [bookingId]);

  if (view === 'loading') {
    return (
      <div className="max-w-xl mx-auto py-16 px-4 text-center text-sm text-vj-gray">
        Đang tải kết quả thanh toán…
      </div>
    );
  }

  if (view === 'not-found' || !booking) {
    return (
      <StateCard
        tone="neutral"
        icon={<Icon name="MagnifyingGlassIcon" size={36} />}
        title="Không tìm thấy đơn đặt vé"
        description={
          errorMessage ||
          'Trang kết quả cần một mã đơn đặt vé hợp lệ. Vui lòng tra cứu lại bằng mã đặt chỗ (PNR).'
        }
      >
        <ActionLinks />
        <Link
          href="/tra-cuu"
          className="inline-flex items-center justify-center gap-2 w-full py-3 rounded-vj bg-primary hover:bg-primary-dark text-white font-bold text-xs uppercase tracking-wider transition-all"
        >
          <Icon name="TicketIcon" size={16} />
          <span>Tra cứu đặt chỗ</span>
        </Link>
      </StateCard>
    );
  }

  const pnr = booking.bookingCode || booking.id;

  if (view === 'pending') {
    return (
      <StateCard
        tone="amber"
        icon={<Icon name="ClockIcon" size={36} />}
        title="Đơn đặt vé đang chờ thanh toán"
        description="Chúng tôi chưa ghi nhận được thanh toán cho đơn này. Vui lòng hoàn tất thanh toán để kích hoạt vé điện tử."
      >
        <PnrBox pnr={pnr} />
        <div className="bg-amber-50 rounded-2xl p-4 border border-amber-200 text-xs space-y-2 text-left font-koho">
          <SummaryRow
            label="Số tiền cần thanh toán:"
            value={`${booking.totalPrice.toLocaleString('vi-VN')} VND`}
          />
          {booking.flightNo && <SummaryRow label="Chuyến bay:" value={booking.flightNo} />}
          <SummaryRow
            label="Trạng thái:"
            value={<span className="text-amber-700">Chờ thanh toán</span>}
          />
        </div>
        <Link
          href={`/thanh-toan?bookingId=${encodeURIComponent(booking.id)}`}
          className="inline-flex items-center justify-center gap-2 w-full py-3 rounded-vj bg-primary hover:bg-primary-dark text-white font-bold text-xs uppercase tracking-wider transition-all"
        >
          <Icon name="CreditCardIcon" size={16} />
          <span>Thanh toán ngay</span>
        </Link>
        <ActionLinks bookingId={booking.id} />
      </StateCard>
    );
  }

  if (view === 'cancelled') {
    return (
      <StateCard
        tone="neutral"
        icon={<Icon name="XCircleIcon" size={36} />}
        title={booking.status === 'refunded' ? 'Đơn đặt vé đã hoàn tiền' : 'Đơn đặt vé đã hủy'}
        description="Đơn đặt vé này không còn hiệu lực. Nếu bạn cần hỗ trợ thêm, vui lòng liên hệ tổng đài 1900 1886."
      >
        <PnrBox pnr={pnr} />
        <ActionLinks bookingId={booking.id} />
      </StateCard>
    );
  }

  return (
    <div className="max-w-xl mx-auto py-10 px-4">
      <div className="bg-white rounded-3xl border border-vj-border-light/90 shadow-vj-lg overflow-hidden text-center">
        {/* Success Header */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-700 text-white p-8 space-y-3">
          <div className="w-16 h-16 rounded-full bg-white/20 text-white flex items-center justify-center mx-auto ring-4 ring-white/10">
            <Icon name="CheckCircleIcon" size={36} />
          </div>
          <h1 className="text-2xl sm:text-3xl font-black font-koho">Thanh toán thành công!</h1>
          <p className="text-xs sm:text-sm opacity-90">
            Vé điện tử đã được xác nhận và kích hoạt trên toàn hệ thống Vietjet Air.
          </p>
        </div>

        {/* PNR Box */}
        <div className="p-6 sm:p-8 space-y-6">
          <PnrBox pnr={pnr} />

          {/* Booking Summary */}
          <div className="bg-vj-surface-2 rounded-2xl p-4 border border-vj-border-light text-xs space-y-2 text-left font-koho">
            <SummaryRow label="Chuyến bay:" value={booking.flightNo || '—'} />
            <SummaryRow
              label="Hành trình:"
              value={
                booking.fromCode && booking.toCode ? `${booking.fromCode} → ${booking.toCode}` : '—'
              }
            />
            <SummaryRow
              label="Trạng thái đặt chỗ:"
              value={<span className="text-vj-pay-green uppercase">Đã xác nhận</span>}
            />
            <SummaryRow
              label="Tổng tiền thanh toán:"
              value={`${booking.totalPrice.toLocaleString('vi-VN')} VND`}
            />
          </div>

          <ActionLinks bookingId={booking.id} />
        </div>
      </div>
    </div>
  );
}
