'use client';
import React, { useState, useMemo } from 'react';
import { Icon } from '@/shared/components/ui';
import { AIRPORT_CITIES } from '@/shared/constants';
import { AIRCRAFT_MODELS } from '@/features/flights/constants';
import { createBatchAdminFlights, type AdminFlight } from '@/features/admin';
import { getApiErrorMessage } from '@/shared/services';

interface ToastAPI {
  success: (title: string, message?: string, options?: object) => void;
  error: (title: string, message?: string, options?: object) => void;
  warning?: (title: string, message?: string, options?: object) => void;
  info?: (title: string, message?: string, options?: object) => void;
}

interface QuickFlightBatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  onToast?: ToastAPI;
}

const AIRPORTS = Object.entries(AIRPORT_CITIES).map(([code, city]) => ({ code, city }));
const FARE_LADDER_RATIO = 2.77;

const QUICK_ECO_PRESETS = [
  { label: '0đ (KM)', value: 0 },
  { label: '299k', value: 299000 },
  { label: '499k', value: 499000 },
  { label: '699k', value: 699000 },
  { label: '899k', value: 899000 },
  { label: '1.199k', value: 1199000 },
  { label: '1.499k', value: 1499000 },
];

const DAYS_OF_WEEK = [
  { id: 1, label: 'T2' },
  { id: 2, label: 'T3' },
  { id: 3, label: 'T4' },
  { id: 4, label: 'T5' },
  { id: 5, label: 'T6' },
  { id: 6, label: 'T7' },
  { id: 0, label: 'CN' },
];

function formatDateISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function QuickFlightBatchModal({
  isOpen,
  onClose,
  onSuccess,
  onToast,
}: QuickFlightBatchModalProps) {
  const [activeTab, setActiveTab] = useState<'route' | 'csv'>('route');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ─── Mode 1: Route & Schedule Generator State ─────────────────────────────
  const tomorrow = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d;
  }, []);
  const nextWeek = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d;
  }, []);

  const [fromCode, setFromCode] = useState('SGN');
  const [toCode, setToCode] = useState('HAN');
  const [isRoundTrip, setIsRoundTrip] = useState(true);

  const [outboundFlightNo, setOutboundFlightNo] = useState('VJ 120');
  const [returnFlightNo, setReturnFlightNo] = useState('VJ 121');
  const [aircraft, setAircraft] = useState('Airbus A321');
  const [capacity] = useState(180);

  const [durationHours, setDurationHours] = useState(2);
  const [durationMinutes, setDurationMinutes] = useState(15);

  const [timeSlots, setTimeSlots] = useState<string[]>(['07:00', '14:30']);
  const [newTimeInput, setNewTimeInput] = useState('19:00');

  const [startDate, setStartDate] = useState(formatDateISO(tomorrow));
  const [endDate, setEndDate] = useState(formatDateISO(nextWeek));
  const [selectedDays, setSelectedDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);

  const [economyPrice, setEconomyPrice] = useState<number>(499000);
  const [businessPrice, setBusinessPrice] = useState<number>(1382000);

  // ─── Mode 2: CSV / Text Paste State ───────────────────────────────────────
  const [csvContent, setCsvContent] = useState('');

  // Swap route
  const handleSwapRoute = () => {
    const temp = fromCode;
    setFromCode(toCode);
    setToCode(temp);
  };

  // Quick Eco Price
  const handleEcoChange = (val: number) => {
    const eco = Math.max(0, val);
    setEconomyPrice(eco);
    setBusinessPrice(Math.round(eco * FARE_LADDER_RATIO));
  };

  // Add time slot
  const handleAddTimeSlot = () => {
    if (!newTimeInput) return;
    if (!timeSlots.includes(newTimeInput)) {
      setTimeSlots([...timeSlots, newTimeInput].sort());
    }
  };

  const handleRemoveTimeSlot = (time: string) => {
    if (timeSlots.length <= 1) {
      onToast?.error('Lỗi giờ bay', 'Cần ít nhất một khung giờ bay.');
      return;
    }
    setTimeSlots(timeSlots.filter((t) => t !== time));
  };

  // Toggle Day
  const handleToggleDay = (dayId: number) => {
    if (selectedDays.includes(dayId)) {
      if (selectedDays.length === 1) return;
      setSelectedDays(selectedDays.filter((d) => d !== dayId));
    } else {
      setSelectedDays([...selectedDays, dayId]);
    }
  };

  // Quick range helper
  const handleSetDateRange = (days: number) => {
    const start = new Date(startDate);
    const end = new Date(start);
    end.setDate(start.getDate() + days - 1);
    setEndDate(formatDateISO(end));
  };

  // Calculate generated flights preview
  const generatedFlights = useMemo(() => {
    if (activeTab !== 'route') return [];
    if (!fromCode || !toCode || fromCode === toCode) return [];
    if (!startDate || !endDate) return [];

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (start > end) return [];

    const list: Array<Partial<AdminFlight>> = [];
    const cur = new Date(start);

    // Limit to prevent runaway iteration
    let loopCount = 0;
    while (cur <= end && loopCount < 180) {
      loopCount++;
      const dayOfWeek = cur.getDay(); // 0 is Sunday, 1 is Monday...

      if (selectedDays.includes(dayOfWeek)) {
        for (let i = 0; i < timeSlots.length; i++) {
          const t = timeSlots[i];
          const [hStr, mStr] = t.split(':');
          const depH = parseInt(hStr, 10);
          const depM = parseInt(mStr, 10);

          // Outbound
          const depDate = new Date(cur);
          depDate.setHours(depH, depM, 0, 0);

          const arrDate = new Date(depDate);
          arrDate.setHours(
            arrDate.getHours() + durationHours,
            arrDate.getMinutes() + durationMinutes
          );

          list.push({
            flight_no: outboundFlightNo,
            from_code: fromCode,
            to_code: toCode,
            depart_time: depDate.toISOString(),
            arrive_time: arrDate.toISOString(),
            economy_price: economyPrice,
            business_price: businessPrice,
            price: economyPrice,
            class: 'economy',
            available: capacity,
            aircraft,
          });

          // Return flight if selected
          if (isRoundTrip) {
            // Return departs ~1h15m after arrival
            const retDepDate = new Date(arrDate);
            retDepDate.setMinutes(retDepDate.getMinutes() + 75);

            const retArrDate = new Date(retDepDate);
            retArrDate.setHours(
              retArrDate.getHours() + durationHours,
              retArrDate.getMinutes() + durationMinutes
            );

            list.push({
              flight_no: returnFlightNo,
              from_code: toCode,
              to_code: fromCode,
              depart_time: retDepDate.toISOString(),
              arrive_time: retArrDate.toISOString(),
              economy_price: economyPrice,
              business_price: businessPrice,
              price: economyPrice,
              class: 'economy',
              available: capacity,
              aircraft,
            });
          }
        }
      }

      cur.setDate(cur.getDate() + 1);
    }

    return list;
  }, [
    activeTab,
    fromCode,
    toCode,
    isRoundTrip,
    startDate,
    endDate,
    selectedDays,
    timeSlots,
    durationHours,
    durationMinutes,
    outboundFlightNo,
    returnFlightNo,
    economyPrice,
    businessPrice,
    capacity,
    aircraft,
  ]);

  // Parse CSV Preview
  const parsedCsvFlights = useMemo(() => {
    if (activeTab !== 'csv' || !csvContent.trim()) return [];
    const lines = csvContent.trim().split('\n');
    const result: Array<Partial<AdminFlight> & { parseError?: string }> = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith('#')) continue;

      const parts = line.split(',').map((p) => p.trim());
      // Expecting: flight_no, from, to, date, dep_time, arr_time, eco_price, biz_price, capacity, aircraft
      if (parts.length < 5) {
        result.push({
          flight_no: `Dòng ${i + 1}`,
          parseError: 'Thiếu cột (Cần tối thiểu: Số hiệu, Điểm đi, Điểm đến, Ngày bay, Giờ đi)',
        });
        continue;
      }

      const fNo = parts[0];
      const from = parts[1]?.toUpperCase();
      const to = parts[2]?.toUpperCase();
      const dateStr = parts[3];
      const depTime = parts[4];
      const arrTime = parts[5] || '10:00';
      const eco = parts[6] ? parseInt(parts[6], 10) : 499000;
      const biz = parts[7] ? parseInt(parts[7], 10) : Math.round(eco * FARE_LADDER_RATIO);
      const cap = parts[8] ? parseInt(parts[8], 10) : 180;
      const ac = parts[9] || 'Airbus A321';

      try {
        const depD = new Date(`${dateStr}T${depTime}:00+07:00`);
        const arrD = new Date(`${dateStr}T${arrTime}:00+07:00`);

        result.push({
          flight_no: fNo,
          from_code: from,
          to_code: to,
          depart_time: depD.toISOString(),
          arrive_time: arrD.toISOString(),
          economy_price: eco,
          business_price: biz,
          price: eco,
          class: 'economy',
          available: cap,
          aircraft: ac,
        });
      } catch {
        result.push({
          flight_no: fNo,
          parseError: 'Định dạng ngày/giờ không hợp lệ',
        });
      }
    }
    return result;
  }, [activeTab, csvContent]);

  // Load sample CSV
  const handleLoadSampleCsv = () => {
    const d1 = formatDateISO(tomorrow);
    const d2 = formatDateISO(nextWeek);
    const sample = `# Cú pháp: Số hiệu, Điểm đi, Điểm đến, Ngày bay (YYYY-MM-DD), Giờ đi (HH:mm), Giờ đến (HH:mm), Giá Eco, Giá SkyBoss, Ghế, Máy bay
VJ 120, SGN, HAN, ${d1}, 07:00, 09:15, 599000, 1699000, 180, Airbus A321
VJ 121, HAN, SGN, ${d1}, 10:30, 12:45, 599000, 1699000, 180, Airbus A321
VJ 128, SGN, HAN, ${d1}, 15:00, 17:15, 699000, 1899000, 180, Airbus A321neo
VJ 129, HAN, SGN, ${d1}, 18:30, 20:45, 699000, 1899000, 180, Airbus A321neo
VJ 301, SGN, DAD, ${d2}, 08:30, 09:50, 499000, 1380000, 180, Airbus A320
VJ 302, DAD, SGN, ${d2}, 11:15, 12:35, 499000, 1380000, 180, Airbus A320`;
    setCsvContent(sample);
  };

  // Submit batch
  const handleSubmit = async () => {
    const flightsToSubmit =
      activeTab === 'route' ? generatedFlights : parsedCsvFlights.filter((f) => !f.parseError);

    if (flightsToSubmit.length === 0) {
      onToast?.error('Danh sách trống', 'Không có chuyến bay hợp lệ nào để tạo.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await createBatchAdminFlights(flightsToSubmit);

      if (res.success) {
        onToast?.success(
          'Nhập chuyến bay thành công',
          `Đã tạo ${res.createdCount} chuyến bay mới${
            res.skippedCount > 0 ? ` (bỏ qua ${res.skippedCount} chuyến trùng lịch)` : ''
          }.`
        );
        onSuccess?.();
        onClose();
      } else {
        onToast?.error('Lỗi nhập chuyến bay', res.message || 'Vui lòng kiểm tra lại.');
      }
    } catch (err) {
      onToast?.error(
        'Lỗi hệ thống',
        getApiErrorMessage(err, 'Không thể tạo chuyến bay hàng loạt.')
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-3xl text-white flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <Icon name="PaperAirplaneIcon" size={22} />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">
                Nhập chặng bay & chuyến bay nhanh ⚡
              </h3>
              <p className="text-xs text-vj-admin-muted mt-0.5">
                Khởi tạo lịch bay hàng loạt theo chặng khứ hồi hoặc dán danh sách nhanh
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-white flex items-center justify-center transition-colors"
          >
            <Icon name="XMarkIcon" size={16} />
          </button>
        </div>

        {/* Tab switch */}
        <div className="flex border-b border-white/10 px-5 pt-3 bg-slate-950/40">
          <button
            type="button"
            onClick={() => setActiveTab('route')}
            className={`pb-3 px-4 text-xs font-bold transition-all border-b-2 flex items-center gap-2 ${
              activeTab === 'route'
                ? 'border-emerald-400 text-emerald-400'
                : 'border-transparent text-vj-admin-muted hover:text-white'
            }`}
          >
            <Icon name="AirplaneIcon" size={14} />
            Tạo theo Chặng bay & Lịch bay
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('csv')}
            className={`pb-3 px-4 text-xs font-bold transition-all border-b-2 flex items-center gap-2 ${
              activeTab === 'csv'
                ? 'border-emerald-400 text-emerald-400'
                : 'border-transparent text-vj-admin-muted hover:text-white'
            }`}
          >
            <Icon name="DocumentTextIcon" size={14} />
            Dán danh sách nhanh (Paste CSV / Bảng)
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-5 overflow-y-auto">
          {activeTab === 'route' ? (
            <div className="space-y-4">
              {/* Chặng bay & Khứ hồi */}
              <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-emerald-400 uppercase tracking-wider">
                    1. Chọn Chặng bay (Route)
                  </span>
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-white/90">
                    <input
                      type="checkbox"
                      checked={isRoundTrip}
                      onChange={(e) => setIsRoundTrip(e.target.checked)}
                      className="rounded border-white/20 text-emerald-500 focus:ring-emerald-500 bg-slate-900"
                    />
                    <span>Tự động tạo cả 2 chiều (Khứ hồi)</span>
                  </label>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-[1fr,auto,1fr] gap-3 items-center">
                  <div>
                    <label className="block text-3xs font-bold text-vj-admin-muted uppercase mb-1">
                      Điểm đi (Origin)
                    </label>
                    <select
                      value={fromCode}
                      onChange={(e) => setFromCode(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-white/15 rounded-xl text-sm font-bold text-white focus:outline-none focus:border-emerald-400"
                    >
                      {AIRPORTS.map((a) => (
                        <option key={a.code} value={a.code}>
                          {a.code} — {a.city}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex justify-center pt-4 md:pt-3">
                    <button
                      type="button"
                      onClick={handleSwapRoute}
                      className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-emerald-400 flex items-center justify-center transition-colors"
                      title="Đảo chiều chặng bay"
                    >
                      ⇄
                    </button>
                  </div>

                  <div>
                    <label className="block text-3xs font-bold text-vj-admin-muted uppercase mb-1">
                      Điểm đến (Destination)
                    </label>
                    <select
                      value={toCode}
                      onChange={(e) => setToCode(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-white/15 rounded-xl text-sm font-bold text-white focus:outline-none focus:border-emerald-400"
                    >
                      {AIRPORTS.map((a) => (
                        <option key={a.code} value={a.code}>
                          {a.code} — {a.city}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Thông tin chuyến bay & Tàu bay */}
              <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
                <span className="text-xs font-black text-emerald-400 uppercase tracking-wider block">
                  2. Thiết lập Chuyến bay & Tàu bay
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-3xs font-bold text-vj-admin-muted uppercase mb-1">
                      Số hiệu chiều đi
                    </label>
                    <input
                      type="text"
                      value={outboundFlightNo}
                      onChange={(e) => setOutboundFlightNo(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-white/15 rounded-xl text-sm font-bold text-white focus:outline-none focus:border-emerald-400"
                      placeholder="VJ 120"
                    />
                  </div>

                  {isRoundTrip && (
                    <div>
                      <label className="block text-3xs font-bold text-vj-admin-muted uppercase mb-1">
                        Số hiệu chiều về
                      </label>
                      <input
                        type="text"
                        value={returnFlightNo}
                        onChange={(e) => setReturnFlightNo(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-950 border border-white/15 rounded-xl text-sm font-bold text-white focus:outline-none focus:border-emerald-400"
                        placeholder="VJ 121"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-3xs font-bold text-vj-admin-muted uppercase mb-1">
                      Loại máy bay
                    </label>
                    <select
                      value={aircraft}
                      onChange={(e) => setAircraft(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-white/15 rounded-xl text-xs font-semibold text-white focus:outline-none focus:border-emerald-400"
                    >
                      {Object.values(AIRCRAFT_MODELS).map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-3xs font-bold text-vj-admin-muted uppercase mb-1">
                      Thời lượng bay
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min={0}
                        max={15}
                        value={durationHours}
                        onChange={(e) => setDurationHours(parseInt(e.target.value, 10) || 0)}
                        className="w-12 px-2 py-2 bg-slate-950 border border-white/15 rounded-xl text-xs text-center font-bold text-white"
                      />
                      <span className="text-3xs text-vj-admin-muted">h</span>
                      <input
                        type="number"
                        min={0}
                        max={59}
                        step={5}
                        value={durationMinutes}
                        onChange={(e) => setDurationMinutes(parseInt(e.target.value, 10) || 0)}
                        className="w-12 px-2 py-2 bg-slate-950 border border-white/15 rounded-xl text-xs text-center font-bold text-white"
                      />
                      <span className="text-3xs text-vj-admin-muted">m</span>
                    </div>
                  </div>
                </div>

                {/* Khung giờ bay trong ngày */}
                <div className="pt-2 border-t border-white/10">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-3xs font-bold text-vj-admin-muted uppercase">
                      Các khung giờ cất cánh trong ngày ({timeSlots.length} khung giờ):
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="time"
                        value={newTimeInput}
                        onChange={(e) => setNewTimeInput(e.target.value)}
                        className="px-2 py-1 bg-slate-950 border border-white/15 rounded-lg text-xs text-white"
                      />
                      <button
                        type="button"
                        onClick={handleAddTimeSlot}
                        className="px-2.5 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 rounded-lg text-xs font-bold transition-colors"
                      >
                        + Thêm giờ
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {timeSlots.map((time) => (
                      <span
                        key={time}
                        className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-950 border border-white/15 rounded-lg text-xs font-bold text-emerald-300"
                      >
                        <span>{time}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveTimeSlot(time)}
                          className="hover:text-rose-400 transition-colors"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Dải ngày bay & Ngày trong tuần */}
              <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-emerald-400 uppercase tracking-wider">
                    3. Lập lịch ngày bay
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleSetDateRange(3)}
                      className="px-2 py-0.5 rounded text-3xs font-semibold bg-white/10 hover:bg-white/20 text-white"
                    >
                      3 ngày
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetDateRange(7)}
                      className="px-2 py-0.5 rounded text-3xs font-semibold bg-white/10 hover:bg-white/20 text-white"
                    >
                      7 ngày
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetDateRange(14)}
                      className="px-2 py-0.5 rounded text-3xs font-semibold bg-white/10 hover:bg-white/20 text-white"
                    >
                      14 ngày
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetDateRange(30)}
                      className="px-2 py-0.5 rounded text-3xs font-semibold bg-white/10 hover:bg-white/20 text-white"
                    >
                      30 ngày
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-3xs font-bold text-vj-admin-muted uppercase mb-1">
                      Từ ngày
                    </label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-white/15 rounded-xl text-xs font-bold text-white focus:outline-none focus:border-emerald-400"
                    />
                  </div>
                  <div>
                    <label className="block text-3xs font-bold text-vj-admin-muted uppercase mb-1">
                      Đến ngày
                    </label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-white/15 rounded-xl text-xs font-bold text-white focus:outline-none focus:border-emerald-400"
                    />
                  </div>
                </div>

                {/* Thứ trong tuần */}
                <div>
                  <label className="block text-3xs font-bold text-vj-admin-muted uppercase mb-1.5">
                    Lặp lại các ngày trong tuần:
                  </label>
                  <div className="flex gap-2">
                    {DAYS_OF_WEEK.map((day) => {
                      const isSelected = selectedDays.includes(day.id);
                      return (
                        <button
                          key={day.id}
                          type="button"
                          onClick={() => handleToggleDay(day.id)}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-black transition-all ${
                            isSelected
                              ? 'bg-emerald-500 text-slate-950 shadow-vj-sm'
                              : 'bg-slate-950 border border-white/15 text-white/50 hover:text-white'
                          }`}
                        >
                          {day.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Nhập giá vé nhanh cho chặng */}
              <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-amber-400 uppercase tracking-wider">
                    4. Nhập giá vé nhanh cho chặng
                  </span>
                  <span className="text-xs font-bold text-white">
                    Eco: {economyPrice.toLocaleString('vi-VN')}₫ | Biz:{' '}
                    {businessPrice.toLocaleString('vi-VN')}₫
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-3xs font-bold text-vj-admin-muted uppercase mb-1">
                      Giá vé Phổ thông (Eco)
                    </label>
                    <input
                      type="number"
                      step={1000}
                      value={economyPrice}
                      onChange={(e) => handleEcoChange(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-slate-950 border border-white/15 rounded-xl text-sm font-bold text-white focus:outline-none focus:border-amber-400"
                    />
                  </div>
                  <div>
                    <label className="block text-3xs font-bold text-vj-admin-muted uppercase mb-1">
                      Giá vé Thương gia (SkyBoss)
                    </label>
                    <input
                      type="number"
                      step={1000}
                      value={businessPrice}
                      onChange={(e) => setBusinessPrice(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-slate-950 border border-white/15 rounded-xl text-sm font-bold text-white focus:outline-none focus:border-amber-400"
                    />
                  </div>
                </div>

                {/* Gợi ý giá nhanh */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {QUICK_ECO_PRESETS.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => handleEcoChange(p.value)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                        economyPrice === p.value
                          ? 'bg-amber-500 text-slate-950'
                          : 'bg-slate-950 border border-white/15 text-white/80 hover:text-white'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tóm tắt xem trước */}
              <div className="bg-emerald-950/40 border border-emerald-500/20 rounded-xl p-3 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <Icon name="CheckCircleIcon" size={18} className="text-emerald-400" />
                  <span>
                    Tổng cộng sẽ tạo{' '}
                    <strong className="text-emerald-400 font-black text-sm">
                      {generatedFlights.length}
                    </strong>{' '}
                    chuyến bay ({fromCode} ⇄ {toCode})
                  </span>
                </div>
                <span className="text-3xs text-vj-admin-muted font-semibold">
                  {timeSlots.length} chuyến/ngày × {selectedDays.length} ngày/tuần
                </span>
              </div>
            </div>
          ) : (
            /* Mode 2: CSV / Text */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-vj-admin-muted">
                  Dán nội dung bảng (Mỗi dòng một chuyến bay, ngăn cách bằng dấu phẩy):
                </span>
                <button
                  type="button"
                  onClick={handleLoadSampleCsv}
                  className="px-3 py-1 bg-white/10 hover:bg-white/20 text-emerald-400 rounded-lg text-xs font-bold transition-colors"
                >
                  Dán dữ liệu mẫu 📋
                </button>
              </div>

              <textarea
                rows={8}
                value={csvContent}
                onChange={(e) => setCsvContent(e.target.value)}
                placeholder="VJ 120, SGN, HAN, 2026-11-25, 08:00, 10:15, 699000, 1899000, 180, Airbus A321..."
                className="w-full p-3.5 bg-slate-950 border border-white/15 rounded-xl font-mono text-xs text-white focus:outline-none focus:border-emerald-400 leading-relaxed"
              />

              {parsedCsvFlights.length > 0 && (
                <div className="bg-slate-950 border border-white/10 rounded-xl p-3 max-h-48 overflow-y-auto">
                  <div className="text-3xs font-bold text-vj-admin-muted uppercase tracking-wider mb-2">
                    Xem trước kết quả phân tích ({parsedCsvFlights.length} dòng):
                  </div>
                  <div className="space-y-1.5 text-xs font-mono">
                    {parsedCsvFlights.map((item, idx) => (
                      <div
                        key={idx}
                        className={`flex items-center justify-between p-1.5 rounded ${
                          item.parseError
                            ? 'bg-rose-500/20 text-rose-300'
                            : 'bg-white/5 text-white/90'
                        }`}
                      >
                        <span>
                          {item.flight_no} · {item.from_code} → {item.to_code}
                        </span>
                        {item.parseError ? (
                          <span className="text-3xs font-bold text-rose-400">
                            {item.parseError}
                          </span>
                        ) : (
                          <span className="text-3xs text-emerald-400 font-bold">
                            Eco {item.economy_price?.toLocaleString('vi-VN')}₫
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-5 border-t border-white/10 bg-slate-950/50">
          <div className="text-xs text-vj-admin-muted">
            {activeTab === 'route' ? (
              <span>
                Sẵn sàng tạo <strong>{generatedFlights.length}</strong> chuyến bay
              </span>
            ) : (
              <span>
                Hợp lệ: <strong>{parsedCsvFlights.filter((f) => !f.parseError).length}</strong>{' '}
                chuyến
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-xs font-bold text-white transition-colors disabled:opacity-50"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={
                isSubmitting ||
                (activeTab === 'route'
                  ? generatedFlights.length === 0
                  : parsedCsvFlights.filter((f) => !f.parseError).length === 0)
              }
              className="px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black tracking-wider uppercase flex items-center gap-2 shadow-vj-sm transition-all disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  <span>Đang khởi tạo...</span>
                </>
              ) : (
                <>
                  <Icon name="CheckIcon" size={14} />
                  <span>Tạo hàng loạt chuyến bay ⚡</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
