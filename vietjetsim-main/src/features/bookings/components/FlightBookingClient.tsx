'use client';
import React, { useEffect, useRef, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Icon } from '@/shared/components/ui';
import { FlightResultsStep, getAirportCity } from '@/features/flights';
import PassengerInfoStep from './PassengerInfoStep';
import AncillaryServicesStep from './AncillaryServicesStep';
import SeatSelectionDrawer from './SeatSelectionDrawer';
import BaggageSelectionDrawer from './BaggageSelectionDrawer';
import InsuranceDrawer from './InsuranceDrawer';
import MealSelectionDrawer from './MealSelectionDrawer';
import PetServiceDrawer from './PetServiceDrawer';
import PassengerServicesDrawer from './PassengerServicesDrawer';
import TaxiServiceDrawer from './TaxiServiceDrawer';
import { useToast } from '@/hooks/useToast';
import { ToastContainer } from '@/shared/components/feedback';
import { ErrorBoundary } from '@/shared/components/feedback';
import { createBooking } from '@/features/bookings/services';
import { ApiRequestError } from '@/shared/services';
import {
  getBookingTotals,
  fullPassengerName,
  TRAVEL_SAFE_INSURANCE_PRICE,
  type BookingConsents,
  type Flight,
  type Passenger,
  type PassengerType,
  type BookingState,
  type SearchParams,
} from '@/features/bookings';

const STEPS = [
  { id: 1, label: 'Chọn chuyến bay' },
  { id: 2, label: 'Thông tin hành khách' },
  { id: 3, label: 'Dịch vụ bổ sung' },
];

/** Build the passenger roster: adults first, then children, then lap infants. */
function buildPassengerRoster(counts: Record<PassengerType, number>): Passenger[] {
  const blank = {
    name: '',
    dob: '',
    idNumber: '',
    gender: 'male',
    countryCode: 'VN',
    phone: '',
    email: '',
    residence: '',
    skyJoyMemberId: '',
  };
  return (['adult', 'child', 'infant'] as const).flatMap((type) =>
    Array.from({ length: counts[type] }, () => ({ ...blank, type }))
  );
}

/** Recount the roster after the passenger form is edited, so pricing never drifts. */
function countByType(passengers: Passenger[]): Record<PassengerType, number> {
  const counts: Record<PassengerType, number> = { adult: 0, child: 0, infant: 0 };
  for (const passenger of passengers) {
    counts[passenger.type ?? 'adult'] += 1;
  }
  return counts;
}

export interface FlightBookingClientProps {
  onFlightSelect?: (
    flightNo: string,
    fareClass: string,
    fare: number,
    fares?: Partial<Record<string, number>>,
    flight?: { departTime?: string; arriveTime?: string },
    leg?: 'outbound' | 'inbound'
  ) => void;
  continueSignal?: number;
  onStepChange?: (step: number) => void;
  onPaxCountsChange?: (counts: Record<PassengerType, number>) => void;
  baseTotal?: number;
  onTotalChange?: (total: number) => void;
}

function FlightBookingClientInner({
  onFlightSelect,
  continueSignal,
  onStepChange,
  onPaxCountsChange,
  baseTotal,
  onTotalChange,
}: FlightBookingClientProps) {
  const searchParams = useSearchParams();
  const params: SearchParams = {
    from: searchParams.get('from') || undefined,
    to: searchParams.get('to') || undefined,
    depart: searchParams.get('depart') || undefined,
    return: searchParams.get('return') || undefined,
    pax: searchParams.get('pax') || searchParams.get('adult') || undefined,
    child: searchParams.get('child') || undefined,
    infant: searchParams.get('infant') || undefined,
    cheapest: searchParams.get('cheapest') || undefined,
  };

  const isRoundTrip = Boolean(params.return);
  const [currentLeg, setCurrentLeg] = useState<'outbound' | 'inbound'>('outbound');
  const [step, setStep] = useState(1);
  const paxCounts: Record<PassengerType, number> = {
    adult: params.pax ? parseInt(params.pax, 10) || 1 : 1,
    child: params.child ? parseInt(params.child, 10) || 0 : 0,
    infant: params.infant ? parseInt(params.infant, 10) || 0 : 0,
  };
  const [booking, setBooking] = useState<BookingState>(() => ({
    selectedFlight: null,
    returnFlight: null,
    passengers: buildPassengerRoster(paxCounts),
    selectedSeats: [],
    returnSeats: [],
    ancillaries: [],
    selectedBaggage: null,
    returnBaggage: null,
    hasInsurance: false,
  }));
  const [selectedSeatPrices, setSelectedSeatPrices] = useState<number[]>([]);
  const [baggageFee, setBaggageFee] = useState<number>(0);
  const [baggageLabel, setBaggageLabel] = useState<string>('');
  const [returnBaggageLabel, setReturnBaggageLabel] = useState<string>('');
  // Cờ "Xách tay 9kg + ưu tiên" theo từng chặng — đi kèm vào payload để server
  // định giá đúng `PRIORITY_BAGGAGE_FEE` thay vì đoán từ phí client gửi.
  const [baggagePriority, setBaggagePriority] = useState({ outbound: false, return: false });
  const [isSeatDrawerOpen, setIsSeatDrawerOpen] = useState(false);
  const [isBaggageDrawerOpen, setIsBaggageDrawerOpen] = useState(false);
  const [isMealDrawerOpen, setIsMealDrawerOpen] = useState(false);
  const [isInsuranceDrawerOpen, setIsInsuranceDrawerOpen] = useState(false);
  const [isPassengerServicesDrawerOpen, setIsPassengerServicesDrawerOpen] = useState(false);
  const [isPetDrawerOpen, setIsPetDrawerOpen] = useState(false);
  const [isTaxiDrawerOpen, setIsTaxiDrawerOpen] = useState(false);
  const [selectedMeals, setSelectedMeals] = useState<Record<string, number>>({});
  const [mealFee, setMealFee] = useState<number>(0);
  const [consents, setConsents] = useState<BookingConsents>({
    marketing: false,
    survey: false,
    retainForFutureBooking: false,
    policyAccepted: true,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const router = useRouter();
  const toast = useToast();

  const goStep = (next: number) => {
    setStep(next);
    onStepChange?.(next);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  const returnParams: SearchParams = {
    ...params,
    from: params.to,
    to: params.from,
    depart: params.return,
    return: undefined,
  };

  // Signal từ nút "Đi tiếp" ở panel bên ngoài → chuyển sang bước 2.
  const stateRef = useRef({
    step,
    selected: booking.selectedFlight,
    returnFlight: booking.returnFlight,
    isRoundTrip,
  });
  stateRef.current = {
    step,
    selected: booking.selectedFlight,
    returnFlight: booking.returnFlight,
    isRoundTrip,
  };

  const goStepRef = useRef(goStep);
  goStepRef.current = goStep;

  useEffect(() => {
    if (continueSignal && continueSignal > 0) {
      if (stateRef.current.step === 1) {
        if (stateRef.current.isRoundTrip) {
          if (!stateRef.current.selected) {
            toast.error(
              'Chưa chọn chuyến bay đi',
              'Vui lòng chọn chuyến bay đi trước khi bấm Đi tiếp.'
            );
            setCurrentLeg('outbound');
            return;
          }
          if (!stateRef.current.returnFlight) {
            toast.info(
              'Chưa chọn chuyến bay về',
              'Vui lòng chọn chuyến bay về trước khi bấm Đi tiếp.'
            );
            setCurrentLeg('inbound');
            return;
          }
          goStepRef.current(2);
          return;
        }
        if (!stateRef.current.selected) {
          toast.error(
            'Chưa chọn chuyến bay đi',
            'Vui lòng chọn chuyến bay đi trước khi bấm Đi tiếp.'
          );
          return;
        }
        goStepRef.current(2);
      } else if (stateRef.current.step === 2) {
        const form = document.getElementById('passenger-info-form') as HTMLFormElement | null;
        if (form) {
          form.requestSubmit();
        } else {
          goStepRef.current(3);
        }
      }
    }
  }, [continueSignal, toast]);

  const handleFlightSelect = (
    flight: Flight,
    leg: 'outbound' | 'inbound' = currentLeg,
    isUserAction: boolean = true
  ) => {
    if (leg === 'outbound') {
      setBooking((b) => ({
        ...b,
        selectedFlight: flight,
        selectedSeats: [],
      }));
      onFlightSelect?.(
        flight.flightNo,
        flight.fareClass || 'eco',
        flight.price,
        undefined,
        flight,
        'outbound'
      );
      if (isUserAction) {
        if (isRoundTrip) {
          setCurrentLeg('inbound');
          toast.success(
            'Đã chọn chuyến bay đi!',
            `${flight.flightNo}: ${flight.fromCity} → ${flight.toCity} lúc ${flight.departTime}. Vui lòng chọn chuyến bay về.`
          );
        } else {
          if (continueSignal === undefined) {
            goStep(2);
          }
          toast.success(
            'Chuyến bay đã được chọn!',
            `${flight.flightNo}: ${flight.fromCity} → ${flight.toCity} lúc ${flight.departTime}`
          );
        }
      }
    } else {
      setBooking((b) => ({
        ...b,
        returnFlight: flight,
        returnSeats: [],
      }));
      onFlightSelect?.(
        flight.flightNo,
        flight.fareClass || 'eco',
        flight.price,
        undefined,
        flight,
        'inbound'
      );
      if (isUserAction) {
        toast.success(
          'Đã chọn chuyến bay về!',
          `${flight.flightNo}: ${flight.fromCity} → ${flight.toCity} lúc ${flight.departTime}`
        );
        if (continueSignal === undefined) {
          goStep(2);
        }
      }
    }
  };

  const handlePassengersChange = (newPassengers: Passenger[]) => {
    setBooking((b) => ({ ...b, passengers: newPassengers }));
    onPaxCountsChange?.(countByType(newPassengers));
  };

  const handlePassengerSubmit = (passengers: Passenger[], newConsents: BookingConsents) => {
    setBooking((b) => ({ ...b, passengers }));
    setConsents(newConsents);
    onPaxCountsChange?.(countByType(passengers));
    goStep(3);
    toast.success(
      'Đã lưu thông tin hành khách!',
      'Vui lòng chọn dịch vụ bổ sung trước khi hoàn tất đặt vé.'
    );
  };

  const handleConfirmSeats = (seats: string[], seatFee: number, returnSeats?: string[]) => {
    setBooking((b) => ({
      ...b,
      selectedSeats: seats,
      returnSeats: returnSeats || [],
    }));
    setSelectedSeatPrices(seatFee > 0 ? [seatFee] : []);
    const labels = [
      seats.length > 0 ? `Đi: ${seats.join(', ')}` : null,
      returnSeats && returnSeats.length > 0 ? `Về: ${returnSeats.join(', ')}` : null,
    ].filter(Boolean);
    if (labels.length > 0) {
      toast.success('Đã chọn chỗ ngồi!', labels.join(' | '));
    }
  };

  const handleConfirmBaggage = (
    packageId: string | null,
    fee: number,
    label: string,
    returnPackageId?: string | null,
    retLabel?: string,
    _returnFee?: number,
    outboundPriority?: boolean,
    returnPriority?: boolean
  ) => {
    setBooking((b) => ({
      ...b,
      selectedBaggage: packageId,
      returnBaggage: returnPackageId ?? null,
    }));
    setBaggageFee(fee);
    setBaggageLabel(label);
    setBaggagePriority({ outbound: !!outboundPriority, return: !!returnPriority });
    if (retLabel) setReturnBaggageLabel(retLabel);
    if (fee > 0) {
      toast.success(
        'Đã chọn gói hành lý!',
        isRoundTrip ? `Đi: ${label} | Về: ${retLabel || 'Không'}` : label
      );
    }
  };

  const handleConfirmInsurance = (enabled: boolean) => {
    setBooking((b) => ({ ...b, hasInsurance: enabled }));
    if (enabled) {
      toast.success(
        'Đã chọn Bảo hiểm Travel Safe!',
        `${TRAVEL_SAFE_INSURANCE_PRICE.toLocaleString('vi-VN')} VND`
      );
    }
  };

  const handleConfirmMeals = (meals: Record<string, number>, totalFee: number) => {
    setSelectedMeals(meals);
    setMealFee(totalFee);
    if (totalFee > 0) {
      const count = Object.values(meals).reduce((a, b) => a + b, 0);
      toast.success('Đã chọn suất ăn!', `${count} suất (${totalFee.toLocaleString('vi-VN')} VND)`);
    }
  };

  const seatFeeTotal = selectedSeatPrices.reduce((sum, price) => sum + price, 0);
  const insuranceFeeTotal = booking.hasInsurance ? TRAVEL_SAFE_INSURANCE_PRICE : 0;
  const outboundFlight = booking.selectedFlight;
  const returnFlight = booking.returnFlight;

  const outboundTotals = outboundFlight
    ? getBookingTotals({
        farePerPassenger: outboundFlight.price,
        passengerCount: booking.passengers.length,
        paxCounts: countByType(booking.passengers),
        seatFee: 0,
        ancillaries: booking.ancillaries,
      })
    : null;

  const returnTotals =
    isRoundTrip && returnFlight
      ? getBookingTotals({
          farePerPassenger: returnFlight.price,
          passengerCount: booking.passengers.length,
          paxCounts: countByType(booking.passengers),
          seatFee: 0,
          ancillaries: booking.ancillaries,
        })
      : null;

  const fareSubtotal = (outboundTotals?.fareSubtotal ?? 0) + (returnTotals?.fareSubtotal ?? 0);
  const taxAndFee = (outboundTotals?.taxAndFee ?? 0) + (returnTotals?.taxAndFee ?? 0);
  const flightBaseTotal = fareSubtotal + taxAndFee;
  const effectiveFlightBaseTotal = baseTotal && baseTotal > 0 ? baseTotal : flightBaseTotal;

  const finalTotal =
    effectiveFlightBaseTotal + seatFeeTotal + baggageFee + insuranceFeeTotal + mealFee;

  useEffect(() => {
    onTotalChange?.(finalTotal);
  }, [finalTotal, onTotalChange]);

  const handleFinalBookingSubmit = async () => {
    try {
      if (isRoundTrip && !returnFlight?.id) {
        toast.error('Lỗi đặt chỗ', 'Vui lòng chọn chuyến bay về trước khi tiếp tục.');
        return;
      }
      setIsSubmitting(true);
      const selectedFlight = booking.selectedFlight;
      const flightId = selectedFlight?.id;
      if (!selectedFlight || !flightId) {
        toast.error('Lỗi đặt chỗ', 'Vui lòng chọn chuyến bay trước.');
        return;
      }

      const seats = Array.isArray(booking.selectedSeats)
        ? booking.selectedSeats.filter(
            (s): s is string => typeof s === 'string' && s.trim().length > 0
          )
        : [];
      const returnSeats = Array.isArray(booking.returnSeats)
        ? booking.returnSeats.filter(
            (s): s is string => typeof s === 'string' && s.trim().length > 0
          )
        : [];
      const ancillaries = [...booking.ancillaries];
      if (baggageFee > 0) ancillaries.push('baggage');
      if (booking.hasInsurance) ancillaries.push('insurance');
      if (mealFee > 0) ancillaries.push('meal');

      // Dịch vụ gửi theo LỰA CHỌN, không phải theo tiền: gói hành lý (id +
      // cờ ưu tiên, từng chặng) và số lượng từng món. Server định giá lại từ
      // catalogue của `pricing.ts` — cùng nguồn với số tiền drawer đã báo,
      // nên hai bên không thể lệch nhau. `ancillaries` giữ lại làm fallback
      // cho client cũ chỉ gửi id.
      const baggageSelection = {
        outbound_package_id: booking.selectedBaggage || null,
        outbound_priority: baggagePriority.outbound,
        return_package_id: booking.returnBaggage || null,
        return_priority: baggagePriority.return,
      };
      const mealSelection = { ...selectedMeals };

      // Form đặt vé tách "Họ" và "Tên đệm & tên" thành hai ô; vé, check-in và
      // email cần một chuỗi tên đầy đủ, nên ghép lại trước khi gửi.
      const passengers = booking.passengers.map((passenger) => ({
        ...passenger,
        name: fullPassengerName(passenger),
      }));

      const data = await createBooking({
        flight_id: flightId,
        return_flight_id: returnFlight?.id,
        total_price: finalTotal,
        passengers,
        seats,
        return_seats: returnSeats,
        fareClass: selectedFlight.fareClass ?? 'eco',
        returnFareClass: returnFlight?.fareClass ?? 'eco',
        ancillaries,
        baggage: baggageSelection,
        meals: mealSelection,
        consents,
      });
      const bookingId = data.booking.id;
      // `bookings.id` là UUID nội bộ; khách chỉ được thấy PNR 6 ký tự
      // (`bookings.booking_code`) — mã đó mới là thứ in trên vé và khách
      // đọc cho bộ phận hỗ trợ. Chỉ fallback về id cho row cũ chưa có PNR.
      const bookingCode = data.booking.booking_code || bookingId;
      const returnBookingId = data.booking.return_booking_id;
      const returnBookingCode = data.booking.return_booking_code;

      sessionStorage.setItem(
        'vjsim_booking',
        JSON.stringify({
          bookingId,
          bookingCode,
          returnBookingId,
          returnBookingCode,
          flightNo: selectedFlight.flightNo,
          returnFlightNo: returnFlight?.flightNo,
          from: selectedFlight.from,
          to: selectedFlight.to,
          fromCity: selectedFlight.fromCity,
          toCity: selectedFlight.toCity,
          departTime: selectedFlight.departTime,
          arriveTime: selectedFlight.arriveTime,
          returnDepartTime: returnFlight?.departTime,
          returnArriveTime: returnFlight?.arriveTime,
          date: selectedFlight.departDate,
          returnDate: returnFlight?.departDate,
          passengers: passengers.map((passenger, index) => ({
            name: passenger.name,
            seat: seats[index],
            returnSeat: returnSeats[index],
          })),
          fareSubtotal,
          tax: taxAndFee,
          seatFee: seatFeeTotal,
          baggageFee,
          insuranceFee: insuranceFeeTotal,
          mealFee,
          ancillaryFee: baggageFee + insuranceFeeTotal + mealFee,
          ancillaries,
          total: finalTotal,
        })
      );

      toast.success(
        'Đặt chỗ thành công!',
        `Mã đặt chỗ: ${bookingCode}. Đang chuyển đến thanh toán...`,
        { duration: 3000 }
      );
      setTimeout(() => router.push(`/thanh-toan?bookingId=${bookingId}`), 800);
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 401) {
        toast.error('Yêu cầu đăng nhập', 'Vui lòng đăng nhập để hoàn tất đặt vé.');
        const target = encodeURIComponent(window.location.pathname + window.location.search);
        router.push(`/dang-nhap?redirect=${target}`);
        return;
      }
      toast.error('Lỗi đặt chỗ', err instanceof Error ? err.message : 'Không thể tạo booking');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDepartDateChange = (isoDate: string) => {
    if (!isoDate || isoDate === params.depart) return;
    const next = new URLSearchParams(searchParams.toString());
    next.set('depart', isoDate);
    router.replace(`/tim-ve?${next.toString()}`, { scroll: false });
  };

  const handleReturnDateChange = (isoDate: string) => {
    if (!isoDate || isoDate === params.return) return;
    const next = new URLSearchParams(searchParams.toString());
    next.set('return', isoDate);
    router.replace(`/tim-ve?${next.toString()}`, { scroll: false });
  };

  const leadPassenger = booking.passengers[0];
  const leadPassengerName = (leadPassenger ? fullPassengerName(leadPassenger) : '') || 'LONG CHIN';

  return (
    <div className="font-body">
      {/* Vietjet Header: Thông tin hành trình + 4 bước đặt vé (MUI parity) */}
      <div className="w-full bg-white border-b border-gray-200 shadow-xs mb-4">
        <div className="mx-auto max-w-[1240px] px-3 py-3 sm:px-6 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          {/* Cột trái: Thông tin chuyến bay & sân bay */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6 text-xs sm:text-sm font-koho">
            <p className="font-bold text-gray-950 flex items-center gap-1.5">
              <span>{isRoundTrip ? 'Chuyến bay khứ hồi' : 'Chuyến bay một chiều'}</span>
              <span className="text-gray-400">|</span>
              <span>{params.pax || '1'} Người lớn</span>
              {Number(params.child || 0) > 0 && <span>, {params.child} Trẻ em</span>}
              {Number(params.infant || 0) > 0 && <span>, {params.infant} Em bé</span>}
            </p>

            <div className="flex items-center gap-1.5 text-gray-800">
              <svg viewBox="0 0 24 24" className="w-4 h-4 text-primary fill-current shrink-0">
                <path d="M2.5 19h19v2h-19zm19.57-9.36c-.21-.8-1.04-1.28-1.84-1.06L14.92 10 8.86 3.65 6.94 4.16l3.87 6.36-4.5 1.2-1.78-1.42L3 10.7l2.12 3.67 15.63-4.18c.81-.22 1.29-1.05 1.07-1.85z" />
              </svg>
              <span className="font-semibold text-gray-500">Điểm khởi hành</span>
              <span className="font-bold text-gray-950">
                {getAirportCity(params.from || '')} ( {params.from?.toUpperCase()} )
              </span>
            </div>

            <div className="flex items-center gap-1.5 text-gray-800">
              <svg viewBox="0 0 24 24" className="w-4 h-4 text-primary fill-current shrink-0">
                <path d="M2.5 19h19v2h-19zm16.84-3.15c.8.21 1.62-.26 1.84-1.06.21-.8-.26-1.63-1.06-1.84L4.49 8.77 2.37 12.44l1.52.41 1.78-1.42 4.5 1.2-3.87 6.36 1.92.51 6.06-6.35 5.31 1.42z" />
              </svg>
              <span className="font-semibold text-gray-500">Điểm đến</span>
              <span className="font-bold text-gray-950">
                {getAirportCity(params.to || '')} ( {params.to?.toUpperCase()} )
              </span>
            </div>
          </div>

          {/* Cột phải: 4 bước biểu tượng Vietjet */}
          <div className="flex items-center gap-1 sm:gap-2 self-center md:self-auto shrink-0">
            {/* Bước 1: Máy bay (Chọn chuyến bay) */}
            <div
              className={`flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-full transition-all ${
                step === 1
                  ? 'bg-primary text-white shadow-sm ring-2 ring-primary/20'
                  : step > 1
                    ? 'bg-red-50 text-primary'
                    : 'bg-gray-100 text-gray-400'
              }`}
              title="Chọn chuyến bay"
            >
              <svg className="w-4 h-4 sm:w-5 sm:h-5 fill-current" viewBox="0 0 24 24">
                <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
              </svg>
            </div>
            <div className={`w-3 sm:w-5 h-0.5 ${step > 1 ? 'bg-primary' : 'bg-gray-200'}`} />

            {/* Bước 2: Hành khách */}
            <div
              className={`flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-full transition-all ${
                step === 2
                  ? 'bg-primary text-white shadow-sm ring-2 ring-primary/20'
                  : step > 2
                    ? 'bg-red-50 text-primary'
                    : 'bg-gray-100 text-gray-400'
              }`}
              title="Thông tin hành khách"
            >
              <svg className="w-4 h-4 sm:w-5 sm:h-5 fill-current" viewBox="0 0 24 24">
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
              </svg>
            </div>
            <div className={`w-3 sm:w-5 h-0.5 ${step > 2 ? 'bg-primary' : 'bg-gray-200'}`} />

            {/* Bước 3: Dịch vụ bổ sung */}
            <div
              className={`flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-full transition-all ${
                step === 3
                  ? 'bg-primary text-white shadow-sm ring-2 ring-primary/20'
                  : step > 3
                    ? 'bg-red-50 text-primary'
                    : 'bg-gray-100 text-gray-400'
              }`}
              title="Dịch vụ bổ sung"
            >
              <svg className="w-4 h-4 sm:w-5 sm:h-5 fill-current" viewBox="0 0 24 24">
                <path d="M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49c.08-.14.12-.31.12-.48 0-.55-.45-1-1-1H5.21l-.94-2H1zm16 16c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2z" />
              </svg>
            </div>
            <div className={`w-3 sm:w-5 h-0.5 ${step > 3 ? 'bg-primary' : 'bg-gray-200'}`} />

            {/* Bước 4: Thanh toán */}
            <div
              className={`flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-full transition-all ${
                step === 4
                  ? 'bg-primary text-white shadow-sm ring-2 ring-primary/20'
                  : 'bg-gray-100 text-gray-400'
              }`}
              title="Thanh toán"
            >
              <svg className="w-4 h-4 sm:w-5 sm:h-5 fill-current" viewBox="0 0 24 24">
                <path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Booking progress steps (accessible) */}
      <div className="sr-only">
        <div className="mx-auto max-w-5xl px-3 py-3 sm:px-4 md:px-6">
          <nav
            aria-label="Tiến trình đặt vé"
            className="mx-auto flex max-w-2xl items-center justify-center gap-2 overflow-x-auto sm:gap-3 md:gap-4"
          >
            {STEPS.map((s, i) => (
              <React.Fragment key={s.id}>
                <div className="flex items-center gap-1.5 sm:gap-2 md:gap-3 flex-shrink-0">
                  <div
                    className="w-7 h-7 sm:w-8 sm:h-8 md:w-9 md:h-9 rounded-full flex items-center justify-center text-2xs sm:text-xs md:text-sm font-black transition-all flex-shrink-0"
                    style={{
                      background:
                        step > s.id
                          ? 'rgb(var(--primary-rgb) / 0.12)'
                          : step === s.id
                            ? 'var(--primary)'
                            : 'var(--surface-2)',
                      color:
                        step > s.id
                          ? 'var(--primary)'
                          : step === s.id
                            ? 'white'
                            : 'var(--foreground-muted)',
                      fontWeight: 900,
                    }}
                  >
                    {step > s.id ? (
                      <Icon
                        name="CheckIcon"
                        size={12}
                        className="sm:!w-3.5 sm:!h-3.5 md:!w-4 md:!h-4"
                      />
                    ) : (
                      s.id
                    )}
                  </div>
                  <span
                    className="text-2xs sm:text-xs md:text-sm font-semibold hidden sm:block transition-colors"
                    style={{
                      color:
                        step === s.id
                          ? 'var(--primary)'
                          : step > s.id
                            ? 'var(--foreground)'
                            : 'var(--foreground-muted)',
                      fontWeight: step === s.id ? 700 : 600,
                    }}
                  >
                    {s.label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div
                    className="flex-1 h-0.5 min-w-6 sm:min-w-8 md:min-w-12 max-w-10 sm:max-w-12 md:max-w-16 transition-colors flex-shrink-0"
                    style={{
                      background:
                        step > s.id + 1
                          ? 'var(--primary)'
                          : step > s.id
                            ? 'var(--primary)'
                            : 'var(--border)',
                    }}
                  />
                )}
              </React.Fragment>
            ))}
          </nav>
        </div>
      </div>

      {/* Step Content — chiếm trọn cột trái 820px của khung đặt vé (site thật:
          container 1230px, cột trái 820px). Không đặt `max-w-5xl` ở đây vì
          nó sẽ thu hẹp cột trái về 1024px-centered, lệch với số đo. */}
      <div className="mx-auto max-w-full">
        {step === 1 && isRoundTrip && (
          <div className="rounded-vj bg-white border border-gray-200 shadow-sm p-2 sm:p-4 mb-3 mx-auto w-full max-w-lg">
            {/* 1. Dual tabs: Các nút sử dụng nền vàng chữ đen in đậm */}
            <div className="grid grid-cols-2 gap-2 p-1 bg-gray-100 rounded-xl border border-gray-200">
              <button
                type="button"
                data-testid="tab-leg-outbound"
                onClick={() => setCurrentLeg('outbound')}
                className={`flex flex-col items-center justify-center py-2 px-3 rounded-lg transition text-center cursor-pointer ${
                  currentLeg === 'outbound'
                    ? 'bg-vjyellow text-black font-black shadow-xs border border-amber-300'
                    : 'bg-white text-gray-700 hover:bg-gray-50 font-bold'
                }`}
              >
                <div className="flex items-center gap-1.5 text-xs sm:text-sm font-koho font-bold">
                  <span>Chiều đi: {params.from} → {params.to}</span>
                </div>
                <div className={`text-2xs mt-0.5 ${currentLeg === 'outbound' ? 'text-black font-semibold' : 'text-gray-500'}`}>
                  {booking.selectedFlight
                    ? `Đã chọn: ${booking.selectedFlight.flightNo} (${(booking.selectedFlight.fareClass || 'ECO').toUpperCase()})`
                    : 'Đang chọn'}
                </div>
              </button>
              <button
                type="button"
                data-testid="tab-leg-inbound"
                onClick={() => setCurrentLeg('inbound')}
                className={`flex flex-col items-center justify-center py-2 px-3 rounded-lg transition text-center cursor-pointer ${
                  currentLeg === 'inbound'
                    ? 'bg-vjyellow text-black font-black shadow-xs border border-amber-300'
                    : 'bg-white text-gray-700 hover:bg-gray-50 font-bold'
                }`}
              >
                <div className="flex items-center gap-1.5 text-xs sm:text-sm font-koho font-bold">
                  <span>Chiều về: {params.to} → {params.from}</span>
                </div>
                <div className={`text-2xs mt-0.5 ${currentLeg === 'inbound' ? 'text-black font-semibold' : 'text-gray-500'}`}>
                  {booking.returnFlight
                    ? `Đã chọn: ${booking.returnFlight.flightNo} (${(booking.returnFlight.fareClass || 'ECO').toUpperCase()})`
                    : currentLeg === 'inbound'
                      ? 'Đang chọn'
                      : 'Chưa chọn'}
                </div>
              </button>
            </div>

            {/* 2. Route information gộp: Nền đỏ chữ đen in đậm cho badge, tiêu đề in đậm, mô tả viết thường */}
            <div className="pt-2 sm:pt-3">
              <div className="flex items-center justify-center mb-1.5 sm:mb-2">
                <span
                  data-testid="flight-leg-badge"
                  className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-xs font-black font-koho uppercase tracking-wide bg-red-600 text-black border border-red-700 shadow-xs"
                >
                  <span className="w-2 h-2 rounded-full bg-black animate-pulse" />
                  {currentLeg === 'inbound' ? 'Chuyến bay chiều về' : 'Chuyến bay chiều đi'}
                </span>
              </div>
              <div className="flex items-center justify-between sm:justify-center gap-1 sm:gap-14">
                <div className="text-center min-w-0 flex-1 sm:flex-initial">
                  <div className="text-xl sm:text-3xl font-black text-gray-950 font-koho leading-none tracking-tight">
                    {currentLeg === 'inbound' ? params.to?.toUpperCase() : params.from?.toUpperCase()}
                  </div>
                  <div className="text-xs2 sm:text-sm text-gray-600 font-medium mt-1 truncate">
                    {getAirportCity((currentLeg === 'inbound' ? params.to : params.from) || '')}
                  </div>
                </div>

                <div className="flex flex-col items-center justify-center gap-1.5 px-1 sm:px-8 shrink-0">
                  <div className="w-8 sm:w-16 h-1 bg-primary-dark relative rounded-full">
                    <span className="absolute right-0 -top-1 w-0 h-0 border-t-[3px] border-t-transparent border-b-[3px] border-b-transparent border-l-[7px] border-l-primary-dark" />
                  </div>
                  <div className="w-8 sm:w-16 h-1 bg-vj-line relative rounded-full">
                    <span className="absolute left-0 -top-1 w-0 h-0 border-t-[3px] border-t-transparent border-b-[3px] border-b-transparent border-r-[7px] border-r-vj-line" />
                  </div>
                </div>

                <div className="text-center min-w-0 flex-1 sm:flex-initial">
                  <div className="text-xl sm:text-3xl font-black text-gray-950 font-koho leading-none tracking-tight">
                    {currentLeg === 'inbound' ? params.from?.toUpperCase() : params.to?.toUpperCase()}
                  </div>
                  <div className="text-xs2 sm:text-sm text-gray-600 font-medium mt-1 truncate">
                    {getAirportCity((currentLeg === 'inbound' ? params.from : params.to) || '')}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 1 && (
          <ErrorBoundary inline variant="api" retryLabel="Tìm lại chuyến bay">
            {currentLeg === 'outbound' ? (
              <FlightResultsStep
                key="outbound-step"
                leg="outbound"
                isRoundTrip={isRoundTrip}
                hideRouteCard={isRoundTrip}
                onSelect={(flight, isUserAction) =>
                  handleFlightSelect(flight, 'outbound', isUserAction ?? true)
                }
                onFlightSelect={(fNo, fClass, fare, fares, fl) =>
                  onFlightSelect?.(fNo, fClass, fare, fares, fl, 'outbound')
                }
                search={params}
                onDateChange={handleDepartDateChange}
                pax={params.pax}
                child={params.child}
                infant={params.infant}
              />
            ) : (
              <FlightResultsStep
                key="inbound-step"
                leg="inbound"
                isRoundTrip={isRoundTrip}
                hideRouteCard={isRoundTrip}
                onSelect={(flight, isUserAction) =>
                  handleFlightSelect(flight, 'inbound', isUserAction ?? true)
                }
                onFlightSelect={(fNo, fClass, fare, fares, fl) =>
                  onFlightSelect?.(fNo, fClass, fare, fares, fl, 'inbound')
                }
                search={returnParams}
                onDateChange={handleReturnDateChange}
                pax={params.pax}
                child={params.child}
                infant={params.infant}
              />
            )}
          </ErrorBoundary>
        )}

        {step === 2 && booking.selectedFlight && (
          <ErrorBoundary inline variant="booking" retryLabel="Nhập lại thông tin">
            <PassengerInfoStep
              flight={booking.selectedFlight}
              passengerCount={booking.passengers.length}
              initialPassengers={booking.passengers}
              seatFee={seatFeeTotal}
              ancillaries={booking.ancillaries}
              totalAmount={finalTotal}
              onSubmit={handlePassengerSubmit}
              onBack={() => goStep(1)}
              onPassengersChange={handlePassengersChange}
            />
          </ErrorBoundary>
        )}

        {step === 3 && booking.selectedFlight && (
          <ErrorBoundary inline variant="booking" retryLabel="Thử lại dịch vụ bổ sung">
            <AncillaryServicesStep
              flight={booking.selectedFlight}
              returnFlight={booking.returnFlight}
              isRoundTrip={isRoundTrip}
              passengerName={leadPassengerName}
              selectedSeats={booking.selectedSeats}
              returnSeats={booking.returnSeats}
              seatFee={seatFeeTotal}
              baggageLabel={baggageLabel}
              returnBaggageLabel={returnBaggageLabel}
              baggageFee={baggageFee}
              hasInsurance={booking.hasInsurance}
              insuranceFee={TRAVEL_SAFE_INSURANCE_PRICE}
              mealFee={mealFee}
              mealCount={Object.values(selectedMeals).reduce((a, b) => a + b, 0)}
              totalAmount={finalTotal}
              onOpenSeatDrawer={() => setIsSeatDrawerOpen(true)}
              onOpenBaggageDrawer={() => setIsBaggageDrawerOpen(true)}
              onOpenMealDrawer={() => setIsMealDrawerOpen(true)}
              onOpenTaxiDrawer={() => setIsTaxiDrawerOpen(true)}
              onOpenInsuranceDrawer={() => setIsInsuranceDrawerOpen(true)}
              onOpenPassengerServicesDrawer={() => setIsPassengerServicesDrawerOpen(true)}
              onOpenPetDrawer={() => setIsPetDrawerOpen(true)}
              onBack={() => goStep(2)}
              onContinue={handleFinalBookingSubmit}
              isSubmitting={isSubmitting}
            />
          </ErrorBoundary>
        )}
      </div>

      {/* Drawer 1: Chọn chỗ ngồi */}
      {booking.selectedFlight && (
        <SeatSelectionDrawer
          isOpen={isSeatDrawerOpen}
          onClose={() => setIsSeatDrawerOpen(false)}
          flight={booking.selectedFlight}
          returnFlight={booking.returnFlight}
          passengerName={leadPassengerName}
          initialSeats={booking.selectedSeats}
          initialReturnSeats={booking.returnSeats}
          onConfirmSeats={handleConfirmSeats}
          isRoundTrip={isRoundTrip}
        />
      )}

      {/* Drawer 2: Chọn hành lý */}
      {booking.selectedFlight && (
        <BaggageSelectionDrawer
          isOpen={isBaggageDrawerOpen}
          onClose={() => setIsBaggageDrawerOpen(false)}
          flight={booking.selectedFlight}
          returnFlight={booking.returnFlight}
          passengerName={leadPassengerName}
          initialPackageId={booking.selectedBaggage}
          initialReturnPackageId={booking.returnBaggage}
          onConfirmBaggage={handleConfirmBaggage}
          isRoundTrip={isRoundTrip}
        />
      )}

      {/* Drawer 3: Chọn suất ăn */}
      {booking.selectedFlight && (
        <MealSelectionDrawer
          isOpen={isMealDrawerOpen}
          onClose={() => setIsMealDrawerOpen(false)}
          flight={booking.selectedFlight}
          passengerName={leadPassengerName}
          initialMeals={selectedMeals}
          onConfirmMeals={handleConfirmMeals}
          isRoundTrip={isRoundTrip}
        />
      )}

      {/* Drawer 4: Bảo hiểm du lịch Vietjet Travel Safe */}
      {booking.selectedFlight && (
        <InsuranceDrawer
          isOpen={isInsuranceDrawerOpen}
          onClose={() => setIsInsuranceDrawerOpen(false)}
          flight={booking.selectedFlight}
          hasInsurance={Boolean(booking.hasInsurance)}
          onConfirmInsurance={handleConfirmInsurance}
        />
      )}

      {/* Drawer 5: Dịch vụ theo hành khách */}
      {booking.selectedFlight && (
        <PassengerServicesDrawer
          isOpen={isPassengerServicesDrawerOpen}
          onClose={() => setIsPassengerServicesDrawerOpen(false)}
          flight={booking.selectedFlight}
          passengerName={leadPassengerName}
          isRoundTrip={isRoundTrip}
        />
      )}

      {/* Drawer 6: Mang theo thú cưng */}
      {booking.selectedFlight && (
        <PetServiceDrawer
          isOpen={isPetDrawerOpen}
          onClose={() => setIsPetDrawerOpen(false)}
          flight={booking.selectedFlight}
          passengerName={leadPassengerName}
          isRoundTrip={isRoundTrip}
        />
      )}

      {/* Drawer 7: Dịch vụ Taxi */}
      {booking.selectedFlight && (
        <TaxiServiceDrawer
          isOpen={isTaxiDrawerOpen}
          onClose={() => setIsTaxiDrawerOpen(false)}
          flight={booking.selectedFlight}
        />
      )}

      <ToastContainer toasts={toast.toasts} onDismiss={toast.dismiss} position="top-right" />
    </div>
  );
}

export default function FlightBookingClient(props: FlightBookingClientProps) {
  return (
    <Suspense fallback={<FlightSearchSkeleton />}>
      <FlightBookingClientInner {...props} />
    </Suspense>
  );
}

function FlightSearchSkeleton() {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <div className="bg-[var(--surface)] rounded-vj shadow-lg p-8 animate-pulse">
        <div className="h-8 bg-[var(--surface-2)] rounded-vj w-1/3 mb-6" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i}>
              <div className="h-4 bg-[var(--surface-2)] rounded w-1/2 mb-2" />
              <div className="h-10 bg-[var(--surface-2)] rounded-vj" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
