'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Header, Footer } from '@/shared/components/navigation';
import { Icon } from '@/shared/components/ui';
import { apiRequest } from '@/shared/services';
import { useToast } from '@/hooks/useToast';
import { ToastContainer } from '@/shared/components/feedback';

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

// Seat definitions
interface SeatDef {
  id: string;
  row: number;
  col: string;
  type: 'skyboss' | 'front' | 'legroom' | 'standard';
  price: number;
  isOccupied: boolean;
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

  // Selected services state
  const [selectedSeat, setSelectedSeat] = useState<string>('15-A');
  const [seatPrice, setSeatPrice] = useState<number>(40000);
  const [selectedBaggage, setSelectedBaggage] = useState<string>('Gói 20kg');
  const [baggagePrice, setBaggagePrice] = useState<number>(200000);
  const [hasInsurance, setHasInsurance] = useState<boolean>(true);
  const [insurancePrice, setInsurancePrice] = useState<number>(44000);
  const [selectedMeal, setSelectedMeal] = useState<string>('jet café');
  const [mealPrice, setMealPrice] = useState<number>(0);
  const [selectedTaxi, setSelectedTaxi] = useState<boolean>(false);
  const [taxiPrice, setTaxiPrice] = useState<number>(0);

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
        const data = await apiRequest<any>(`/api/dat-ve/${encodeURIComponent(id)}`);
        const b = data.booking || data;
        setBooking({
          id: b.id || id,
          bookingCode: b.booking_code || b.bookingCode || id,
          pnr: b.booking_code || b.pnr || id,
          from: b.origin || b.from || 'SGN',
          to: b.destination || b.to || 'HAN',
          fromCity: b.origin_city || b.fromCity || 'Tp. Hồ Chí Minh',
          toCity: b.destination_city || b.toCity || 'Hà Nội',
          flightNo: b.flight_number || b.flightNo || 'VJ134',
          date: b.departure_date || b.date || '2026-11-30',
          departTime: b.departure_time || b.departTime || '05:00',
          arriveTime: b.arrival_time || b.arriveTime || '07:10',
          flightType: b.flight_type || b.flightType || 'one_way',
          ticketClass: b.ticket_class || b.ticketClass || 'Eco',
          totalPrice: Number(b.total_amount || b.totalPrice || 2623581),
          status: b.status || 'pending_hold',
          hold_expires_at: b.hold_expires_at,
          createdAt: b.created_at || new Date().toISOString(),
          passengers: b.passengers || [
            { id: 'p1', name: 'LONG KA', type: 'adult', seat: '15-A', baggage: '20kg' },
          ],
        });
      } catch (err: any) {
        setError(err.message || 'Không thể tải thông tin đặt vé.');
      } finally {
        setLoading(false);
      }
    }
    fetchBooking();
  }, [id]);

  const bookingCode = booking?.bookingCode || id;
  const isPaid = booking?.status === 'confirmed' || booking?.status === 'completed';

  // Base fare breakdown matching Image #6
  const baseTripPrice = 2579581;
  const farePrice = 1738800;
  const taxPrice = 581581;
  const defaultServiceFee = 259200;
  const convenienceFee = 54000;

  // Additional services total
  const ancillaryTotal = useMemo(() => {
    let sum = 0;
    if (hasInsurance) sum += insurancePrice;
    if (seatPrice > 40000) sum += seatPrice - 40000;
    if (baggagePrice > 200000) sum += baggagePrice - 200000;
    if (mealPrice > 0) sum += mealPrice;
    if (selectedTaxi && taxiPrice > 0) sum += taxiPrice;
    return sum;
  }, [hasInsurance, insurancePrice, seatPrice, baggagePrice, mealPrice, selectedTaxi, taxiPrice]);

  const grandTotal = useMemo(() => {
    return (
      baseTripPrice +
      (hasInsurance ? insurancePrice : 0) +
      (seatPrice > 40000 ? seatPrice - 40000 : 0) +
      (baggagePrice > 200000 ? baggagePrice - 200000 : 0) +
      mealPrice
    );
  }, [baseTripPrice, hasInsurance, insurancePrice, seatPrice, baggagePrice, mealPrice]);

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

  const handleConfirmSeat = () => {
    setSelectedSeat(pendingSeat);
    setSeatPrice(pendingSeatPrice);
    setShowSeatModal(false);
    toast.success(
      `Đã chọn chỗ ngồi ${pendingSeat} (${pendingSeatPrice.toLocaleString('vi-VN')} VND)!`
    );
  };

  const handleConfirmBaggage = () => {
    setSelectedBaggage(pendingBaggage);
    setBaggagePrice(pendingBaggagePrice);
    setShowBaggageModal(false);
    toast.success(
      `Đã cập nhật gói hành lý: ${pendingBaggage} (${pendingBaggagePrice.toLocaleString('vi-VN')} VND)!`
    );
  };

  const handleConfirmMeal = () => {
    setSelectedMeal(pendingMeal);
    setMealPrice(pendingMealPrice);
    setShowMealModal(false);
    toast.success(`Đã chọn suất ăn: ${pendingMeal}!`);
  };

  if (loading) {
    return (
      <div className="relative min-h-screen bg-[#F6F7F9] flex flex-col font-sans">
        <Header />
        <main className="flex-1 flex items-center justify-center p-8">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-red-200 border-t-red-600 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-gray-700 font-bold text-sm font-koho">Đang tải dịch vụ bổ sung...</p>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-[#F5F7FA] flex flex-col font-koho text-gray-800">
      <Header />
      <ToastContainer toasts={toast.toasts} onDismiss={toast.dismiss} position="top-right" />

      {/* 1. Yellow PNR Subheader Bar matching Image #6 */}
      <div className="w-full bg-[#FFD700] text-gray-900 border-b border-amber-300 py-2.5 px-3 sm:px-6 shadow-xs sticky top-[74px] z-20">
        <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-y-1 text-2xs sm:text-xs">
          <div className="flex items-center gap-1.5 font-bold">
            <span>Mã đặt chỗ :</span>
            <span className="text-red-600 font-black text-xs sm:text-sm">{bookingCode}</span>
          </div>
          <div className="flex items-center gap-1.5 font-bold">
            <span>Trạng thái thanh toán :</span>
            <span className={`font-black ${isPaid ? 'text-vj-pay-green' : 'text-red-600'}`}>
              {isPaid ? 'Đã thanh toán' : 'Chưa thanh toán'}
            </span>
          </div>
          <div className="flex items-center gap-1 text-right font-bold">
            <span>Yêu cầu thanh toán :</span>
            <span className="text-red-600 font-black">
              {grandTotal.toLocaleString('vi-VN')} VND
            </span>
            <span className="text-red-600 text-3xs font-medium ml-1">
              trước {formatHoldExpireDate(booking?.hold_expires_at)} (Theo giờ địa phương)
            </span>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 py-6 pb-28">
        {/* Title & Warning Notice matching Image #6 */}
        <div className="mb-4">
          <h1 className="text-lg sm:text-xl font-black text-gray-900 mb-1">Mua dịch vụ bổ sung</h1>
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
                  <h3 className="font-black text-sm text-gray-900 group-hover:text-red-600 transition-colors">
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
                <span className="text-xs font-black text-gray-900">
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
                  <h3 className="font-black text-sm text-gray-900 group-hover:text-red-600 transition-colors">
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
                <span className="text-xs font-black text-gray-900">
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
                  <h3 className="font-black text-sm text-gray-900 group-hover:text-red-600 transition-colors">
                    Chọn suất ăn
                  </h3>
                  <p className="text-2xs text-gray-500 font-semibold">{selectedMeal}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {mealPrice > 0 && (
                  <span className="text-xs font-black text-gray-900">
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
                setTaxiPrice(!selectedTaxi ? 150000 : 0);
                toast.success(
                  !selectedTaxi
                    ? 'Đã thêm dịch vụ Taxi sân bay (150.000 VND)'
                    : 'Đã bỏ dịch vụ Taxi'
                );
              }}
              className="bg-white rounded-2xl border border-gray-200 p-4 flex items-center justify-between shadow-2xs hover:border-amber-400 hover:shadow-xs transition-all cursor-pointer group"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-xl bg-yellow-400 text-gray-900 flex items-center justify-center shrink-0 shadow-2xs">
                  <span className="text-xl">🚕</span>
                </div>
                <div>
                  <h3 className="font-black text-sm text-gray-900 group-hover:text-red-600 transition-colors">
                    Dịch vụ Taxi
                  </h3>
                  <p className="text-3xs text-gray-500">Đưa đón sân bay tiện lợi, an toàn</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`text-xs font-black ${selectedTaxi ? 'text-red-600' : 'text-gray-400'}`}
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
                    <h3 className="font-black text-sm text-gray-900 group-hover:text-red-600 transition-colors">
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
                  className={`text-xs font-black ${hasInsurance ? 'text-red-600' : 'text-gray-400'}`}
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
              <span className="absolute top-1 right-8 bg-red-500 text-white text-[9px] font-black px-1.5 py-0.2 rounded-full uppercase">
                New
              </span>
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-2xs">
                  <span className="text-xl">🧍</span>
                </div>
                <div>
                  <h3 className="font-black text-sm text-gray-900 group-hover:text-red-600 transition-colors">
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
              <span className="absolute top-1 right-8 bg-red-500 text-white text-[9px] font-black px-1.5 py-0.2 rounded-full uppercase">
                New
              </span>
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-xl bg-amber-400 text-gray-900 flex items-center justify-center shrink-0 shadow-2xs">
                  <span className="text-xl">🐾</span>
                </div>
                <div>
                  <h3 className="font-black text-sm text-gray-900 group-hover:text-red-600 transition-colors">
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
              <div className="bg-[#ED1B24] text-white p-3 flex items-center justify-between font-black text-xs">
                <span>THÔNG TIN ĐẶT CHỖ</span>
                <span className="text-3xs font-medium bg-white/20 px-2 py-0.5 rounded cursor-pointer hover:bg-white/30">
                  Chi Tiết
                </span>
              </div>

              <div className="p-3.5 space-y-3 font-koho text-xs text-gray-800">
                {/* Accordion 1: Thông tin hành khách */}
                <div className="border-b border-gray-100 pb-2.5">
                  <button
                    type="button"
                    onClick={() => setShowPaxSidebar(!showPaxSidebar)}
                    className="w-full flex items-center justify-between font-bold text-gray-700 hover:text-red-600 text-left cursor-pointer"
                  >
                    <span>Thông tin hành khách</span>
                    <span className="text-3xs text-gray-400 font-mono">
                      {showPaxSidebar ? '▲' : '▼'}
                    </span>
                  </button>
                  {showPaxSidebar && (
                    <div className="mt-2 text-2xs text-gray-600 space-y-1">
                      <div>👤 Người lớn: {booking?.passengers?.[0]?.name || 'LONG KA'}</div>
                      <div>Chỗ ngồi: {selectedSeat}</div>
                      <div>Hành lý: {selectedBaggage}</div>
                    </div>
                  )}
                </div>

                {/* Trip Route Card */}
                <div className="border-b border-gray-100 pb-2.5 space-y-1">
                  <div className="flex items-center justify-between font-bold text-gray-900">
                    <span className="text-2xs">Chuyến đi</span>
                    <span className="text-2xs font-black">
                      {baseTripPrice.toLocaleString('vi-VN')} VND ✏️
                    </span>
                  </div>
                  <div className="text-3xs text-gray-600">
                    {booking?.fromCity} ({booking?.from}) ➔ {booking?.toCity} ({booking?.to})
                  </div>
                  <div className="text-3xs text-gray-500">
                    T2, 30/11/2026 | {booking?.departTime} - {booking?.arriveTime} |{' '}
                    {booking?.flightNo} | Eco
                  </div>
                </div>

                {/* Giá vé */}
                <div className="border-b border-gray-100 pb-2.5">
                  <div className="flex items-center justify-between text-2xs font-bold text-gray-700">
                    <span>Giá vé</span>
                    <span>{farePrice.toLocaleString('vi-VN')} VND ▾</span>
                  </div>
                </div>

                {/* Thuế, phí */}
                <div className="border-b border-gray-100 pb-2.5">
                  <div className="flex items-center justify-between text-2xs font-bold text-gray-700">
                    <span>Thuế, phí</span>
                    <span>{taxPrice.toLocaleString('vi-VN')} VND ▾</span>
                  </div>
                </div>

                {/* Dịch vụ */}
                <div className="border-b border-gray-100 pb-2.5">
                  <div className="flex items-center justify-between text-2xs font-bold text-gray-700">
                    <span>Dịch vụ</span>
                    <span>{defaultServiceFee.toLocaleString('vi-VN')} VND ▾</span>
                  </div>
                </div>

                {/* Dịch vụ bổ sung */}
                <div className="border-b border-gray-100 pb-2.5 space-y-1">
                  <div className="flex items-center justify-between text-2xs font-bold text-red-600">
                    <span>Dịch vụ bổ sung</span>
                    <span>{insurancePrice.toLocaleString('vi-VN')} VND</span>
                  </div>
                  <div className="text-3xs text-gray-600 flex justify-between">
                    <span>Bảo hiểm du lịch Vietjet Travel Safe</span>
                    <span>{insurancePrice.toLocaleString('vi-VN')} VND</span>
                  </div>
                  <div className="text-3xs text-gray-500 flex justify-between">
                    <span>BaoViet Insurance</span>
                    <span>44.000</span>
                  </div>
                  <div className="text-3xs text-gray-500 flex justify-between">
                    <span>Thuế VAT</span>
                    <span>0</span>
                  </div>
                </div>

                {/* Phí tiện ích */}
                <div className="border-b border-gray-100 pb-2.5">
                  <div className="flex items-center justify-between text-2xs font-bold text-gray-700">
                    <span>Phí tiện ích</span>
                    <span>{convenienceFee.toLocaleString('vi-VN')} VND</span>
                  </div>
                </div>

                {/* Total Red Box */}
                <div className="bg-[#ED1B24] text-white p-2.5 rounded-lg flex items-center justify-between font-black text-xs">
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
            className="px-8 py-2.5 rounded-full border border-gray-300 bg-white hover:bg-gray-50 text-gray-800 font-bold text-xs shadow-2xs transition-all active:scale-98 cursor-pointer"
          >
            Quay lại
          </button>

          <div className="hidden sm:flex items-center gap-1.5 font-koho font-bold text-xs">
            <span>Tổng tiền</span>
            <span className="text-red-600 font-black text-sm">
              {grandTotal.toLocaleString('vi-VN')} VND
            </span>
            <span className="text-3xs text-gray-500 cursor-pointer ml-1">Chi tiết ▾</span>
          </div>

          <button
            type="button"
            onClick={() => router.push(`/thanh-toan?bookingId=${bookingCode}&source=manage`)}
            className="px-10 py-2.5 rounded-full bg-[#FFD700] hover:bg-amber-400 text-gray-900 font-black text-xs shadow-2xs transition-all active:scale-98 cursor-pointer"
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
            <div className="p-4 sm:p-5 bg-gradient-to-r from-red-600 to-[#ED1B24] text-white flex items-center justify-between">
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
                <div className="font-bold text-gray-800 flex items-center gap-1.5">
                  <span>👤 Hành khách:</span>
                  <span className="text-red-600 font-black">
                    {booking?.passengers?.[0]?.name || 'LONG KA'}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-2xs font-bold text-gray-700">
                  <span>Ghế đang chọn:</span>
                  <span className="px-2 py-0.5 bg-red-600 text-white rounded font-mono font-black">
                    {pendingSeat}
                  </span>
                  <span className="text-red-600">
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
                  <div className="w-4 h-4 rounded bg-red-600 text-white font-bold text-[9px] flex items-center justify-center">
                    ✓
                  </div>
                  <span>Đang chọn</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-4 h-4 rounded bg-gray-400 text-white font-bold text-[9px] flex items-center justify-center">
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
                        <div className="text-center text-[9px] font-black text-purple-700 bg-purple-50 py-0.5 rounded mb-1">
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
                              className={`h-8 rounded-lg flex items-center justify-center text-2xs font-bold transition-all ${
                                seat.isOccupied
                                  ? 'bg-gray-400 text-white cursor-not-allowed opacity-50'
                                  : isSelected
                                    ? 'bg-red-600 text-white ring-2 ring-red-400 shadow-xs scale-105'
                                    : seat.type === 'skyboss'
                                      ? 'bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300'
                                      : seat.type === 'legroom'
                                        ? 'bg-purple-100 hover:bg-purple-200 text-purple-900 border border-purple-300'
                                        : seat.type === 'front'
                                          ? 'bg-vj-pay-green hover:bg-vj-pay-green text-vj-pay-green border border-vj-pay-green'
                                          : 'bg-gray-100 hover:bg-gray-200 text-gray-800 border border-gray-200'
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
                              className={`h-8 rounded-lg flex items-center justify-center text-2xs font-bold transition-all ${
                                seat.isOccupied
                                  ? 'bg-gray-400 text-white cursor-not-allowed opacity-50'
                                  : isSelected
                                    ? 'bg-red-600 text-white ring-2 ring-red-400 shadow-xs scale-105'
                                    : seat.type === 'skyboss'
                                      ? 'bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300'
                                      : seat.type === 'legroom'
                                        ? 'bg-purple-100 hover:bg-purple-200 text-purple-900 border border-purple-300'
                                        : seat.type === 'front'
                                          ? 'bg-vj-pay-green hover:bg-vj-pay-green text-vj-pay-green border border-vj-pay-green'
                                          : 'bg-gray-100 hover:bg-gray-200 text-gray-800 border border-gray-200'
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
                <span className="text-sm font-black text-red-600">{pendingSeat}</span>
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
                  className="px-6 py-2 rounded-full bg-[#FFD700] hover:bg-amber-400 text-gray-900 font-black text-xs shadow-2xs transition-all active:scale-98 cursor-pointer"
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
            <div className="p-4 bg-[#ED1B24] text-white flex items-center justify-between">
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
              {[
                { name: 'Gói 20kg', price: 200000, desc: 'Phù hợp chuyến đi du lịch 3-5 ngày' },
                { name: 'Gói 30kg', price: 330000, desc: 'Thoải mái mua sắm và quà lưu niệm' },
                { name: 'Gói 40kg', price: 440000, desc: 'Dung tích tối đa cho chuyến đi dài' },
                { name: 'Hành lý quá khổ 20kg', price: 350000, desc: 'Dụng cụ thể thao, nhạc cụ' },
              ].map((pkg) => (
                <div
                  key={pkg.name}
                  onClick={() => {
                    setPendingBaggage(pkg.name);
                    setPendingBaggagePrice(pkg.price);
                  }}
                  className={`p-3.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                    pendingBaggage === pkg.name
                      ? 'border-red-600 bg-red-50/50 shadow-2xs'
                      : 'border-gray-200 hover:border-amber-300'
                  }`}
                >
                  <div>
                    <div className="font-black text-sm text-gray-900">{pkg.name}</div>
                    <div className="text-3xs text-gray-500">{pkg.desc}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-black text-xs text-red-600">
                      {pkg.price.toLocaleString('vi-VN')} VND
                    </div>
                    <div className="text-2xs">{pendingBaggage === pkg.name ? '✓' : ''}</div>
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
                className="px-6 py-2 rounded-full bg-[#FFD700] hover:bg-amber-400 text-gray-900 font-black text-xs shadow-2xs"
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
            <div className="p-4 bg-[#ED1B24] text-white flex items-center justify-between">
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
              {[
                { name: 'Cơm gà xối mỡ', price: 85000, desc: 'Cơm dẻo thơm ăn kèm gà vàng giòn' },
                {
                  name: 'Xôi mặn ngũ sắc',
                  price: 85000,
                  desc: 'Xôi nếp dẻo thơm, chà bông, lạp xưởng',
                },
                { name: 'Miến xào cua', price: 95000, desc: 'Thịt cua tươi xào miến dai ngọt' },
                {
                  name: 'Bánh mì chả lụa pate',
                  price: 65000,
                  desc: 'Đậm đà hương vị truyền thống Việt',
                },
                { name: 'Cà phê sữa đá dừa', price: 45000, desc: 'Cà phê thơm béo vị sữa dừa' },
              ].map((meal) => (
                <div
                  key={meal.name}
                  onClick={() => {
                    setPendingMeal(meal.name);
                    setPendingMealPrice(meal.price);
                  }}
                  className={`p-3.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                    pendingMeal === meal.name
                      ? 'border-red-600 bg-red-50/50 shadow-2xs'
                      : 'border-gray-200 hover:border-amber-300'
                  }`}
                >
                  <div>
                    <div className="font-black text-sm text-gray-900">{meal.name}</div>
                    <div className="text-3xs text-gray-500">{meal.desc}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-black text-xs text-red-600">
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
                className="px-6 py-2 rounded-full bg-[#FFD700] hover:bg-amber-400 text-gray-900 font-black text-xs shadow-2xs"
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
