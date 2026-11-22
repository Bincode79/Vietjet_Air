'use client';

import React, { useState } from 'react';
import { getAirportCity } from '@/features/flights';
import { resolveAircraft } from '@/features/flights/services';

export interface FlightSummaryItem {
  flight_no?: string;
  from_code: string;
  to_code: string;
  depart_time: string;
  arrive_time: string;
  price?: number;
  class?: string;
}

export interface FlightSummaryCardProps {
  flight: FlightSummaryItem | null;
  returnFlight?: FlightSummaryItem | null;
  paxCount?: number;
  totalPrice?: number;
  bookingCode?: string;
  title?: string;
  className?: string;
}

const AIRPORT_FULL_NAMES: Record<string, string> = {
  HAN: 'Sân bay Quốc tế Nội Bài',
  SGN: 'Sân bay Quốc tế Tân Sơn Nhất',
  DAD: 'Sân bay Quốc tế Đà Nẵng',
  CXR: 'Sân bay Quốc tế Cam Ranh',
  PQC: 'Sân bay Quốc tế Phú Quốc',
  HPH: 'Sân bay Quốc tế Cát Bi',
  HUI: 'Sân bay Quốc tế Phú Bài',
  VCA: 'Sân bay Quốc tế Cần Thơ',
  VDO: 'Sân bay Quốc tế Vân Đồn',
  VII: 'Sân bay Quốc tế Vinh',
  THD: 'Sân bay Thọ Xuân',
  VDH: 'Sân bay Đồng Hới',
  UIH: 'Sân bay Phù Cát',
  PXU: 'Sân bay Pleiku',
  BMV: 'Sân bay Buôn Ma Thuột',
  DLI: 'Sân bay Liên Khương',
  VCL: 'Sân bay Chu Lai',
  DIN: 'Sân bay Điện Biên Phủ',
  VKG: 'Sân bay Rạch Giá',
  VCS: 'Sân bay Côn Đảo',
  SIN: 'Sân bay Quốc tế Changi (Singapore)',
  BKK: 'Sân bay Quốc tế Suvarnabhumi (Bangkok)',
  DMK: 'Sân bay Quốc tế Don Mueang (Bangkok)',
  ICN: 'Sân bay Quốc tế Incheon (Seoul)',
  KIX: 'Sân bay Quốc tế Kansai (Osaka)',
  NRT: 'Sân bay Quốc tế Narita (Tokyo)',
  HKG: 'Sân bay Quốc tế Hong Kong',
  TPE: 'Sân bay Quốc tế Taoyuan (Đài Bắc)',
  KHH: 'Sân bay Quốc tế Cao Hùng',
};

function getAirportFullName(code: string): string {
  const c = (code || '').toUpperCase();
  return AIRPORT_FULL_NAMES[c] || `Sân bay ${getAirportCity(c)}`;
}

interface FareBenefitInfo {
  label: string;
  badgeClass: string;
  cabinBaggage: string;
  checkedBaggage: string;
  features: string[];
}

const FARE_BENEFITS: Record<string, FareBenefitInfo> = {
  eco: {
    label: 'Economy',
    badgeClass: 'bg-red-50 text-primary border-red-200',
    cabinBaggage: '07kg xách tay',
    checkedBaggage: 'Chưa bao gồm (mua thêm linh hoạt)',
    features: [
      '07kg hành lý xách tay kích thước tiêu chuẩn',
      'Đổi ngày bay/hành trình có thu phí chênh lệch',
      'Tích lũy điểm xét hạng Vietjet SkyJoy',
    ],
  },
  deluxe: {
    label: 'Deluxe',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-300 font-black',
    cabinBaggage: '07kg xách tay + 01 túi nhỏ (3kg)',
    checkedBaggage: '20kg hành lý ký gửi miễn cước',
    features: [
      '10kg hành lý xách tay + 20kg ký gửi miễn phí',
      'Miễn phí thay đổi ngày bay, giờ bay, chặng bay',
      'Ưu tiên chọn chỗ ngồi yêu thích (không bao gồm ghế SkyBoss)',
      'Bảo hiểm du lịch Deluxe Flight Care',
    ],
  },
  skyboss: {
    label: 'SkyBoss',
    badgeClass: 'bg-vj-red-dark text-vj-red-dark border-vj-red-dark font-black',
    cabinBaggage: '10kg xách tay',
    checkedBaggage: '30kg ký gửi + 01 bộ dụng cụ Golf',
    features: [
      'Phòng chờ sang trọng (Luxury Lounge) tại sân bay',
      'Ưu tiên làm thủ tục tại quầy SkyBoss & lối đi riêng',
      'Xe đưa đón riêng ra tàu bay (Private Shuttling)',
      'Phục vụ ẩm thực tươi ngon không giới hạn trên chuyến bay',
    ],
  },
  business: {
    label: 'Business',
    badgeClass: 'bg-purple-50 text-purple-800 border-purple-300 font-black',
    cabinBaggage: '18kg xách tay',
    checkedBaggage: '40kg ký gửi + 01 bộ dụng cụ Golf',
    features: [
      'Ghế ngồi khoang riêng ngả phẳng 180° thành giường êm ái',
      'Phòng chờ riêng thương gia tiêu chuẩn quốc tế',
      'Ưu tiên quầy thủ tục, lối đi an ninh và hành lý ra đầu tiên',
      'Thực đơn ẩm thực cao cấp Organic & đồ uống không giới hạn',
    ],
  },
};

function getFareInfo(fareClass?: string): FareBenefitInfo {
  const key = (fareClass || 'eco').toLowerCase();
  return FARE_BENEFITS[key] || FARE_BENEFITS.eco;
}

function formatDate(iso?: string | null): string {
  if (!iso) return 'T6, 13/11/2026';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'T6, 13/11/2026';
  const days = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  const day = days[d.getDay()];
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${day}, ${dd}/${mm}/${yyyy}`;
}

function formatTime(iso?: string | null, fallback = '00:00'): string {
  if (!iso) return fallback;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return fallback;
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

function calcDuration(depart?: string | null, arrive?: string | null): string {
  if (!depart || !arrive) return '2 giờ 10 phút';
  const start = new Date(depart).getTime();
  const end = new Date(arrive).getTime();
  if (isNaN(start) || isNaN(end)) return '2 giờ 10 phút';
  const diff = Math.abs(end - start);
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours} giờ ${minutes} phút`;
}

interface FlightLegProps {
  leg: FlightSummaryItem;
  label: string;
  isFirst?: boolean;
  paxCount?: number;
  totalPrice?: number;
  showPrice?: boolean;
}

function FlightLegSection({
  leg,
  label: _label,
  isFirst = true,
  paxCount = 1,
  totalPrice = 0,
  showPrice = true,
}: FlightLegProps) {
  const [isOpen, setIsOpen] = useState(false);

  const fromCode = (leg.from_code || 'HAN').toUpperCase();
  const toCode = (leg.to_code || 'SGN').toUpperCase();
  const fromCity = getAirportCity(fromCode);
  const toCity = getAirportCity(toCode);
  const fromAirport = getAirportFullName(fromCode);
  const toAirport = getAirportFullName(toCode);

  const flightNo = leg.flight_no || 'VJ121';
  const aircraft = resolveAircraft(flightNo, fromCode, toCode);
  const dateFormatted = formatDate(leg.depart_time);
  const departTime = formatTime(leg.depart_time, '05:30');
  const arriveTime = formatTime(leg.arrive_time, '07:40');
  const duration = calcDuration(leg.depart_time, leg.arrive_time);

  const fare = getFareInfo(leg.class);
  const fareKey =
    (leg.class || 'eco').toLowerCase() === 'economy' ? 'eco' : (leg.class || 'eco').toLowerCase();

  return (
    <div className={`p-4 sm:p-5 relative ${!isFirst ? 'border-t border-vj-border-light' : ''}`}>
      {/* Top date row */}
      <div data-flight-date className="mb-3 text-sm font-bold text-gray-900">
        {dateFormatted}
      </div>

      {/* Grid hành trình */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        {/* Row chặng bay: SGN - DURATION/PLANE - VII */}
        <div
          data-flight-route
          className="flex items-center justify-between sm:justify-start flex-1 sm:gap-6"
        >
          {/* Điểm khởi hành */}
          <div className="flex flex-col text-left">
            <span className="text-2xl sm:text-3xl font-black text-gray-900 font-mono tracking-tight leading-none">
              {fromCode}
            </span>
            <span className="block text-sm sm:text-base font-bold text-gray-800 mt-1">
              {departTime}
            </span>
            <span className="text-2xs text-gray-500 font-medium mt-0.5 hidden sm:block">
              {fromCity}
            </span>
          </div>

          {/* Cột giữa: thời gian bay, máy bay, nút chi tiết */}
          <div className="flex-1 px-2 sm:px-6 text-center">
            <span className="text-2xs sm:text-xs font-semibold text-gray-600 block mb-1">
              {duration}
            </span>
            <div className="flex items-center justify-center my-1 text-orange-500">
              <span className="text-base font-bold transform inline-block">✈</span>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(!isOpen)}
              className="text-2xs sm:text-xs font-bold text-gray-600 hover:text-primary transition-colors cursor-pointer inline-flex items-center gap-1 active:scale-98"
              aria-expanded={isOpen}
            >
              <span>Bay thẳng | Chi tiết</span>
              <span className="text-3xs transition-transform duration-200">
                {isOpen ? '▲' : '▾'}
              </span>
            </button>
          </div>

          {/* Điểm đến */}
          <div className="flex flex-col text-right sm:text-right">
            <span className="text-2xl sm:text-3xl font-black text-gray-900 font-mono tracking-tight leading-none">
              {toCode}
            </span>
            <span className="block text-sm sm:text-base font-bold text-gray-800 mt-1">
              {arriveTime}
            </span>
            <span className="text-2xs text-gray-500 font-medium mt-0.5 hidden sm:block">
              {toCity}
            </span>
          </div>
        </div>

        {/* Desktop Cột phải: Hạng vé, hành lý & Tổng tiền */}
        <div
          data-flight-fare
          className="hidden sm:flex sm:border-l sm:border-gray-200 sm:pl-6 text-right flex-col justify-center items-end"
        >
          <div className="flex items-center justify-end mb-1">
            <img
              src={
                fareKey === 'eco'
                  ? '/images/fare-classes/eco-logo-color.svg'
                  : `/images/fare-classes/${fareKey}-logo.png`
              }
              alt={fare.label}
              className="h-6 w-auto object-contain"
              onError={(e) => {
                (e.currentTarget as HTMLElement).style.display = 'none';
              }}
            />
          </div>

          <div className="flex flex-col items-end">
            <span className="text-xs font-semibold text-gray-500">{paxCount} hành khách</span>
            {showPrice && totalPrice > 0 && (
              <span className="text-base sm:text-lg font-black text-primary tracking-tight">
                {totalPrice.toLocaleString('vi-VN')} VND
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Ticket Notch & Bottom Row */}
      <div className="sm:hidden mt-2">
        {/* Ticket notch cutouts */}
        <div className="relative my-2 -mx-4 h-2">
          <div className="absolute -left-2.5 -top-1 w-4 h-4 bg-[var(--vj-purple-light)] rounded-full shadow-inner" />
          <div className="absolute -right-2.5 -top-1 w-4 h-4 bg-[var(--vj-purple-light)] rounded-full shadow-inner" />
        </div>

        {/* Mobile bottom row: Logo - 1 hành khách - Giá tiền */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center">
            <img
              src={
                fareKey === 'eco'
                  ? '/images/fare-classes/eco-logo-color.svg'
                  : `/images/fare-classes/${fareKey}-logo.png`
              }
              alt={fare.label}
              className="h-6 w-auto object-contain"
              onError={(e) => {
                (e.currentTarget as HTMLElement).style.display = 'none';
              }}
            />
          </div>
          <span className="text-xs text-gray-700 font-medium">{paxCount} hành khách</span>
          {showPrice && totalPrice > 0 && (
            <span className="text-sm font-black text-primary tracking-tight">
              {totalPrice.toLocaleString('vi-VN')} VND
            </span>
          )}
        </div>
      </div>

      {/* Chi tiết lộ trình mở rộng */}
      {isOpen && (
        <div className="mt-4 pt-3.5 border-t border-vj-border-light bg-vj-surface-2 -mx-4 sm:-mx-5 px-4 sm:px-5 py-3 rounded-b-vj text-xs space-y-3 animate-fadeIn">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Lộ trình chuyến bay */}
            <div className="bg-white p-3 rounded-vj border border-vj-border-light/80 shadow-2xs space-y-2">
              <div className="flex items-center justify-between pb-1.5 border-b border-vj-border-light">
                <span className="font-extrabold text-vj-text text-2xs uppercase tracking-wide">
                  Chi tiết hành trình
                </span>
                <span className="font-mono font-black text-primary text-xs">{flightNo}</span>
              </div>
              <div className="space-y-1.5 text-2xs text-vj-text-dim">
                <div className="flex items-start gap-2">
                  <span className="text-vj-pay-green font-bold">●</span>
                  <div>
                    <span className="font-bold text-vj-text">{departTime}</span> — {fromAirport} (
                    {fromCode})
                  </div>
                </div>
                <div className="pl-3.5 text-3xs text-vj-gray">
                  Thời gian bay: {duration} (Bay thẳng) • Khai thác bởi Vietjet Air
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-vj-red-dark font-bold">●</span>
                  <div>
                    <span className="font-bold text-vj-text">{arriveTime}</span> — {toAirport} (
                    {toCode})
                  </div>
                </div>
                <div className="pt-1 flex items-center justify-between text-3xs text-vj-gray border-t border-vj-border-light mt-2">
                  <span>Dòng tàu bay:</span>
                  <span className="font-semibold text-vj-text-strong">{aircraft}</span>
                </div>
              </div>
            </div>

            {/* Tiêu chuẩn hành lý & tiện ích */}
            <div className="bg-white p-3 rounded-vj border border-vj-border-light/80 shadow-2xs space-y-2">
              <div className="flex items-center justify-between pb-1.5 border-b border-vj-border-light">
                <span className="font-extrabold text-vj-text text-2xs uppercase tracking-wide">
                  Quyền lợi hạng vé: {fare.label}
                </span>
                <span className="text-3xs font-semibold text-vj-gray">Tiêu chuẩn</span>
              </div>
              <div className="space-y-1.5 text-2xs text-vj-text-dim">
                <div className="flex items-center justify-between">
                  <span className="text-vj-text-strong">Hành lý xách tay:</span>
                  <span className="font-bold text-vj-text">{fare.cabinBaggage}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-vj-text-strong">Hành lý ký gửi:</span>
                  <span className="font-bold text-vj-text">{fare.checkedBaggage}</span>
                </div>
                <div className="pt-1.5 border-t border-vj-border-light space-y-1">
                  {fare.features.map((feat, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-1.5 text-3xs text-vj-text-strong"
                    >
                      <span className="text-vj-pay-green font-bold">✓</span>
                      <span>{feat}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function FlightSummaryCard({
  flight,
  returnFlight,
  paxCount = 1,
  totalPrice = 0,
  bookingCode: _bookingCode,
  title: _title = 'Thông tin chuyến bay',
  className = '',
}: FlightSummaryCardProps) {
  if (!flight) return null;

  return (
    <div
      className={`bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden ${className}`}
    >
      {/* Chuyến đi */}
      <FlightLegSection
        leg={flight}
        label="Chuyến đi"
        isFirst={true}
        paxCount={paxCount}
        totalPrice={totalPrice}
        showPrice={!returnFlight}
      />

      {/* Chuyến về nếu có */}
      {returnFlight && (
        <FlightLegSection
          leg={returnFlight}
          label="Chuyến về"
          isFirst={false}
          paxCount={paxCount}
          totalPrice={totalPrice}
          showPrice={true}
        />
      )}
    </div>
  );
}
