'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { FlightBookingClient } from '@/features/bookings';
import { type PassengerType } from '@/features/bookings';
import { FareBenefitsModal } from '@/features/flights';
import type { FareClassId } from '@/features/bookings/pricing';
import { Icon } from '@/shared/components/ui';
import BookingSummaryPanel from './BookingSummaryPanel';
import PassengerDetailModal from './PassengerDetailModal';

interface FlightBookingResultsWrapperProps {
  trip: string;
  date: string;
}

interface SelectedBooking {
  flightNo: string;
  /** Normalised bucket id — `ECO` · `DELUXE` · `SKYBOSS` · `BUSINESS`. */
  fareClass: string;
  fare: number;
  tax: number;
  total: number;
  /** Eco fare of the same flight; every tab switch re-prices from this base. */
  baseFare: number;
  /**
   * The four prices the card printed for this flight. Held verbatim so a tab
   * switch shows exactly what the card showed, instead of a number derived from
   * a multiplier that never matched the stored fare ladder.
   */
  fares?: Partial<Record<FareClassId, number>>;
  departTime?: string;
  arriveTime?: string;
}

/** Card ids arrive lowercase (`eco`), the tabs speak uppercase (`ECO`). */
const FARE_CLASS_ALIASES: Record<string, string> = {
  economy: 'ECO',
  eco: 'ECO',
  ECO: 'ECO',
  deluxe: 'DELUXE',
  DELUXE: 'DELUXE',
  skyboss: 'SKYBOSS',
  SKYBOSS: 'SKYBOSS',
  business: 'BUSINESS',
  biz: 'BUSINESS',
  BUSINESS: 'BUSINESS',
  BIZ: 'BUSINESS',
};

function normalizeFareClass(fareClass: string): string {
  return FARE_CLASS_ALIASES[fareClass] ?? fareClass.toUpperCase();
}

/**
 * Fallback step between buckets, used only when a selection carries no ladder
 * (an older caller that hands over a bare price). The ladder itself comes from
 * the results card, which prices from the `flights` row.
 */
const FARE_CLASS_MULTIPLIER: Record<string, number> = {
  ECO: 1,
  DELUXE: 1.3,
  SKYBOSS: 1.7,
  BUSINESS: 2.77,
  BIZ: 2.77,
};

export default function FlightBookingResultsWrapper({
  trip,
  date: _date,
}: FlightBookingResultsWrapperProps) {
  const searchParams = useSearchParams();
  const departParam = searchParams.get('depart');
  const returnParam = searchParams.get('return');
  /** Khứ hồi chỉ tồn tại khi form tìm kiếm có ngày về (`return`). */
  const isRoundTrip = Boolean(returnParam);
  /** State key for the leg above — `return` reads better as `inbound` here. */
  const bookingKey = isRoundTrip && searchParams.get('leg') === 'return' ? 'inbound' : 'outbound';

  /** Passenger mix from the search, for the yellow trip strip under the header. */
  const [paxCounts, setPaxCounts] = useState<Record<PassengerType, number>>(() => ({
    adult: Number(searchParams.get('adult') ?? searchParams.get('pax') ?? 1) || 1,
    child: Number(searchParams.get('child') ?? 0) || 0,
    infant: Number(searchParams.get('infant') ?? 0) || 0,
  }));

  const [bookings, setBookings] = useState<Record<'outbound' | 'inbound', SelectedBooking | null>>({
    outbound: null,
    inbound: null,
  });
  const [continueSignal, setContinueSignal] = useState(0);
  const [showBenefitsModal, setShowBenefitsModal] = useState(false);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [bookingStep, setBookingStep] = useState(1);
  /** Tổng tiền do bước con báo lên — panel tổng tính từ `bookings`, thanh đáy
      tính từ đây, nên hai nơi phải lấy cùng một nguồn. */
  const [clientTotal, setClientTotal] = useState<number>(0);

  const selectedBooking = bookings[bookingKey];

  const handlePaxCountsChange = useCallback(
    (newPax: Record<PassengerType, number>) => {
      setPaxCounts(newPax);
      // Đổi số hành khách phải tính lại giá của chuyến đã chọn: giá vé trên
      // panel và trên thanh đáy là của TRẠNG THÁI HIỆN TẠI, không phải của
      // trạng thái lúc bấm chọn. Trẻ em tính 75% (khớp `pricing.ts`).
      setBookings((prev) => {
        const next = { ...prev };
        (['outbound', 'inbound'] as const).forEach((key) => {
          const item = next[key];
          if (item) {
            const currentWeight = paxCounts.adult + paxCounts.child * 0.75 || 1;
            const unitFare = item.fare / currentWeight;
            const nextWeight = newPax.adult + newPax.child * 0.75;
            const nextFare = Math.round(unitFare * nextWeight);
            const nextTax = 581581 * (newPax.adult || 1);
            next[key] = {
              ...item,
              fare: nextFare,
              tax: nextTax,
              total: nextFare + nextTax,
            };
          }
        });
        return next;
      });
    },
    [paxCounts.adult, paxCounts.child]
  );

  const handleFlightSelect = useCallback(
    (
      flightNo: string,
      fareClass: string,
      fare: number,
      fares?: Partial<Record<FareClassId, number>>,
      flight?: { departTime?: string; arriveTime?: string },
      leg: 'outbound' | 'inbound' = 'outbound'
    ) => {
      const normalized = normalizeFareClass(fareClass);
      const tax = 581581 * (paxCounts.adult || 1);
      const baseFare = fares?.eco ?? Math.round(fare / (FARE_CLASS_MULTIPLIER[normalized] ?? 1));
      const legFlight = {
        flightNo,
        fareClass: normalized,
        fare,
        tax,
        total: fare + tax,
        baseFare,
        fares,
        departTime: flight?.departTime || (leg === 'outbound' ? '06:00' : '18:30'),
        arriveTime: flight?.arriveTime || (leg === 'outbound' ? '08:15' : '20:45'),
      };

      setBookings((prev) => ({
        ...prev,
        [leg]: legFlight,
      }));
    },
    [paxCounts.adult]
  );

  const handleContinue = useCallback(() => {
    setContinueSignal((n) => n + 1);
  }, []);

  const [outboundFrom, outboundTo] = trip.split('→').map((part) => part.trim());
  const returnTrip = [outboundTo, outboundFrom].filter(Boolean).join(' → ');
  const formatDay = (iso?: string | null) => {
    if (!iso) return '--/--/----';
    const d = new Date(iso);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  };

  useEffect(() => {
    // Tiêu đề bước trên mobile chuẩn 1:1 theo site thật Vietjet Air
    const titles: Record<number, string> = {
      1: 'LỰA CHỌN CHUYẾN BAY',
      2: 'THÔNG TIN HÀNH KHÁCH',
      3: 'LỰA CHỌN DỊCH VỤ',
      4: 'THANH TOÁN',
    };
    const title = titles[bookingStep] || 'LỰA CHỌN CHUYẾN BAY';
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('vj-booking-step-title', { detail: title }));
    }
  }, [bookingStep]);

  const flightBaseAmount =
    (bookings.outbound?.total ?? 0) + (isRoundTrip ? (bookings.inbound?.total ?? 0) : 0);
  const totalBookingAmount = Math.max(clientTotal, flightBaseAmount);

  return (
    <>
      {/* Băng thông tin chuyến (trip strip) — số đo site thật:
          - MOBILE (đo 15/11/2026, 472×915, `/vi/select-flight`): băng vàng CỐ
            ĐỊNH ngay dưới băng đỏ header, cao `51px`, full-bleed, bo góc `0`,
            gradient `21.74deg` (`#F9A51A 2.28% → #FBB612 27.93% → #FFDD00
            86.9%`), padding `10px 17px`, `z-index: 95`.
          - DESKTOP (đo 14/11/2026, 1440×900): khối `1200×82px`, bo góc `16px`,
            gradient vàng `28.91deg`. KHÔNG full-bleed: khối nằm trong container
            `1200px` (x=120 ở viewport 1440), nền trang bên ngoài là trắng. */}
      <div className="bg-transparent pt-0 lg:bg-white lg:pt-4 lg:px-0" data-testid="trip-board">
        {/* Băng trip: mobile cố định dưới header (full-bleed, pill "Tổng" bên
            trái + 4 bước bên phải); desktop nằm trong container 1200px bo góc
            16px như site thật. */}
        <div className="vj-booking-strip fixed inset-x-0 top-12 z-[45] mx-auto flex w-full max-w-[1200px] flex-row items-center justify-between px-4.25 py-2.5 text-gray-950 lg:static lg:z-auto lg:rounded-2xl lg:px-6 lg:py-2.5">
          {/* Mobile pill: [Tổng 0 VND ▾] — đo 15/11/2026 (472×915):
              khung trắng `260×31px`, bo tròn `50px`, padding `0 14px 0 10px`,
              nhãn "Tổng" `14px/600` `#333333`, giá trị `14px/400` `#EC2029`
              font JambonoMedium, mũi tên xuống `24×24px`. */}
          <button
            type="button"
            onClick={() => setShowSummaryModal(true)}
            className="vj-total-pill cursor-pointer active:scale-95 transition-transform"
            aria-label="Xem chi tiết tổng tiền đặt chỗ"
          >
            <span className="vj-total-pill-label">Tổng</span>
            <span className="vj-total-pill-value flex-1 truncate">
              {totalBookingAmount.toLocaleString('vi-VN')} VND
            </span>
            <Icon name="ChevronDownIcon" size={24} className="shrink-0 text-vj-text" />
          </button>

          {/* 4 circular step indicators — đo 15/11/2026 (472×915): đường kính
              `25px`, bo tròn 50%, cách nhau `10px`; bước đang làm có gradient
              `72.74deg` (`#459B02 -15.27% → #AAFA6B 113.22%`), các bước sau nền
              trắng. */}
          <div className="flex shrink-0 items-center gap-2.5">
            <div
              className={`vj-step-dot ${
                bookingStep >= 1 ? 'vj-step-dot--active' : 'vj-step-dot--idle'
              }`}
              title="Chọn chuyến bay"
            >
              <Icon name="PaperAirplaneIcon" size={16} className="rotate-45" />
            </div>
            <div
              className={`vj-step-dot ${
                bookingStep >= 2 ? 'vj-step-dot--active' : 'vj-step-dot--idle'
              }`}
              title="Thông tin hành khách"
            >
              <Icon name="UserIcon" size={14} />
            </div>
            <div
              className={`vj-step-dot ${
                bookingStep >= 3 ? 'vj-step-dot--active' : 'vj-step-dot--idle'
              }`}
              title="Dịch vụ bổ sung"
            >
              <Icon name="ShoppingCartIcon" size={14} />
            </div>
            <div
              className={`vj-step-dot ${
                bookingStep >= 4 ? 'vj-step-dot--active' : 'vj-step-dot--idle'
              }`}
              title="Thanh toán"
            >
              <span className="font-black text-xs leading-none">$</span>
            </div>
          </div>
        </div>
      </div>

      {/* Khung nội dung — số đo site thật (13/11/2026, 1440×900):
          vùng nội dung `1200px` (x=120…1320 ở viewport 1440) = cột trái `820px`
          (padding trong `15px`) + panel phải `380px` (x=940…1320).
          Vì vậy container là `max-w-[1200px]` không padding ngang ở desktop
          (padding ngang chỉ dành cho mobile).

          Ở MOBILE băng vàng được CỐ ĐỊNH ngay dưới header đỏ nên nội dung
          phải chừa `48px` (header) + `51px` (băng vàng) — site thật dùng
          `padding-top: 48px` trên lớp phủ header và băng vàng `position:
          fixed` bù lên trên. */}
      <div className="mx-auto w-full max-w-[1200px] px-3.75 lg:px-0 pt-12.75 lg:pt-5 pb-24 sm:pb-28 overflow-x-hidden">
        <div className="flex flex-col lg:flex-row items-start w-full">
          {/* Cột trái: danh sách chuyến bay (ô 820px ở desktop) */}
          {/* `w-full` là bắt buộc ở mobile: parent dùng `items-start`, nên cột
              con không tự giãn theo bề rộng container — nó lấy bề rộng nội
              dung. Không có `w-full`, lưới 4 cột giá đẩy cột này rộng ~658px
              trong viewport 390px và bị `overflow-x-hidden` của wrapper cắt mất
              (giá vé của các hạng bên phải không chạm được trên điện thoại). */}
          <div className="w-full lg:w-[820px] lg:flex-none min-w-0">
            {/* H1 cột trái — site thật (đo 13/11/2026, 1440×900): nền đỏ,
                chữ trắng 16px/700 JambonoMedium uppercase. Nằm NGOÀI lớp
                padding 15px của cột để mép trái khớp x=120 (nội dung chuyến
                bay), giống dải dịch vụ phụ của header. Ở mobile tiêu đề đã
                nằm trong băng đỏ của header nên bản này chỉ hiện từ `lg`. */}
            <h1 className="hidden lg:block mb-2 rounded-vj bg-primary px-4 py-2.5 text-base font-bold font-jambono uppercase text-white tracking-normal">
              Lựa chọn chuyến bay
            </h1>
            <div className="lg:px-3.75">
              <FlightBookingClient
                continueSignal={continueSignal}
                onFlightSelect={handleFlightSelect}
                onStepChange={setBookingStep}
                onPaxCountsChange={handlePaxCountsChange}
                baseTotal={flightBaseAmount}
                onTotalChange={setClientTotal}
              />
            </div>
          </div>

          {/* Cột phải: panel thông tin đặt chỗ 380px (x=940…1320 ở 1440) */}
          <div className="lg:w-[380px] lg:flex-none min-w-0">
            <BookingSummaryPanel
              data={{
                trip,
                date: formatDay(departParam),
                flightNo: bookings.outbound?.flightNo,
                fareClass: bookings.outbound?.fareClass,
                fare: bookings.outbound?.fare ?? 0,
                tax: bookings.outbound?.tax ?? 0,
                serviceFee: 0,
                departTime: bookings.outbound?.departTime,
                arriveTime: bookings.outbound?.arriveTime,
                total: bookings.outbound?.total ?? 0,
                isRoundTrip,
                paxCounts,
                returnLeg: isRoundTrip
                  ? {
                      trip: returnTrip,
                      date: formatDay(returnParam),
                      flightNo: bookings.inbound?.flightNo,
                      fareClass: bookings.inbound?.fareClass,
                      fare: bookings.inbound?.fare ?? 0,
                      tax: bookings.inbound?.tax ?? 0,
                      departTime: bookings.inbound?.departTime,
                      arriveTime: bookings.inbound?.arriveTime,
                      total: bookings.inbound?.total ?? 0,
                    }
                  : undefined,
              }}
              onContinue={handleContinue}
              canContinue={bookings.outbound !== null}
            />
          </div>
        </div>
      </div>

      {/* Bottom bars for Step 1 (Flight Selection) */}
      {bookingStep === 1 && (
        <>
          {/* Desktop Sticky Bottom Bar — số đo site thật 14/11/2026 (1440×900):
              khối ngoài `1440×80` nền trắng padding-top `18px`; nội dung
              `1200×59` trong container 1200px (x=120), padding-left `10px`.

              Cấu trúc site thật là 3 flex item:
                1. thanh trống `639px` (x=130) — giữ cụm tổng ở bên phải,
                2. khối `405px` (x=769) chứa "Tổng tiền" `16px/500`, giá
                   `20px/400` và "Chi tiết" `13px/400` màu `#D3D3D3`
                   (không phải chữ đỏ!) — nằm ngay dưới nhau, cùng x=769,
                3. nút "Đi tiếp" `127×39` tại x=1173.

              "Chi tiết" nằm ở x=842 nhờ `padding-right: 291.547px` của
              khối giữa — tức nó thẳng hàng với dòng "Tổng tiền", lệch
              phải ~73px, KHÔNG nằm giữa hai khối. */}
          <div className="vj-total-bar hidden sm:block fixed bottom-0 left-0 right-0 z-[60] border-t border-gray-200 shadow-vj-up-sm">
            {/* Site thật: container 1200px (x=120), padding trong `10px`, lề phải
                `20px` → cụm "Tổng tiền" tại x=769, nút "Đi tiếp" 127×39 tại x=1173. */}
            <div className="vj-total-bar-inner mx-auto max-w-[1200px] pl-2.5 pr-5">
              {/* Thanh trống giữ layout 3 cột như site thật */}
              <div aria-hidden="true" className="flex-1" />
              <div className="relative w-[405px] shrink-0">
                <div className="flex flex-col items-start">
                  <span className="vj-total-bar-label font-bold text-black font-koho">Tổng tiền</span>
                  <span className="vj-total-bar-amount font-bold text-black font-koho">
                    {totalBookingAmount.toLocaleString('vi-VN')} VND
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSummaryModal(true)}
                  className="absolute left-[73px] top-0 text-sm2 font-bold text-amber-500 hover:text-amber-600 transition-colors cursor-pointer font-koho"
                >
                  Chi tiết
                </button>
              </div>
              <button
                type="button"
                onClick={handleContinue}
                disabled={!bookings.outbound}
                className="vj-cta vj-cta--booking shrink-0 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95 cursor-pointer"
              >
                Đi tiếp
              </button>
            </div>
          </div>

          {/* Nút nổi "Đi tiếp" ở MOBILE — đo 15/11/2026 (472×915, site thật):
              nút `157×40px`, bo góc `10px`, gradient vàng `26.73deg`
              (`#F9A51A 13.7% → #FBB612 29.8% → #FFDD00 66.81%`), nằm cố định
              ở `y=850` (cách mép dưới `25px`), CĂN GIỮA màn hình
              (`x=158`), chữ `14px/500` KoHo màu `rgba(0,0,0,.87)`, shadow 3 tầng
              của MUI. */}
          <div className="sm:hidden fixed bottom-[25px] left-0 right-0 z-[60] flex justify-center pointer-events-none">
            <button
              type="button"
              onClick={handleContinue}
              disabled={!bookings.outbound}
              className="vj-cta vj-cta--booking pointer-events-auto h-[40px] w-[157px] min-w-[157px] max-w-[157px] disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transition-all cursor-pointer"
            >
              Đi tiếp
            </button>
          </div>
        </>
      )}

      {/* Bảng so sánh 4 hạng vé */}
      <FareBenefitsModal
        open={showBenefitsModal}
        onClose={() => setShowBenefitsModal(false)}
        prices={selectedBooking?.fares}
      />

      {/* Modal Thông tin đặt chỗ (Screenshot 7) */}
      <PassengerDetailModal
        isOpen={showSummaryModal}
        onClose={() => setShowSummaryModal(false)}
        outboundFare={bookings.outbound?.fare ?? 1220400}
        inboundFare={bookings.inbound?.fare ?? 549720}
        outboundTax={bookings.outbound?.tax ?? 581581}
        inboundTax={bookings.inbound?.tax ?? 581581}
        outboundFlightNo={bookings.outbound?.flightNo ?? 'VJ141'}
        inboundFlightNo={bookings.inbound?.flightNo ?? 'VJ134'}
        isRoundTrip={isRoundTrip}
      />
    </>
  );
}
