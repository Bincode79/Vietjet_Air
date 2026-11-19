'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Header, Footer } from '@/shared/components/navigation';
import { apiRequest } from '@/shared/services';
import { useToast } from '@/hooks/useToast';
import { ToastContainer } from '@/shared/components/feedback';
import { BAGGAGE_PACKAGES, MEAL_OPTIONS, getAncillaryPrice } from '@/features/bookings/pricing';

interface Passenger {
  id: string;
  name: string;
  type: string;
  seat?: string;
  baggage?: string;
}

interface BookingDetail {
  id: string;
  bookingCode: string;
  pnr?: string;
  from: string;
  to: string;
  fromCity: string;
  toCity: string;
  flightNo: string;
  date: string;
  departTime: string;
  arriveTime: string;
  flightType: string;
  ticketClass: string;
  totalPrice: number;
  status: string;
  hold_expires_at?: string;
  createdAt: string;
  passengers: Passenger[];
}

const OCCUPIED_SEATS = new Set([
  '1A',
  '1B',
  '2D',
  '3C',
  '4F',
  '5A',
  '7B',
  '8D',
  '10C',
  '11A',
  '11F',
  '12B',
  '14C',
  '15E',
  '16D',
  '18A',
  '20B',
  '22F',
  '25D',
  '28C',
]);

export default function AncillaryServicesPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const toast = useToast();

  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Tổng phí dịch vụ pending do SERVER trả về (GET/POST dich-vu).
  const [pendingAmount, setPendingAmount] = useState<number>(0);
  // Chỉ gửi seat/package_id khi user thực sự đổi — tránh ghi đè lựa chọn cũ.
  const [seatDirty, setSeatDirty] = useState<boolean>(false);
  const [baggageDirty, setBaggageDirty] = useState<boolean>(false);

  // Selected services state — giá đọc từ pricing.ts (không hardcode)
  const [selectedSeat, setSelectedSeat] = useState<string>('15-A');
  const [seatPrice, setSeatPrice] = useState<number>(40000);
  const [selectedBaggage, setSelectedBaggage] = useState<string>(BAGGAGE_PACKAGES[0].label);
  const [baggagePrice, setBaggagePrice] = useState<number>(BAGGAGE_PACKAGES[0].price);
  const [hasInsurance, setHasInsurance] = useState<boolean>(true);
  const insurancePrice = getAncillaryPrice('insurance');
  const [selectedMeal, setSelectedMeal] = useState<string>('');
  const [mealPrice, setMealPrice] = useState<number>(0);
  const [selectedTaxi, setSelectedTaxi] = useState<boolean>(false);
  const [taxiPrice, setTaxiPrice] = useState<number>(getAncillaryPrice('taxi'));

  // Modals state
  const [showSeatModal, setShowSeatModal] = useState<boolean>(false);
  const [pendingSeat, setPendingSeat] = useState<string>('15-A');
  const [pendingSeatPrice, setPendingSeatPrice] = useState<number>(40000);

  const [showBaggageModal, setShowBaggageModal] = useState<boolean>(false);
  const [pendingBaggage, setPendingBaggage] = useState<string>('Gói 20kg');
  const [pendingBaggagePrice, setPendingBaggagePrice] = useState<number>(200000);

  const [showMealModal, setShowMealModal] = useState<boolean>(false);
  const [pendingMeal, setPendingMeal] = useState<string>('jet café');
  const [pendingMealPrice, setPendingMealPrice] = useState<number>(0);

  // Collapsible sidebar sections
  const [showPaxSidebar, setShowPaxSidebar] = useState(false);

  useEffect(() => {
    async function fetchBooking() {
      if (!id) return;
      try {
        setLoading(true);
        const data = await apiRequest<{ booking?: Record<string, unknown> }>(
          `/api/dat-ve/${encodeURIComponent(id)}`
        );
        const b = (data.booking ?? data) as Record<string, unknown>;
        const flight = (b.flight ?? {}) as Record<string, unknown>;
        const rawPassengers = Array.isArray(b.passengers) ? b.passengers : [];
        const toDate = (v: unknown) => {
          const d = v ? new Date(String(v)) : null;
          return d && !Number.isNaN(d.getTime()) ? d : null;
        };
        const departAt = toDate(flight.depart_time);
        const arriveAt = toDate(flight.arrive_time);
        const fmtDate = (d: Date | null) =>
          d
            ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
            : '';
        const fmtTime = (d: Date | null) =>
          d
            ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
            : '';
        setBooking({
          id: String(b.id ?? id),
          bookingCode: String(b.booking_code ?? id),
          pnr: String(b.booking_code ?? id),
          from: String(flight.from_code ?? ''),
          to: String(flight.to_code ?? ''),
          fromCity: String(flight.from_code ?? ''),
          toCity: String(flight.to_code ?? ''),
          flightNo: String(flight.flight_no ?? ''),
          date: fmtDate(departAt),
          departTime: fmtTime(departAt),
          arriveTime: fmtTime(arriveAt),
          flightType: b.trip_id ? 'round_trip' : 'one_way',
          ticketClass: String(flight.class ?? 'economy'),
          totalPrice: Number(b.total_price ?? 0),
          status: String(b.status ?? 'pending'),
          hold_expires_at: b.hold_expires_at ? String(b.hold_expires_at) : undefined,
          createdAt: String(b.created_at ?? ''),
          passengers: rawPassengers.map((p) => {
            const pax = p as Record<string, unknown>;
            return {
              id: String(pax.id ?? ''),
              name: String(pax.name ?? ''),
              type: 'adult',
              seat: pax.seat_number ? String(pax.seat_number) : undefined,
              baggage: undefined,
            };
          }),
        });

        // Nạp trạng thái dịch vụ server đang giữ để form phản ánh đúng DB.
        try {
          const svc = await apiRequest<{
            ancillaries?: { option_id: string; status?: string }[];
            baggage?: { package_id: string; status: string }[];
            pendingAmount?: number;
          }>(`/api/dat-ve/${encodeURIComponent(id)}/dich-vu`);
          const ids = new Set(
            (svc.ancillaries ?? []).filter((a) => a.status !== 'cancelled').map((a) => a.option_id)
          );
          setHasInsurance(ids.has('insurance'));
          setSelectedTaxi(ids.has('taxi'));
          setTaxiPrice(ids.has('taxi') ? getAncillaryPrice('taxi') : 0);
          if (ids.has('meal')) {
            setSelectedMeal('Suất ăn');
            setMealPrice(getAncillaryPrice('meal'));
          }
          const pkg =
            (svc.baggage ?? []).find((item) => item.status === 'pending') ?? (svc.baggage ?? [])[0];
          const matched = pkg ? BAGGAGE_PACKAGES.find((p) => p.id === pkg.package_id) : undefined;
          if (matched) {
            setSelectedBaggage(matched.label);
            setBaggagePrice(matched.price);
            setPendingBaggage(matched.label);
            setPendingBaggagePrice(matched.price);
          }
          setPendingAmount(Number(svc.pendingAmount ?? 0));
        } catch {
          // GET dịch vụ lỗi không chặn trang — user vẫn chọn được dịch vụ mới.
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Không thể tải thông tin đặt vé.');
      } finally {
        setLoading(false);
      }
    }
    fetchBooking();
  }, [id]);

  const bookingCode = booking?.bookingCode || id;
  const isPaid = booking?.status === 'confirmed' || booking?.status === 'completed';

  // Tổng phải trả = tiền vé (nếu chưa trả) + dịch vụ pending do SERVER tính.
  // Không tự cộng giá phía client — pendingAmount đến từ GET/POST dich-vu.
  const grandTotal = useMemo(() => {
    const fare = isPaid ? 0 : (booking?.totalPrice ?? 0);
    return fare + pendingAmount;
  }, [isPaid, booking?.totalPrice, pendingAmount]);

  const holdRemainingMinutes = (): number | null => {
    if (!booking?.hold_expires_at) return null;
    const diff = new Date(booking.hold_expires_at).getTime() - Date.now();
    return diff > 0 ? Math.ceil(diff / 60000) : 0;
  };

  const formatHoldExpireDate = (isoStr?: string) => {
    if (!isoStr) {
      const d = new Date();
      d.setMinutes(d.getMinutes() + 30);
      return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} | ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }
    try {
      const d = new Date(isoStr);
      return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} | ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    } catch {
      return '';
    }
  };

  // Generate A321 Seat Rows (1 to 28)
  const seatRows = useMemo(() => {
    const rows = [];
    for (let r = 1; r <= 28; r++) {
      let type: 'skyboss' | 'front' | 'legroom' | 'standard' = 'standard';
      let price = 40000;
      if (r <= 3) {
        type = 'skyboss';
        price = 150000;
      } else if (r <= 6) {
        type = 'front';
        price = 60000;
      } else if (r === 11 || r === 12) {
        type = 'legroom';
        price = 90000;
      }
      rows.push({
        row: r,
        type,
        price,
        leftSeats: ['A', 'B', 'C'].map((col) => ({
          id: `${r}${col}`,
          row: r,
          col,
          type,
          price,
          isOccupied: OCCUPIED_SEATS.has(`${r}${col}`),
        })),
        rightSeats: ['D', 'E', 'F'].map((col) => ({
          id: `${r}${col}`,
          row: r,
          col,
          type,
          price,
          isOccupied: OCCUPIED_SEATS.has(`${r}${col}`),
        })),
      });
    }
    return rows;
  }, []);

  const handleSeatClick = (seat: { id: string; price: number; isOccupied: boolean }) => {
    if (seat.isOccupied) {
      toast.error(`Ghế ${seat.id} đã có người chọn! Vui lòng chọn ghế khác.`);
      return;
    }
    const formatted = `${seat.id.slice(0, -1)}-${seat.id.slice(-1)}`;
    setPendingSeat(formatted);
    setPendingSeatPrice(seat.price);
  };

  const syncServicesToBackend = async (overrides?: {
    seat?: string;
    baggagePkg?: string;
    insurance?: boolean;
    meal?: string;
    taxi?: boolean;
  }) => {
    try {
      const insuranceVal = overrides?.insurance !== undefined ? overrides.insurance : hasInsurance;
      const mealVal = overrides?.meal ?? pendingMeal ?? selectedMeal;
      const taxiVal = overrides?.taxi !== undefined ? overrides.taxi : selectedTaxi;

      const services: Record<string, unknown> = {
        passenger_id: booking?.passengers?.[0]?.id,
        insurance: insuranceVal,
        // meal: chuỗi rỗng = khách bỏ chọn → gửi null để route gỡ khỏi DB.
        meal: mealVal ? mealVal : null,
        taxi: taxiVal,
      };
      // Chỉ gửi seat/package_id khi user thực sự đổi — tránh ghi đè lựa chọn cũ.
      if (seatDirty || overrides?.seat) {
        const seatVal = overrides?.seat ?? pendingSeat ?? selectedSeat;
        services.seat_number = String(seatVal).replace('-', '');
      }
      if (baggageDirty || overrides?.baggagePkg) {
        const baggageVal = overrides?.baggagePkg ?? pendingBaggage ?? selectedBaggage;
        const matchedPkg = BAGGAGE_PACKAGES.find((p) => baggageVal.includes(p.label));
        if (matchedPkg) services.package_id = matchedPkg.id;
      }

      const res = await apiRequest<{ pendingAmount?: number }>(
        `/api/dat-ve/${encodeURIComponent(id)}/dich-vu`,
        { method: 'POST', body: { services } }
      );
      if (typeof res?.pendingAmount === 'number') setPendingAmount(res.pendingAmount);
    } catch (e) {
      console.warn('Could not sync services to backend:', e);
    }
  };

  const handleConfirmSeat = async () => {
    setSelectedSeat(pendingSeat);
    setSeatPrice(pendingSeatPrice);
    setSeatDirty(true);
    setShowSeatModal(false);
    toast.success(
      `Đã chọn chỗ ngồi ${pendingSeat} (${pendingSeatPrice.toLocaleString('vi-VN')} VND)!`
    );
    await syncServicesToBackend({ seat: pendingSeat });
  };

  const handleConfirmBaggage = async () => {
    setSelectedBaggage(pendingBaggage);
    setBaggagePrice(pendingBaggagePrice);
    setBaggageDirty(true);
    setShowBaggageModal(false);
    toast.success(
      `Đã cập nhật gói hành lý: ${pendingBaggage} (${pendingBaggagePrice.toLocaleString('vi-VN')} VND)!`
    );
    await syncServicesToBackend({ baggagePkg: pendingBaggage });
  };

  const handleConfirmMeal = async () => {
    setSelectedMeal(pendingMeal);
    setMealPrice(pendingMealPrice);
    setShowMealModal(false);
    toast.success(`Đã chọn suất ăn: ${pendingMeal}!`);
    await syncServicesToBackend({ meal: pendingMeal });
  };

  const handleContinue = async () => {
    await syncServicesToBackend();
    if (pendingAmount > 0) {
      router.push(`/dat-ve/${encodeURIComponent(bookingCode)}/dich-vu/thanh-toan`);
    } else if (!isPaid) {
      router.push(`/thanh-toan?bookingId=${bookingCode}&source=manage`);
    } else {
      router.push(`/dat-ve/${bookingCode}`);
    }
  };

  if (loading) {
    return (
      <div className="relative min-h-screen bg-vj-surface-cool flex flex-col font-sans">
        <Header />
        <main id="main-content" className="flex-1 flex items-center justify-center p-8">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-red-200 border-t-red-600 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-gray-700 font-bold text-sm font-koho">Đang tải dịch vụ bổ sung...</p>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-50">
        <Header />
        <main className="flex-1 flex items-center justify-center p-4">
          <div className="bg-white rounded-vj shadow-lg p-8 max-w-md text-center space-y-4">
            <p className="text-vj-red-dark font-bold">{error}</p>
            <button
              type="button"
              onClick={() => router.push('/tim-kiem-chuyen-bay')}
              className="px-6 py-2 rounded-full bg-vj-yellow text-vj-text font-bold text-xs"
            >
              Quay lại tìm chuyến
            </button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-vj-surface-2 flex flex-col font-koho text-vj-text-strong">
      <Header />
      <ToastContainer toasts={toast.toasts} onDismiss={toast.dismiss} position="top-right" />

      {/* 1. Yellow PNR Subheader Bar matching Image #6 */}
      <div className="w-full bg-vj-yellow text-vj-text border-b border-vj-yellow py-2.5 px-3 sm:px-6 shadow-xs sticky top-[74px] z-20">
        <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-y-1 text-2xs sm:text-xs">
          <div className="flex items-center gap-1.5 font-bold">
            <span>Mã đặt chỗ :</span>
            <span className="text-vj-red-dark font-black text-xs sm:text-sm">{bookingCode}</span>
          </div>
          <div className="flex items-center gap-1.5 font-bold">
            <span>Trạng thái thanh toán :</span>
            <span className={`font-black ${isPaid ? 'text-vj-pay-green' : 'text-vj-red-dark'}`}>
              {isPaid ? 'Đã thanh toán' : 'Chưa thanh toán'}
            </span>
          </div>
          <div className="flex items-center gap-1 text-right font-bold">
            <span>Yêu cầu thanh toán :</span>
            <span className="text-vj-red-dark font-black">
              {grandTotal.toLocaleString('vi-VN')} VND
            </span>
            <span className="text-vj-red-dark text-3xs font-medium ml-1">
              trước {formatHoldExpireDate(booking?.hold_expires_at)} (Theo giờ địa phương)
              {holdRemainingMinutes() !== null && ` — còn ${holdRemainingMinutes()} phút giữ chỗ`}
            </span>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <main id="main-content" className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 py-6 pb-28">
        {/* Title & Warning Notice matching Image #6 */}
        <div className="mb-4">
          <h1 className="text-lg sm:text-xl font-black text-vj-text mb-1">Mua dịch vụ bổ sung</h1>
          <p className="text-2xs sm:text-xs text-red-500 font-medium">
            QUAN TRỌNG: Khi thay đổi một số dịch vụ đã mua trước đó, số dư sẽ không được hoàn lại!
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Left Column: 7 Ancillary Services matching Image #6 */}
          <div className="lg:col-span-2 space-y-3">
            {/* Service 1: Chọn chỗ ngồi yêu thích */}
            <div
              data-testid="service-seat-card"
              onClick={() => {
                setPendingSeat(selectedSeat);
                setPendingSeatPrice(seatPrice);
                setShowSeatModal(true);
              }}
              className="bg-white rounded-2xl border border-gray-200 p-4 flex items-center justify-between shadow-2xs hover:border-amber-400 hover:shadow-xs transition-all cursor-pointer group"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-2xs">
                  <span className="text-xl">💺</span>
                </div>
                <div>
                  <h3 className="font-black text-sm text-vj-text group-hover:text-vj-red-dark transition-colors">
                    Chọn chỗ ngồi yêu thích
                  </h3>
                  <p className="text-3xs text-gray-500">Hãy chọn chỗ ngồi yêu thích của bạn</p>
                  <div className="flex items-center gap-2 mt-1 text-2xs text-gray-700 font-bold">
                    <span className="text-gray-500">
                      {booking?.from} ➔ {booking?.to}
                    </span>
                    <span className="px-2 py-0.5 bg-amber-100 text-amber-900 rounded font-black text-2xs">
                      {selectedSeat}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-black text-vj-text">
                  {seatPrice.toLocaleString('vi-VN')} VND
                </span>
                <span className="text-gray-400 font-bold text-sm">›</span>
              </div>
            </div>

            {/* Service 2: Chọn hành lý/Dịch vụ nối chuyến */}
            <div
              onClick={() => {
                setPendingBaggage(selectedBaggage);
                setPendingBaggagePrice(baggagePrice);
                setShowBaggageModal(true);
              }}
              className="bg-white rounded-2xl border border-gray-200 p-4 flex items-center justify-between shadow-2xs hover:border-amber-400 hover:shadow-xs transition-all cursor-pointer group"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-xl bg-amber-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
                  <span className="text-xl">🧳</span>
                </div>
                <div>
                  <h3 className="font-black text-sm text-vj-text group-hover:text-vj-red-dark transition-colors">
                    Chọn hành lý/Dịch vụ nối chuyến
                  </h3>
                  <p className="text-3xs text-gray-500">Hãy lựa chọn gói hành lý phù hợp</p>
                  <div className="flex items-center gap-2 mt-1 text-2xs text-gray-700 font-bold">
                    <span className="text-gray-500">
                      {booking?.from} ➔ {booking?.to}
                    </span>
                    <span className="px-2 py-0.5 bg-amber-100 text-amber-900 rounded font-black text-2xs">
                      {selectedBaggage}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-black text-vj-text">
                  {baggagePrice.toLocaleString('vi-VN')} VND
                </span>
                <span className="text-gray-400 font-bold text-sm">›</span>
              </div>
            </div>

            {/* Service 3: Chọn suất ăn jet café */}
            <div
              onClick={() => {
                setPendingMeal(selectedMeal);
                setPendingMealPrice(mealPrice);
                setShowMealModal(true);
              }}
              className="bg-white rounded-2xl border border-gray-200 p-4 flex items-center justify-between shadow-2xs hover:border-amber-400 hover:shadow-xs transition-all cursor-pointer group"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-xl bg-orange-500 text-white flex items-center justify-center shrink-0 shadow-2xs">
                  <span className="text-xl">🍱</span>
                </div>
                <div>
                  <h3 className="font-black text-sm text-vj-text group-hover:text-vj-red-dark transition-colors">
                    Chọn suất ăn
                  </h3>
                  <p className="text-2xs text-gray-500 font-semibold">{selectedMeal}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {mealPrice > 0 && (
                  <span className="text-xs font-black text-vj-text">
                    {mealPrice.toLocaleString('vi-VN')} VND
                  </span>
                )}
                <span className="text-gray-400 font-bold text-sm">›</span>
              </div>
            </div>

            {/* Service 4: Dịch vụ Taxi */}
            <div
              onClick={() => {
                setSelectedTaxi(!selectedTaxi);
                setTaxiPrice(!selectedTaxi ? getAncillaryPrice('taxi') : 0);
                toast.success(
                  !selectedTaxi
                    ? `Đã thêm dịch vụ Taxi sân bay (${getAncillaryPrice('taxi').toLocaleString('vi-VN')} VND)`
                    : 'Đã bỏ dịch vụ Taxi'
                );
              }}
              className="bg-white rounded-2xl border border-gray-200 p-4 flex items-center justify-between shadow-2xs hover:border-amber-400 hover:shadow-xs transition-all cursor-pointer group"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-xl bg-yellow-400 text-vj-text flex items-center justify-center shrink-0 shadow-2xs">
                  <span className="text-xl">🚕</span>
                </div>
                <div>
                  <h3 className="font-black text-sm text-vj-text group-hover:text-vj-red-dark transition-colors">
                    Dịch vụ Taxi
                  </h3>
                  <p className="text-3xs text-gray-500">Đưa đón sân bay tiện lợi, an toàn</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`text-xs font-black ${selectedTaxi ? 'text-vj-red-dark' : 'text-gray-400'}`}
                >
                  {selectedTaxi ? '150.000 VND' : 'Chưa chọn'}
                </span>
                <span className="text-gray-400 font-bold text-sm">›</span>
              </div>
            </div>

            {/* Service 5: Bảo hiểm du lịch Vietjet Travel Safe */}
            <div
              onClick={() => {
                setHasInsurance(!hasInsurance);
                toast.success(
                  hasInsurance ? 'Đã bỏ chọn bảo hiểm Travel Safe' : 'Đã thêm bảo hiểm Travel Safe'
                );
              }}
              className="bg-white rounded-2xl border border-gray-200 p-4 flex items-start justify-between shadow-2xs hover:border-amber-400 hover:shadow-xs transition-all cursor-pointer group"
            >
              <div className="flex items-start gap-3.5">
                <div className="w-11 h-11 rounded-xl bg-red-600 text-white flex items-center justify-center shrink-0 shadow-2xs mt-0.5">
                  <span className="text-xl">🛡️</span>
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="font-black text-sm text-vj-text group-hover:text-vj-red-dark transition-colors">
                      Bảo hiểm du lịch Vietjet Travel Safe
                    </h3>
                  </div>
                  <div className="text-2xs text-gray-600 font-bold mt-0.5">
                    {booking?.from} ➔ {booking?.to}
                  </div>
                  <p className="text-3xs text-gray-500 mt-1 max-w-md leading-relaxed">
                    Bảo hiểm du lịch. Giấy chứng nhận bảo hiểm sẽ được cấp cùng vé máy bay, và không
                    thể cấp lại sau chuyến bay.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0 ml-3">
                <span
                  className={`text-xs font-black ${hasInsurance ? 'text-vj-red-dark' : 'text-gray-400'}`}
                >
                  {hasInsurance ? `${insurancePrice.toLocaleString('vi-VN')} VND` : 'Chưa chọn'}
                </span>
                <span className="text-gray-400 font-bold text-sm">›</span>
              </div>
            </div>

            {/* Service 6: Dịch vụ theo hành khách (Badge New) */}
            <div
              onClick={() =>
                toast.info('Dịch vụ hỗ trợ hành khách đặc biệt (xe lăn, ưu tiên) đã được áp dụng.')
              }
              className="bg-white rounded-2xl border border-gray-200 p-4 flex items-center justify-between shadow-2xs hover:border-amber-400 hover:shadow-xs transition-all cursor-pointer group relative overflow-hidden"
            >
              <span className="absolute top-1 right-8 bg-vj-red text-white text-3xs font-black px-1.5 py-0.2 rounded-full uppercase">
                New
              </span>
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-2xs">
                  <span className="text-xl">🧍</span>
                </div>
                <div>
                  <h3 className="font-black text-sm text-vj-text group-hover:text-vj-red-dark transition-colors">
                    Dịch vụ theo hành khách
                  </h3>
                  <p className="text-3xs text-gray-500">Hãy chọn dịch vụ</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-gray-400 font-bold text-sm">›</span>
              </div>
            </div>

            {/* Service 7: Mang theo thú cưng (Badge New) */}
            <div
              onClick={() =>
                toast.info(
                  'Vui lòng liên hệ quầy vé sân bay để xuất chuồng thú cưng theo quy định an toàn.'
                )
              }
              className="bg-white rounded-2xl border border-gray-200 p-4 flex items-center justify-between shadow-2xs hover:border-amber-400 hover:shadow-xs transition-all cursor-pointer group relative overflow-hidden"
            >
              <span className="absolute top-1 right-8 bg-vj-red text-white text-3xs font-black px-1.5 py-0.2 rounded-full uppercase">
                New
              </span>
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-xl bg-amber-400 text-vj-text flex items-center justify-center shrink-0 shadow-2xs">
                  <span className="text-xl">🐾</span>
                </div>
                <div>
                  <h3 className="font-black text-sm text-vj-text group-hover:text-vj-red-dark transition-colors">
                    Mang theo thú cưng
                  </h3>
                  <p className="text-3xs text-gray-500">
                    Vận chuyển thú cưng an toàn trên khoang hàng
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-gray-400 font-bold text-sm">›</span>
              </div>
            </div>
          </div>

          {/* Right Column: THÔNG TIN ĐẶT CHỖ Sidebar matching Image #6 */}
          <div className="lg:col-span-1 space-y-3 text-xs">
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-2xs">
              {/* Header Box Red */}
              <div className="bg-vj-red-dark text-white p-3 flex items-center justify-between font-black text-xs">
                <span>THÔNG TIN ĐẶT CHỖ</span>
                <span className="text-3xs font-medium bg-white/20 px-2 py-0.5 rounded cursor-pointer hover:bg-white/30">
                  Chi Tiết
                </span>
              </div>

              <div className="p-3.5 space-y-3 font-koho text-xs text-vj-text-strong">
                {/* Accordion 1: Thông tin hành khách */}
                <div className="border-b border-gray-100 pb-2.5">
                  <button
                    type="button"
                    onClick={() => setShowPaxSidebar(!showPaxSidebar)}
                    className="w-full flex items-center justify-between font-bold text-gray-700 hover:text-vj-red-dark text-left cursor-pointer"
                  >
                    <span>Thông tin hành khách</span>
                    <span className="text-3xs text-gray-400 font-mono">
                      {showPaxSidebar ? '▲' : '▼'}
                    </span>
                  </button>
                  {showPaxSidebar && (
                    <div className="mt-2 text-2xs text-gray-600 space-y-1">
                      <div>👤 Người lớn: {booking?.passengers?.[0]?.name || '—'}</div>
                      <div>Chỗ ngồi: {selectedSeat}</div>
                      <div>Hành lý: {selectedBaggage}</div>
                    </div>
                  )}
                </div>

                {/* Trip Route Card */}
                <div className="border-b border-gray-100 pb-2.5 space-y-1">
                  <div className="flex items-center justify-between font-bold text-vj-text">
                    <span className="text-2xs">Chuyến đi</span>
                    <span className="text-2xs font-black">
                      {(booking?.totalPrice ?? 0).toLocaleString('vi-VN')} VND
                    </span>
                  </div>
                  <div className="text-3xs text-gray-600">
                    {booking?.fromCity} ({booking?.from}) ➔ {booking?.toCity} ({booking?.to})
                  </div>
                  <div className="text-3xs text-gray-500">
                    {booking?.date} | {booking?.departTime} - {booking?.arriveTime} |{' '}
                    {booking?.flightNo} | {booking?.ticketClass}
                  </div>
                </div>

                {/* Giá vé */}
                <div className="border-b border-gray-100 pb-2.5">
                  <div className="flex items-center justify-between text-2xs font-bold text-gray-700">
                    <span>Giá vé</span>
                    <span>{(booking?.totalPrice ?? 0).toLocaleString('vi-VN')} VND</span>
                  </div>
                </div>

                {/* Dịch vụ bổ sung — tổng pending do SERVER tính */}
                <div className="border-b border-gray-100 pb-2.5 space-y-1">
                  <div className="flex items-center justify-between text-2xs font-bold text-vj-red-dark">
                    <span>Dịch vụ bổ sung</span>
                    <span>{pendingAmount.toLocaleString('vi-VN')} VND</span>
                  </div>
                  {hasInsurance && (
                    <div className="text-3xs text-gray-600 flex justify-between">
                      <span>Bảo hiểm du lịch Vietjet Travel Safe</span>
                      <span>{insurancePrice.toLocaleString('vi-VN')} VND</span>
                    </div>
                  )}
                  {seatPrice > 0 && (
                    <div className="text-3xs text-gray-600 flex justify-between">
                      <span>Ghế ngồi {selectedSeat}</span>
                      <span>{seatPrice.toLocaleString('vi-VN')} VND</span>
                    </div>
                  )}
                  {baggagePrice > 0 && (
                    <div className="text-3xs text-gray-600 flex justify-between">
                      <span>Hành lý {selectedBaggage}</span>
                      <span>{baggagePrice.toLocaleString('vi-VN')} VND</span>
                    </div>
                  )}
                  {mealPrice > 0 && (
                    <div className="text-3xs text-gray-600 flex justify-between">
                      <span>Suất ăn {selectedMeal}</span>
                      <span>{mealPrice.toLocaleString('vi-VN')} VND</span>
                    </div>
                  )}
                  {selectedTaxi && taxiPrice > 0 && (
                    <div className="text-3xs text-gray-600 flex justify-between">
                      <span>Taxi sân bay</span>
                      <span>{taxiPrice.toLocaleString('vi-VN')} VND</span>
                    </div>
                  )}
                </div>

                {/* Total Red Box */}
                <div className="bg-vj-red-dark text-white p-2.5 rounded-vj flex items-center justify-between font-black text-xs">
                  <span>Tổng tiền</span>
                  <span className="text-sm">{grandTotal.toLocaleString('vi-VN')} VND</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Sticky Bottom Action Bar matching Image #6 */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 py-3 px-4 sm:px-8 z-30 shadow-lg">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <button
            type="button"
            onClick={() => router.push(`/dat-ve/${bookingCode}`)}
            className="px-8 py-2.5 rounded-full border border-gray-300 bg-white hover:bg-gray-50 text-vj-text-strong font-bold text-xs shadow-2xs transition-all active:scale-98 cursor-pointer"
          >
            Quay lại
          </button>

          <div className="hidden sm:flex items-center gap-1.5 font-koho font-bold text-xs">
            <span>Tổng tiền</span>
            <span className="text-vj-red-dark font-black text-sm">
              {grandTotal.toLocaleString('vi-VN')} VND
            </span>
            <span className="text-3xs text-gray-500 cursor-pointer ml-1">Chi tiết ▾</span>
          </div>

          <button
            type="button"
            onClick={handleContinue}
            className="px-10 py-2.5 rounded-full bg-vj-yellow hover:bg-vj-amber text-vj-text font-black text-xs shadow-2xs transition-all active:scale-98 cursor-pointer"
          >
            Đi tiếp
          </button>
        </div>
      </div>

      {/* MODAL 1: Sơ đồ chọn chỗ ngồi tương tác (Interactive Seat Map Modal - TASK-02) */}
      {showSeatModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border border-gray-100">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 bg-gradient-to-r from-vj-red-dark to-vj-red-dark text-white flex items-center justify-between">
              <div>
                <h2 className="text-base sm:text-lg font-black flex items-center gap-2">
                  <span>✈️</span>
                  <span>Chọn chỗ ngồi yêu thích - Tàu bay Airbus A321</span>
                </h2>
                <p className="text-2xs text-white/80 mt-0.5">
                  Chuyến bay: {booking?.fromCity} ({booking?.from}) ➔ {booking?.toCity} (
                  {booking?.to}) | {booking?.flightNo}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowSeatModal(false)}
                className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center font-bold text-sm transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Passenger Selection Strip & Seat Legend */}
            <div className="bg-gray-50 p-3.5 border-b border-gray-200 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2 pb-2 border-b border-gray-200">
                <div className="font-bold text-vj-text-strong flex items-center gap-1.5">
                  <span>👤 Hành khách:</span>
                  <span className="text-vj-red-dark font-black">
                    {booking?.passengers?.[0]?.name || '—'}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-2xs font-bold text-gray-700">
                  <span>Ghế đang chọn:</span>
                  <span className="px-2 py-0.5 bg-red-600 text-white rounded font-mono font-black">
                    {pendingSeat}
                  </span>
                  <span className="text-vj-red-dark">
                    ({pendingSeatPrice.toLocaleString('vi-VN')} VND)
                  </span>
                </div>
              </div>

              {/* Swatch Legend */}
              <div className="flex flex-wrap items-center justify-center gap-3 text-3xs font-medium text-gray-600">
                <div className="flex items-center gap-1.5">
                  <div className="w-4 h-4 rounded bg-amber-400 border border-amber-500" />
                  <span>SkyBoss (150k)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-4 h-4 rounded bg-purple-400 border border-purple-500" />
                  <span>Cửa thoát hiểm (90k)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-4 h-4 rounded bg-vj-pay-green border border-vj-pay-green" />
                  <span>Ghế phía trước (60k)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-4 h-4 rounded bg-gray-200 border border-gray-300" />
                  <span>Tiêu chuẩn (40k)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-4 h-4 rounded bg-red-600 text-white font-bold text-3xs flex items-center justify-center">
                    ✓
                  </div>
                  <span>Đang chọn</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-4 h-4 rounded bg-vj-border-light text-white font-bold text-3xs flex items-center justify-center">
                    ✕
                  </div>
                  <span>Đã có người</span>
                </div>
              </div>
            </div>

            {/* Fuselage Seat Grid (Scrollable) */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-gradient-to-b from-gray-100 to-gray-50 flex flex-col items-center">
              {/* Nose of the plane */}
              <div className="w-40 h-14 bg-gradient-to-b from-white to-gray-200 border-2 border-gray-300 rounded-t-full flex items-center justify-center text-gray-400 font-bold text-3xs shadow-xs mb-3">
                BUỒNG LÁI (COCKPIT)
              </div>

              {/* Aircraft Cabin Body */}
              <div className="bg-white border-2 border-gray-300 rounded-3xl p-4 sm:p-6 shadow-sm max-w-md w-full">
                {/* Column Headers */}
                <div className="grid grid-cols-7 gap-1.5 text-center font-bold text-2xs text-gray-500 mb-3 pb-2 border-b border-gray-100">
                  <span>A</span>
                  <span>B</span>
                  <span>C</span>
                  <span className="text-3xs text-gray-400 uppercase">Lối đi</span>
                  <span>D</span>
                  <span>E</span>
                  <span>F</span>
                </div>

                {/* Rows */}
                <div className="space-y-2">
                  {seatRows.map((row) => (
                    <div key={row.row} className="relative">
                      {/* Emergency exit label */}
                      {(row.row === 11 || row.row === 12) && (
                        <div className="text-center text-3xs font-black text-vj-purple bg-vj-surface-rose py-0.5 rounded mb-1">
                          ⚠ CỬA THOÁT HIỂM - CHỖ ĐỂ CHÂN RỘNG
                        </div>
                      )}
                      <div className="grid grid-cols-7 gap-1.5 items-center">
                        {/* Left seats A, B, C */}
                        {row.leftSeats.map((seat) => {
                          const formatted = `${seat.id.slice(0, -1)}-${seat.id.slice(-1)}`;
                          const isSelected = pendingSeat === formatted;
                          return (
                            <button
                              key={seat.id}
                              type="button"
                              disabled={seat.isOccupied}
                              onClick={() => handleSeatClick(seat)}
                              className={`h-8 rounded-vj flex items-center justify-center text-2xs font-bold transition-all ${
                                seat.isOccupied
                                  ? 'bg-vj-border-light text-white cursor-not-allowed opacity-50'
                                  : isSelected
                                    ? 'bg-red-600 text-white ring-2 ring-red-400 shadow-xs scale-105'
                                    : seat.type === 'skyboss'
                                      ? 'bg-amber-100 hover:bg-amber-200 text-amber-900 border border-vj-yellow'
                                      : seat.type === 'legroom'
                                        ? 'bg-purple-100 hover:bg-purple-200 text-purple-900 border border-purple-300'
                                        : seat.type === 'front'
                                          ? 'bg-vj-pay-green hover:bg-vj-pay-green text-vj-pay-green border border-vj-pay-green'
                                          : 'bg-gray-100 hover:bg-gray-200 text-vj-text-strong border border-gray-200'
                              }`}
                              title={`Ghế ${seat.id} - ${seat.price.toLocaleString('vi-VN')} VND`}
                            >
                              {isSelected ? '✓' : seat.isOccupied ? '✕' : seat.col}
                            </button>
                          );
                        })}

                        {/* Aisle Row Number */}
                        <div className="text-center font-mono font-bold text-3xs text-gray-400">
                          {row.row}
                        </div>

                        {/* Right seats D, E, F */}
                        {row.rightSeats.map((seat) => {
                          const formatted = `${seat.id.slice(0, -1)}-${seat.id.slice(-1)}`;
                          const isSelected = pendingSeat === formatted;
                          return (
                            <button
                              key={seat.id}
                              type="button"
                              disabled={seat.isOccupied}
                              onClick={() => handleSeatClick(seat)}
                              className={`h-8 rounded-vj flex items-center justify-center text-2xs font-bold transition-all ${
                                seat.isOccupied
                                  ? 'bg-vj-border-light text-white cursor-not-allowed opacity-50'
                                  : isSelected
                                    ? 'bg-red-600 text-white ring-2 ring-red-400 shadow-xs scale-105'
                                    : seat.type === 'skyboss'
                                      ? 'bg-amber-100 hover:bg-amber-200 text-amber-900 border border-vj-yellow'
                                      : seat.type === 'legroom'
                                        ? 'bg-purple-100 hover:bg-purple-200 text-purple-900 border border-purple-300'
                                        : seat.type === 'front'
                                          ? 'bg-vj-pay-green hover:bg-vj-pay-green text-vj-pay-green border border-vj-pay-green'
                                          : 'bg-gray-100 hover:bg-gray-200 text-vj-text-strong border border-gray-200'
                              }`}
                              title={`Ghế ${seat.id} - ${seat.price.toLocaleString('vi-VN')} VND`}
                            >
                              {isSelected ? '✓' : seat.isOccupied ? '✕' : seat.col}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-white border-t border-gray-200 flex items-center justify-between">
              <div>
                <span className="text-2xs text-gray-500 block">Ghế đã chọn:</span>
                <span className="text-sm font-black text-vj-red-dark">{pendingSeat}</span>
                <span className="text-xs text-gray-700 ml-1">
                  ({pendingSeatPrice.toLocaleString('vi-VN')} VND)
                </span>
              </div>
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowSeatModal(false)}
                  className="px-5 py-2 rounded-full border border-gray-300 text-gray-700 font-bold text-xs hover:bg-gray-50 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={handleConfirmSeat}
                  className="px-6 py-2 rounded-full bg-vj-yellow hover:bg-vj-amber text-vj-text font-black text-xs shadow-2xs transition-all active:scale-98 cursor-pointer"
                >
                  Xác nhận chọn ghế
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Gói hành lý ký gửi */}
      {showBaggageModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl overflow-hidden border border-gray-100">
            <div className="p-4 bg-vj-red-dark text-white flex items-center justify-between">
              <h2 className="text-base font-black flex items-center gap-2">
                <span>🧳</span>
                <span>Chọn gói hành lý ký gửi</span>
              </h2>
              <button
                type="button"
                onClick={() => setShowBaggageModal(false)}
                className="w-7 h-7 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center font-bold text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="p-4 space-y-2.5">
              {BAGGAGE_PACKAGES.map((pkg) => (
                <div
                  key={pkg.id}
                  onClick={() => {
                    setPendingBaggage(pkg.label);
                    setPendingBaggagePrice(pkg.price);
                  }}
                  className={`p-3.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                    pendingBaggage === pkg.label
                      ? 'border-vj-red-dark bg-red-50/50 shadow-2xs'
                      : 'border-gray-200 hover:border-vj-yellow'
                  }`}
                >
                  <div>
                    <div className="font-black text-sm text-vj-text">{pkg.label}</div>
                    <div className="text-3xs text-gray-500">Hành lý ký gửi {pkg.weight}kg</div>
                  </div>
                  <div className="text-right">
                    <div className="font-black text-xs text-vj-red-dark">
                      {pkg.price.toLocaleString('vi-VN')} VND
                    </div>
                    <div className="text-2xs">{pendingBaggage === pkg.label ? '✓' : ''}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-4 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowBaggageModal(false)}
                className="px-5 py-2 rounded-full border border-gray-300 text-gray-700 font-bold text-xs hover:bg-gray-100"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleConfirmBaggage}
                className="px-6 py-2 rounded-full bg-vj-yellow hover:bg-vj-amber text-vj-text font-black text-xs shadow-2xs"
              >
                Xác nhận
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Suất ăn jet café */}
      {showMealModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl overflow-hidden border border-gray-100">
            <div className="p-4 bg-vj-red-dark text-white flex items-center justify-between">
              <h2 className="text-base font-black flex items-center gap-2">
                <span>🍱</span>
                <span>Thực đơn nóng sốt jet café</span>
              </h2>
              <button
                type="button"
                onClick={() => setShowMealModal(false)}
                className="w-7 h-7 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center font-bold text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="p-4 space-y-2.5">
              {MEAL_OPTIONS.map((meal) => (
                <div
                  key={meal.id}
                  onClick={() => {
                    setPendingMeal(meal.name);
                    setPendingMealPrice(meal.price);
                  }}
                  className={`p-3.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                    pendingMeal === meal.name
                      ? 'border-vj-red-dark bg-red-50/50 shadow-2xs'
                      : 'border-gray-200 hover:border-vj-yellow'
                  }`}
                >
                  <div>
                    <div className="font-black text-sm text-vj-text">{meal.name}</div>
                    <div className="text-3xs text-gray-500">{meal.id}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-black text-xs text-vj-red-dark">
                      {meal.price.toLocaleString('vi-VN')} VND
                    </div>
                    <div className="text-2xs">{pendingMeal === meal.name ? '✓' : ''}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-4 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowMealModal(false)}
                className="px-5 py-2 rounded-full border border-gray-300 text-gray-700 font-bold text-xs hover:bg-gray-100"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleConfirmMeal}
                className="px-6 py-2 rounded-full bg-vj-yellow hover:bg-vj-amber text-vj-text font-black text-xs shadow-2xs"
              >
                Xác nhận món
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
