'use client';
import React, { useState, useEffect, useMemo } from 'react';
import { Icon } from '@/shared/components/ui';
import { listAdminFlights, createAdminQuickBooking, type AdminFlight } from '@/features/admin';
import { getApiErrorMessage } from '@/shared/services';
import { parseQuickFlightText } from '@/lib/quick-flight-parser';
import { parsePassengerQuickText, type ParsedPassenger } from '@/lib/quick-booking-parser';

interface ToastAPI {
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  info?: (title: string, message?: string) => void;
}

interface QuickBookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  onToast?: ToastAPI;
  onSendEmail?: (booking: {
    id: string;
    userName: string;
    userEmail?: string;
    amount: number;
  }) => void;
  onPrintInvoice?: (booking: {
    id: string;
    userName: string;
    flightNo: string;
    route: string;
    date: string;
    seat: string;
    amount: number;
    status: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'refunded';
    payMethod: string;
    createdAt: string;
  }) => void;
}

export default function QuickBookingModal({
  isOpen,
  onClose,
  onSuccess,
  onToast,
  onSendEmail,
  onPrintInvoice,
}: QuickBookingModalProps) {
  // Flight list loaded from system
  const [flights, setFlights] = useState<AdminFlight[]>([]);
  const [isLoadingFlights, setIsLoadingFlights] = useState(false);

  // Form states
  const [isRoundTrip, setIsRoundTrip] = useState(false);
  const [selectedFlightId, setSelectedFlightId] = useState('');
  const [selectedReturnFlightId, setSelectedReturnFlightId] = useState('');
  const [flightSearchQuery, setFlightSearchQuery] = useState('');
  const [returnSearchQuery, setReturnSearchQuery] = useState('');

  // Fare Class
  const [fareClass, setFareClass] = useState<'eco' | 'deluxe' | 'skyboss' | 'business'>('eco');

  // Passengers
  const [passengers, setPassengers] = useState<ParsedPassenger[]>([
    {
      name: '',
      gender: 'male',
      passenger_type: 'adult',
      dob: '',
      id_number: '',
      phone: '',
      email: '',
      seat_number: '',
    },
  ]);

  // Contact Info
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');

  // Payment & Price
  const [isCustomPrice, setIsCustomPrice] = useState(false);
  const [customPrice, setCustomPrice] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [bookingStatus, setBookingStatus] = useState<'confirmed' | 'pending'>('confirmed');
  const [note, setNote] = useState('');
  const [sendEmail, setSendEmail] = useState(true);

  // Quick Paste tools
  const [showFlightPaste, setShowFlightPaste] = useState(false);
  const [flightPasteText, setFlightPasteText] = useState('');
  const [showPassengerPaste, setShowPassengerPaste] = useState(false);
  const [passengerPasteText, setPassengerPasteText] = useState('');

  // Submitting & Result
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdBookingResult, setCreatedBookingResult] = useState<{
    id: string;
    booking_code: string;
    total_price: number;
    status: string;
    flight_no?: string;
    from_code?: string;
    to_code?: string;
    date?: string;
    user_name?: string;
    user_email?: string;
    payment_method?: string;
  } | null>(null);

  // Fetch flights when opened
  useEffect(() => {
    if (isOpen) {
      setIsLoadingFlights(true);
      listAdminFlights({ limit: 100 })
        .then((res) => {
          setFlights(res.flights || []);
        })
        .catch((err) => {
          console.error('Failed to load flights:', err);
        })
        .finally(() => {
          setIsLoadingFlights(false);
        });
    } else {
      // Reset state on close
      setCreatedBookingResult(null);
      setShowFlightPaste(false);
      setShowPassengerPaste(false);
    }
  }, [isOpen]);

  // Selected flights
  const outboundFlight = useMemo(
    () => flights.find((f) => f.id === selectedFlightId),
    [flights, selectedFlightId]
  );
  const returnFlight = useMemo(
    () => flights.find((f) => f.id === selectedReturnFlightId),
    [flights, selectedReturnFlightId]
  );

  // Filtered flights for picker
  const filteredOutboundFlights = useMemo(() => {
    const q = flightSearchQuery.trim().toLowerCase();
    if (!q) return flights.slice(0, 8);
    return flights
      .filter(
        (f) =>
          f.flight_no.toLowerCase().includes(q) ||
          f.from_code.toLowerCase().includes(q) ||
          f.to_code.toLowerCase().includes(q) ||
          (f.depart_time && f.depart_time.includes(q))
      )
      .slice(0, 10);
  }, [flights, flightSearchQuery]);

  const filteredReturnFlights = useMemo(() => {
    const q = returnSearchQuery.trim().toLowerCase();
    // Return flights should preferably match reverse route
    const base = outboundFlight
      ? flights.filter(
          (f) => f.from_code === outboundFlight.to_code && f.to_code === outboundFlight.from_code
        )
      : flights;

    if (!q) return base.slice(0, 8);
    return base
      .filter(
        (f) =>
          f.flight_no.toLowerCase().includes(q) ||
          f.from_code.toLowerCase().includes(q) ||
          f.to_code.toLowerCase().includes(q)
      )
      .slice(0, 10);
  }, [flights, outboundFlight, returnSearchQuery]);

  // Calculate pricing preview
  const calculatedTotal = useMemo(() => {
    if (!outboundFlight) return 0;
    const ecoPrice = Number(outboundFlight.economy_price) || 499000;
    const bizPrice = Number(outboundFlight.business_price) || Math.round(ecoPrice * 2.77);
    const step = (bizPrice - ecoPrice) / 3;

    let farePerPax = ecoPrice;
    if (fareClass === 'business') farePerPax = bizPrice;
    else if (fareClass === 'skyboss') farePerPax = Math.round(ecoPrice + step * 2);
    else if (fareClass === 'deluxe') farePerPax = Math.round(ecoPrice + step);

    const adultCount = passengers.filter((p) => p.passenger_type === 'adult').length;
    const childCount = passengers.filter((p) => p.passenger_type === 'child').length;
    const infantCount = passengers.filter((p) => p.passenger_type === 'infant').length;

    const taxableOutbound = farePerPax * (adultCount + childCount * 0.75);
    const outboundTotal = Math.round(
      taxableOutbound + farePerPax * infantCount * 0.1 + taxableOutbound * 0.1
    );

    let returnTotal = 0;
    if (isRoundTrip && returnFlight) {
      const retEco = Number(returnFlight.economy_price) || 499000;
      const retBiz = Number(returnFlight.business_price) || Math.round(retEco * 2.77);
      const retStep = (retBiz - retEco) / 3;
      let retFarePerPax = retEco;
      if (fareClass === 'business') retFarePerPax = retBiz;
      else if (fareClass === 'skyboss') retFarePerPax = Math.round(retEco + retStep * 2);
      else if (fareClass === 'deluxe') retFarePerPax = Math.round(retEco + retStep);

      const taxableReturn = retFarePerPax * (adultCount + childCount * 0.75);
      returnTotal = Math.round(
        taxableReturn + retFarePerPax * infantCount * 0.1 + taxableReturn * 0.1
      );
    }

    return outboundTotal + returnTotal;
  }, [outboundFlight, returnFlight, isRoundTrip, fareClass, passengers]);

  // Synchronize customPrice with calculatedTotal initially
  useEffect(() => {
    if (!isCustomPrice) {
      setCustomPrice(calculatedTotal);
    }
  }, [calculatedTotal, isCustomPrice]);

  if (!isOpen) return null;

  // Passenger handlers
  const handleAddPassenger = () => {
    setPassengers((prev) => [
      ...prev,
      {
        name: '',
        gender: 'male',
        passenger_type: 'adult',
        dob: '',
        id_number: '',
        phone: '',
        email: '',
        seat_number: '',
      },
    ]);
  };

  const handleRemovePassenger = (index: number) => {
    if (passengers.length <= 1) return;
    setPassengers((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpdatePassenger = (index: number, field: keyof ParsedPassenger, value: string) => {
    setPassengers((prev) => prev.map((p, i) => (i === index ? { ...p, [field]: value } : p)));
  };

  // Quick Flight text parse
  const handleApplyFlightPaste = () => {
    if (!flightPasteText.trim()) return;
    const parsed = parseQuickFlightText(flightPasteText);
    if (parsed.length === 0) {
      onToast?.error('Lỗi nhận diện', 'Không tìm thấy thông tin chuyến bay từ văn bản đã dán.');
      return;
    }

    const first = parsed[0];
    const matchOut = flights.find(
      (f) =>
        f.flight_no.replace(/\s+/g, '').toUpperCase() ===
          first.flight_no.replace(/\s+/g, '').toUpperCase() ||
        (f.from_code === first.from_code && f.to_code === first.to_code)
    );

    if (matchOut) {
      setSelectedFlightId(matchOut.id);
      onToast?.success(
        'Đã chọn chuyến bay đi',
        `${matchOut.flight_no} (${matchOut.from_code} ➔ ${matchOut.to_code})`
      );
    }

    // Nếu văn bản có chuyến về
    if (parsed.length > 1) {
      const second = parsed[1];
      const matchIn = flights.find(
        (f) =>
          f.flight_no.replace(/\s+/g, '').toUpperCase() ===
            second.flight_no.replace(/\s+/g, '').toUpperCase() ||
          (f.from_code === second.from_code && f.to_code === second.to_code)
      );
      if (matchIn) {
        setIsRoundTrip(true);
        setSelectedReturnFlightId(matchIn.id);
        onToast?.success(
          'Đã chọn chuyến bay về',
          `${matchIn.flight_no} (${matchIn.from_code} ➔ ${matchIn.to_code})`
        );
      }
    }

    setShowFlightPaste(false);
    setFlightPasteText('');
  };

  // Quick Passenger text parse
  const handleApplyPassengerPaste = () => {
    if (!passengerPasteText.trim()) return;
    const parsed = parsePassengerQuickText(passengerPasteText);
    if (parsed.length === 0) {
      onToast?.error('Lỗi bóc tách', 'Không nhận diện được hành khách từ văn bản.');
      return;
    }

    setPassengers(parsed);
    // Tự động gán thông tin liên hệ từ khách 1 nếu contact trống
    if (parsed[0]) {
      if (!contactName) setContactName(parsed[0].name);
      if (!contactPhone && parsed[0].phone) setContactPhone(parsed[0].phone);
      if (!contactEmail && parsed[0].email) setContactEmail(parsed[0].email);
    }

    onToast?.success(
      'Đã nhận diện hành khách',
      `Đã bóc tách thành công ${parsed.length} hành khách.`
    );
    setShowPassengerPaste(false);
    setPassengerPasteText('');
  };

  // Submit quick booking
  const handleSubmitBooking = async () => {
    if (!selectedFlightId) {
      onToast?.error('Thiếu thông tin', 'Vui lòng chọn chuyến bay đi.');
      return;
    }

    if (isRoundTrip && !selectedReturnFlightId) {
      onToast?.error('Thiếu thông tin', 'Vui lòng chọn chuyến bay chiều về cho vé khứ hồi.');
      return;
    }

    for (let i = 0; i < passengers.length; i++) {
      if (!passengers[i].name.trim()) {
        onToast?.error('Thiếu thông tin', `Vui lòng nhập họ tên cho hành khách số ${i + 1}.`);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const payload = {
        flight_id: selectedFlightId,
        return_flight_id: isRoundTrip ? selectedReturnFlightId : undefined,
        fare_class: fareClass,
        return_fare_class: fareClass,
        passengers: passengers.map((p) => ({
          name: p.name.trim(),
          gender: p.gender,
          passenger_type: p.passenger_type,
          dob: p.dob || null,
          id_number: p.id_number || null,
          phone: p.phone || null,
          email: p.email || null,
          seat_number: p.seat_number || null,
        })),
        contact: {
          name: contactName.trim() || passengers[0]?.name || 'Khách hàng',
          phone: contactPhone.trim() || passengers[0]?.phone || undefined,
          email: contactEmail.trim() || passengers[0]?.email || undefined,
        },
        custom_price: isCustomPrice ? customPrice : undefined,
        status: bookingStatus,
        payment_method: paymentMethod,
        note: note.trim() || undefined,
        send_email: sendEmail,
      };

      const res = await createAdminQuickBooking(payload);

      if (res.success && res.booking) {
        setCreatedBookingResult(res.booking);
        onToast?.success(
          'Đặt vé thành công!',
          `Mã PNR: ${res.booking.booking_code} · Trạng thái: ${res.booking.status}`
        );
        onSuccess?.();
      } else {
        onToast?.error('Đặt vé thất bại', res.message || 'Không thể tạo đơn đặt vé.');
      }
    } catch (err) {
      onToast?.error('Lỗi hệ thống', getApiErrorMessage(err, 'Đã xảy ra lỗi khi tạo đặt vé.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-5">
      <div className="bg-slate-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-4xl text-white flex flex-col max-h-[92vh] overflow-hidden animate-fadeIn">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-white/10 bg-slate-900/90">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
              <Icon name="BoltIcon" size={22} />
            </div>
            <div>
              <h3 className="font-bold text-base sm:text-lg text-white flex items-center gap-2">
                Đặt vé nhanh cho Admin ⚡
              </h3>
              <p className="text-xs text-vj-admin-muted mt-0.5">
                Tạo đơn đặt vé 1 chiều / khứ hồi trực tiếp, xuất vé hoặc giữ chỗ tức thì
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-white flex items-center justify-center transition-colors"
          >
            <Icon name="XMarkIcon" size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 space-y-6 overflow-y-auto">
          {/* Màn hình Thành công sau khi đặt vé */}
          {createdBookingResult ? (
            <div className="p-6 bg-slate-800/80 border border-emerald-500/30 rounded-2xl space-y-6 text-center animate-fadeIn">
              <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto shadow-lg">
                <Icon name="CheckCircleIcon" size={36} />
              </div>

              <div>
                <span className="text-xs font-black uppercase tracking-widest text-emerald-400">
                  Đã tạo đơn đặt vé thành công
                </span>
                <h4 className="text-3xl font-black text-amber-400 tracking-wider mt-1 flex items-center justify-center gap-2">
                  <span>{createdBookingResult.booking_code}</span>
                  <button
                    type="button"
                    title="Sao chép mã PNR"
                    onClick={() => {
                      navigator.clipboard.writeText(createdBookingResult.booking_code);
                      onToast?.success('Đã sao chép mã PNR', createdBookingResult.booking_code);
                    }}
                    className="p-1 hover:text-white transition-colors"
                  >
                    <Icon name="DocumentDuplicateIcon" size={20} />
                  </button>
                </h4>
                <p className="text-xs text-vj-admin-muted mt-1">
                  Mã đặt chỗ (PNR) chuẩn hãng Vietjet · Lưu vào hệ thống quản trị
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-white/5 border border-white/10 rounded-xl p-4 text-left text-xs">
                <div>
                  <span className="text-vj-admin-muted block">Hành khách:</span>
                  <span className="font-bold text-white text-sm">
                    {createdBookingResult.user_name || 'Khách hàng'}
                  </span>
                </div>
                <div>
                  <span className="text-vj-admin-muted block">Hành trình:</span>
                  <span className="font-bold text-white text-sm">
                    {createdBookingResult.from_code && createdBookingResult.to_code
                      ? `${createdBookingResult.from_code} ➔ ${createdBookingResult.to_code}`
                      : 'Chuyến bay'}
                  </span>
                </div>
                <div>
                  <span className="text-vj-admin-muted block">Tổng thanh toán:</span>
                  <span className="font-bold text-amber-400 text-sm">
                    {Number(createdBookingResult.total_price || 0).toLocaleString('vi-VN')} ₫
                  </span>
                </div>
                <div>
                  <span className="text-vj-admin-muted block">Trạng thái:</span>
                  <span
                    className={`inline-block font-bold text-xs px-2 py-0.5 rounded ${
                      createdBookingResult.status === 'confirmed'
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-amber-500/20 text-amber-400'
                    }`}
                  >
                    {createdBookingResult.status === 'confirmed' ? 'Đã xác nhận' : 'Giữ chỗ'}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                {onSendEmail && createdBookingResult.user_email && (
                  <button
                    type="button"
                    onClick={() => {
                      onSendEmail({
                        id: createdBookingResult.id,
                        userName: createdBookingResult.user_name || 'Khách hàng',
                        userEmail: createdBookingResult.user_email,
                        amount: createdBookingResult.total_price,
                      });
                    }}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs uppercase px-4 py-2.5 rounded-xl transition-all shadow-md"
                  >
                    <Icon name="EnvelopeIcon" size={16} />
                    Gửi email vé / Hoá đơn
                  </button>
                )}

                {onPrintInvoice && (
                  <button
                    type="button"
                    onClick={() => {
                      onPrintInvoice({
                        id: createdBookingResult.booking_code,
                        userName: createdBookingResult.user_name || 'Khách hàng',
                        flightNo: createdBookingResult.flight_no || 'VJ',
                        route: `${createdBookingResult.from_code || ''} → ${createdBookingResult.to_code || ''}`,
                        date: new Date().toLocaleDateString('vi-VN'),
                        seat: '—',
                        amount: createdBookingResult.total_price,
                        status:
                          (createdBookingResult.status as
                            | 'pending'
                            | 'confirmed'
                            | 'completed'
                            | 'cancelled'
                            | 'refunded') || 'confirmed',
                        payMethod: createdBookingResult.payment_method || 'Tiền mặt',
                        createdAt: new Date().toLocaleString('vi-VN'),
                      });
                    }}
                    className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white font-bold text-xs uppercase px-4 py-2.5 rounded-xl transition-all border border-white/10"
                  >
                    <Icon name="PrinterIcon" size={16} />
                    In vé / Hoá đơn
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setCreatedBookingResult(null);
                    setPassengers([
                      {
                        name: '',
                        gender: 'male',
                        passenger_type: 'adult',
                        dob: '',
                        id_number: '',
                        phone: '',
                        email: '',
                        seat_number: '',
                      },
                    ]);
                  }}
                  className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-900 font-black text-xs uppercase px-4 py-2.5 rounded-xl transition-all shadow-md"
                >
                  <Icon name="PlusIcon" size={16} />
                  Đặt tiếp vé khác
                </button>

                <button
                  type="button"
                  onClick={onClose}
                  className="bg-white/5 hover:bg-white/10 text-white font-bold text-xs uppercase px-4 py-2.5 rounded-xl transition-all border border-white/10"
                >
                  Hoàn tất & Đóng
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Block 1: Loại vé & Chọn chuyến bay */}
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4 sm:p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black uppercase text-amber-400 tracking-wider">
                      1. Hành trình bay
                    </span>
                    <div className="inline-flex rounded-lg bg-black/40 p-1 border border-white/10">
                      <button
                        type="button"
                        onClick={() => setIsRoundTrip(false)}
                        className={`text-xs font-bold px-3 py-1 rounded-md transition-all ${
                          !isRoundTrip
                            ? 'bg-amber-500 text-slate-900 shadow-sm'
                            : 'text-vj-admin-muted hover:text-white'
                        }`}
                      >
                        Một chiều (1 chiều)
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsRoundTrip(true)}
                        className={`text-xs font-bold px-3 py-1 rounded-md transition-all ${
                          isRoundTrip
                            ? 'bg-amber-500 text-slate-900 shadow-sm'
                            : 'text-vj-admin-muted hover:text-white'
                        }`}
                      >
                        Khứ hồi (2 chiều)
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowFlightPaste(!showFlightPaste)}
                    className="flex items-center gap-1.5 text-xs font-bold text-amber-300 hover:text-amber-200 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 px-3 py-1.5 rounded-lg transition-all"
                  >
                    <Icon name="DocumentTextIcon" size={14} />
                    <span>⚡ Dán nhanh lịch trình</span>
                  </button>
                </div>

                {/* Khung dán văn bản lịch trình */}
                {showFlightPaste && (
                  <div className="p-3.5 bg-black/60 border border-amber-500/30 rounded-xl space-y-2 animate-fadeIn">
                    <div className="flex items-center justify-between">
                      <label className="text-2xs font-black text-amber-400 uppercase tracking-wider">
                        Dán văn bản hành trình (VJ272, SGN-HAN, giờ bay...):
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowFlightPaste(false)}
                        className="text-vj-admin-muted hover:text-white text-xs"
                      >
                        Đóng
                      </button>
                    </div>
                    <textarea
                      rows={3}
                      value={flightPasteText}
                      onChange={(e) => setFlightPasteText(e.target.value)}
                      placeholder="VD: P Hồ Chí Minh (T1)Hải Phòng T.Tư 02/12 Vietjet Air VJ272 07:00 - 09:00 Máy bay: Airbus A321"
                      className="w-full bg-slate-950 border border-white/10 rounded-lg p-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 font-mono"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={handleApplyFlightPaste}
                        className="bg-amber-500 hover:bg-amber-400 text-slate-900 text-xs font-black uppercase px-3 py-1.5 rounded-lg transition-all"
                      >
                        Áp dụng & Tìm chuyến bay
                      </button>
                    </div>
                  </div>
                )}

                {/* Chọn chuyến bay đi */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                    <span>Chuyến bay đi (Outbound):</span>
                    {isLoadingFlights && (
                      <span className="text-amber-400 text-2xs">Đang tải...</span>
                    )}
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input
                      type="text"
                      placeholder="Lọc: VJ272, SGN, HAN..."
                      value={flightSearchQuery}
                      onChange={(e) => setFlightSearchQuery(e.target.value)}
                      className="bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
                    />
                    <select
                      value={selectedFlightId}
                      onChange={(e) => setSelectedFlightId(e.target.value)}
                      className="sm:col-span-2 bg-slate-950 border border-white/15 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
                    >
                      <option value="">-- Chọn chuyến bay đi --</option>
                      {filteredOutboundFlights.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.flight_no} · {f.from_code} ➔ {f.to_code} · {f.depart_time} (Còn{' '}
                          {f.available} chỗ) ·{' '}
                          {Number(f.economy_price || 0).toLocaleString('vi-VN')}₫
                        </option>
                      ))}
                    </select>
                  </div>

                  {outboundFlight && (
                    <div className="p-3 bg-white/5 border border-white/10 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-amber-400 text-sm">
                          {outboundFlight.flight_no}
                        </span>
                        <span className="text-white">
                          {outboundFlight.from_code} ➔ {outboundFlight.to_code}
                        </span>
                        <span className="text-vj-admin-muted">· {outboundFlight.depart_time}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-vj-admin-muted">
                          Chỗ trống:{' '}
                          <strong className="text-emerald-400">{outboundFlight.available}</strong>
                        </span>
                        <span className="text-vj-admin-muted">
                          Giá Eco:{' '}
                          <strong className="text-amber-400">
                            {Number(outboundFlight.economy_price || 0).toLocaleString('vi-VN')}₫
                          </strong>
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Chọn chuyến bay về (nếu khứ hồi) */}
                {isRoundTrip && (
                  <div className="space-y-2 pt-2 border-t border-white/10">
                    <label className="text-xs font-bold text-slate-300">
                      Chuyến bay về (Inbound - Khứ hồi):
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <input
                        type="text"
                        placeholder="Lọc chuyến về..."
                        value={returnSearchQuery}
                        onChange={(e) => setReturnSearchQuery(e.target.value)}
                        className="bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
                      />
                      <select
                        value={selectedReturnFlightId}
                        onChange={(e) => setSelectedReturnFlightId(e.target.value)}
                        className="sm:col-span-2 bg-slate-950 border border-white/15 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
                      >
                        <option value="">-- Chọn chuyến bay về --</option>
                        {filteredReturnFlights.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.flight_no} · {f.from_code} ➔ {f.to_code} · {f.depart_time} (Còn{' '}
                            {f.available} chỗ) ·{' '}
                            {Number(f.economy_price || 0).toLocaleString('vi-VN')}₫
                          </option>
                        ))}
                      </select>
                    </div>

                    {returnFlight && (
                      <div className="p-3 bg-white/5 border border-white/10 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-amber-400 text-sm">
                            {returnFlight.flight_no}
                          </span>
                          <span className="text-white">
                            {returnFlight.from_code} ➔ {returnFlight.to_code}
                          </span>
                          <span className="text-vj-admin-muted">· {returnFlight.depart_time}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-vj-admin-muted">
                            Chỗ trống:{' '}
                            <strong className="text-emerald-400">{returnFlight.available}</strong>
                          </span>
                          <span className="text-vj-admin-muted">
                            Giá Eco:{' '}
                            <strong className="text-amber-400">
                              {Number(returnFlight.economy_price || 0).toLocaleString('vi-VN')}₫
                            </strong>
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Hạng vé */}
                <div className="space-y-2 pt-2 border-t border-white/10">
                  <label className="text-xs font-bold text-slate-300">Hạng vé (Fare Class):</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { id: 'eco', label: 'Eco (Phổ thông)', desc: 'Tiết kiệm nhất' },
                      { id: 'deluxe', label: 'Deluxe', desc: 'Đổi ngày bay linh hoạt' },
                      { id: 'skyboss', label: 'SkyBoss', desc: 'Phòng chờ & Ưu tiên' },
                      { id: 'business', label: 'Business', desc: 'Thương gia sang trọng' },
                    ].map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() =>
                          setFareClass(f.id as 'eco' | 'deluxe' | 'skyboss' | 'business')
                        }
                        className={`p-3 rounded-xl border text-left transition-all ${
                          fareClass === f.id
                            ? 'bg-amber-500/15 border-amber-400 text-white'
                            : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10'
                        }`}
                      >
                        <div className="font-bold text-xs text-white">{f.label}</div>
                        <div className="text-2xs text-vj-admin-muted mt-0.5">{f.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Block 2: Danh sách Hành khách */}
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4 sm:p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black uppercase text-amber-400 tracking-wider">
                      2. Danh sách hành khách ({passengers.length})
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowPassengerPaste(!showPassengerPaste)}
                      className="flex items-center gap-1.5 text-xs font-bold text-amber-300 hover:text-amber-200 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 px-3 py-1.5 rounded-lg transition-all"
                    >
                      <Icon name="DocumentTextIcon" size={14} />
                      <span>⚡ Dán danh sách khách</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleAddPassenger}
                      className="flex items-center gap-1.5 text-xs font-bold text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 px-3 py-1.5 rounded-lg transition-all"
                    >
                      <Icon name="PlusIcon" size={14} />
                      <span>Thêm khách</span>
                    </button>
                  </div>
                </div>

                {/* Khung dán danh sách hành khách */}
                {showPassengerPaste && (
                  <div className="p-3.5 bg-black/60 border border-amber-500/30 rounded-xl space-y-2 animate-fadeIn">
                    <div className="flex items-center justify-between">
                      <label className="text-2xs font-black text-amber-400 uppercase tracking-wider">
                        Dán danh sách hành khách từ Zalo/Hotline:
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowPassengerPaste(false)}
                        className="text-vj-admin-muted hover:text-white text-xs"
                      >
                        Đóng
                      </button>
                    </div>
                    <textarea
                      rows={4}
                      value={passengerPasteText}
                      onChange={(e) => setPassengerPasteText(e.target.value)}
                      placeholder={`1. NGUYỄN VĂN AN - 0912345678 - 001200001111 - Nam - 15/05/1990\n2. TRẦN THỊ BÌNH - 0987654321 - Nữ\n3. NGUYỄN VĂN CẢNH (Trẻ em)`}
                      className="w-full bg-slate-950 border border-white/10 rounded-lg p-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 font-mono"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={handleApplyPassengerPaste}
                        className="bg-amber-500 hover:bg-amber-400 text-slate-900 text-xs font-black uppercase px-3 py-1.5 rounded-lg transition-all"
                      >
                        Bóc tách & Điền vào form
                      </button>
                    </div>
                  </div>
                )}

                {/* Bảng nhập hành khách */}
                <div className="space-y-3">
                  {passengers.map((p, idx) => (
                    <div
                      key={idx}
                      className="p-3.5 bg-black/40 border border-white/10 rounded-xl space-y-3 text-xs relative"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-amber-400">Hành khách #{idx + 1}</span>
                        {passengers.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemovePassenger(idx)}
                            className="text-red-400 hover:text-red-300 p-1 transition-colors"
                            title="Xóa hành khách này"
                          >
                            <Icon name="TrashIcon" size={14} />
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                        <div className="sm:col-span-2 space-y-1">
                          <label className="text-2xs text-vj-admin-muted font-bold uppercase">
                            Họ và tên *
                          </label>
                          <input
                            type="text"
                            placeholder="NGUYEN VAN A"
                            value={p.name}
                            onChange={(e) =>
                              handleUpdatePassenger(idx, 'name', e.target.value.toUpperCase())
                            }
                            className="w-full bg-slate-950 border border-white/15 rounded-lg px-3 py-1.5 text-xs text-white font-bold placeholder-slate-600 focus:outline-none focus:border-amber-400"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-2xs text-vj-admin-muted font-bold uppercase">
                            Loại khách
                          </label>
                          <select
                            value={p.passenger_type}
                            onChange={(e) =>
                              handleUpdatePassenger(idx, 'passenger_type', e.target.value)
                            }
                            className="w-full bg-slate-950 border border-white/15 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-400"
                          >
                            <option value="adult">Người lớn (≥12t)</option>
                            <option value="child">Trẻ em (2-11t)</option>
                            <option value="infant">Em bé (&lt;2t)</option>
                          </select>
                        </div>

                        <div className="space-y-1">
                          <label className="text-2xs text-vj-admin-muted font-bold uppercase">
                            Giới tính
                          </label>
                          <select
                            value={p.gender}
                            onChange={(e) => handleUpdatePassenger(idx, 'gender', e.target.value)}
                            className="w-full bg-slate-950 border border-white/15 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-400"
                          >
                            <option value="male">Nam</option>
                            <option value="female">Nữ</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                        <div className="space-y-1">
                          <label className="text-2xs text-vj-admin-muted font-bold uppercase">
                            Ngày sinh
                          </label>
                          <input
                            type="text"
                            placeholder="YYYY-MM-DD"
                            value={p.dob || ''}
                            onChange={(e) => handleUpdatePassenger(idx, 'dob', e.target.value)}
                            className="w-full bg-slate-950 border border-white/15 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-amber-400"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-2xs text-vj-admin-muted font-bold uppercase">
                            CCCD / Hộ chiếu
                          </label>
                          <input
                            type="text"
                            placeholder="00120000xxxx"
                            value={p.id_number || ''}
                            onChange={(e) =>
                              handleUpdatePassenger(idx, 'id_number', e.target.value)
                            }
                            className="w-full bg-slate-950 border border-white/15 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-amber-400"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-2xs text-vj-admin-muted font-bold uppercase">
                            Số điện thoại
                          </label>
                          <input
                            type="text"
                            placeholder="0912xxxxxx"
                            value={p.phone || ''}
                            onChange={(e) => handleUpdatePassenger(idx, 'phone', e.target.value)}
                            className="w-full bg-slate-950 border border-white/15 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-amber-400"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-2xs text-vj-admin-muted font-bold uppercase">
                            Ghế ngồi (nếu có)
                          </label>
                          <input
                            type="text"
                            placeholder="VD: 12A"
                            value={p.seat_number || ''}
                            onChange={(e) =>
                              handleUpdatePassenger(
                                idx,
                                'seat_number',
                                e.target.value.toUpperCase()
                              )
                            }
                            className="w-full bg-slate-950 border border-white/15 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-amber-400"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Block 3: Thông tin liên hệ & Người đặt */}
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4 sm:p-5 space-y-4">
                <span className="text-xs font-black uppercase text-amber-400 tracking-wider">
                  3. Thông tin người đặt / Đại lý liên hệ
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-2xs text-vj-admin-muted font-bold uppercase">
                      Họ tên người liên hệ
                    </label>
                    <input
                      type="text"
                      placeholder={passengers[0]?.name || 'Khách liên hệ'}
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                      className="w-full bg-slate-950 border border-white/15 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-2xs text-vj-admin-muted font-bold uppercase">
                      Số điện thoại nhận tin
                    </label>
                    <input
                      type="text"
                      placeholder="0912xxxxxx"
                      value={contactPhone}
                      onChange={(e) => setContactPhone(e.target.value)}
                      className="w-full bg-slate-950 border border-white/15 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-2xs text-vj-admin-muted font-bold uppercase">
                      Email nhận vé điện tử
                    </label>
                    <input
                      type="email"
                      placeholder="email@example.com"
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                      className="w-full bg-slate-950 border border-white/15 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
                    />
                  </div>
                </div>
              </div>

              {/* Block 4: Chi phí & Thanh toán */}
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4 sm:p-5 space-y-4">
                <span className="text-xs font-black uppercase text-amber-400 tracking-wider">
                  4. Thanh toán & Trạng thái đơn vé
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Trạng thái đơn */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-300">Trạng thái đơn vé:</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setBookingStatus('confirmed')}
                        className={`p-3 rounded-xl border text-left transition-all ${
                          bookingStatus === 'confirmed'
                            ? 'bg-emerald-500/15 border-emerald-400 text-white'
                            : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10'
                        }`}
                      >
                        <div className="font-bold text-xs text-emerald-400">
                          Xác nhận ngay (Confirmed)
                        </div>
                        <div className="text-2xs text-vj-admin-muted mt-0.5">
                          Xuất vé & Lưu thanh toán
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setBookingStatus('pending')}
                        className={`p-3 rounded-xl border text-left transition-all ${
                          bookingStatus === 'pending'
                            ? 'bg-amber-500/15 border-amber-400 text-white'
                            : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10'
                        }`}
                      >
                        <div className="font-bold text-xs text-amber-400">Giữ chỗ (Pending)</div>
                        <div className="text-2xs text-vj-admin-muted mt-0.5">
                          Chờ khách thanh toán
                        </div>
                      </button>
                    </div>
                  </div>

                  {/* Phương thức thanh toán */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-300">
                      Phương thức thanh toán:
                    </label>
                    <select
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                      className="w-full bg-slate-950 border border-white/15 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-amber-400"
                    >
                      <option value="cash">Tiền mặt tại phòng vé / quầy</option>
                      <option value="bank">Chuyển khoản ngân hàng</option>
                      <option value="vietqr">VietQR Pay</option>
                      <option value="agency">Trừ công nợ đại lý</option>
                      <option value="vnpay">Cổng thẻ / VNPay</option>
                    </select>
                  </div>
                </div>

                {/* Tuỳ chọn giá vé & Gửi email */}
                <div className="p-3.5 bg-black/40 border border-white/10 rounded-xl space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="customPriceToggle"
                        checked={isCustomPrice}
                        onChange={(e) => {
                          setIsCustomPrice(e.target.checked);
                          if (e.target.checked && customPrice <= 0) {
                            setCustomPrice(calculatedTotal);
                          }
                        }}
                        className="rounded border-white/20 bg-slate-900 text-amber-500 focus:ring-0 cursor-pointer"
                      />
                      <label
                        htmlFor="customPriceToggle"
                        className="text-xs font-bold text-slate-200 cursor-pointer"
                      >
                        Ghi đè giá thực thu (Custom Price cho Đại lý/Khuyến mại)
                      </label>
                    </div>

                    {isCustomPrice ? (
                      <div className="flex items-center gap-2">
                        <span className="text-2xs text-vj-admin-muted">Nhập số tiền:</span>
                        <input
                          type="number"
                          step={10000}
                          min={0}
                          value={customPrice}
                          onChange={(e) => setCustomPrice(Math.max(0, Number(e.target.value)))}
                          className="w-36 bg-slate-950 border border-amber-400 rounded-lg px-2.5 py-1 text-xs text-amber-400 font-bold focus:outline-none"
                        />
                        <span className="text-xs text-amber-400 font-bold">₫</span>
                      </div>
                    ) : (
                      <div className="text-xs text-vj-admin-muted">
                        Giá hệ thống tự tính:{' '}
                        <span className="font-bold text-amber-400">
                          {calculatedTotal.toLocaleString('vi-VN')} ₫
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-white/5">
                    <input
                      type="checkbox"
                      id="sendEmailToggle"
                      checked={sendEmail}
                      onChange={(e) => setSendEmail(e.target.checked)}
                      className="rounded border-white/20 bg-slate-900 text-amber-500 focus:ring-0 cursor-pointer"
                    />
                    <label
                      htmlFor="sendEmailToggle"
                      className="text-xs text-slate-300 cursor-pointer"
                    >
                      Tự động gửi email hoá đơn & vé điện tử cho khách khi hoàn tất đơn
                    </label>
                  </div>
                </div>

                {/* Ghi chú */}
                <div className="space-y-1">
                  <label className="text-2xs text-vj-admin-muted font-bold uppercase">
                    Ghi chú nội bộ / Ghi chú đơn vé:
                  </label>
                  <input
                    type="text"
                    placeholder="VD: Đặt vé qua hotline đại lý cấp 2, giữ chỗ đến 18:00..."
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className="w-full bg-slate-950 border border-white/15 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-amber-400"
                  />
                </div>
              </div>
            </>
          )}
        </div>

        {/* Modal Footer */}
        {!createdBookingResult && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 sm:p-5 border-t border-white/10 bg-slate-900/90">
            <div className="flex items-center gap-3">
              <span className="text-xs text-vj-admin-muted uppercase tracking-wider">
                Tổng cộng:
              </span>
              <span className="text-xl sm:text-2xl font-black text-amber-400">
                {(isCustomPrice ? customPrice : calculatedTotal).toLocaleString('vi-VN')} ₫
              </span>
              <span className="text-2xs text-vj-admin-muted">
                ({passengers.length} khách · {isRoundTrip ? 'Khứ hồi' : '1 chiều'})
              </span>
            </div>

            <div className="flex items-center gap-2 justify-end">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 transition-colors"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleSubmitBooking}
                disabled={isSubmitting || !selectedFlightId}
                className="flex items-center gap-2 bg-gradient-to-r from-red-600 to-amber-500 hover:from-red-500 hover:to-amber-400 text-white font-black text-xs uppercase px-5 py-2.5 rounded-xl shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:translate-y-[-1px] active:scale-98"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Đang xử lý...</span>
                  </>
                ) : (
                  <>
                    <Icon name="BoltIcon" size={16} />
                    <span>Xác nhận đặt vé ⚡</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
