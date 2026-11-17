'use client';

import React from 'react';
import { Flight } from '@/features/bookings/types/booking-flow';
import { RiArrowRightSLine } from 'react-icons/ri';
import {
  SeatArmchairIcon,
  BaggageLuggageIcon,
  HotMealIcon,
  AirportTaxiIcon,
  SkyCareInsuranceIcon,
  SkyKidsIcon,
  PetTravelIcon,
} from '@/shared/components/ui/RealisticServiceIcons';
import BookingBottomBar from './BookingBottomBar';

interface AncillaryServicesStepProps {
  flight: Flight;
  returnFlight?: Flight | null;
  isRoundTrip?: boolean;
  passengerName?: string;
  selectedSeats?: string[];
  returnSeats?: string[];
  seatFee?: number;
  baggageLabel?: string;
  returnBaggageLabel?: string;
  baggageFee?: number;
  hasInsurance?: boolean;
  insuranceFee?: number;
  mealFee?: number;
  mealCount?: number;
  totalAmount: number;
  onOpenSeatDrawer: () => void;
  onOpenBaggageDrawer: () => void;
  onOpenMealDrawer: () => void;
  onOpenTaxiDrawer: () => void;
  onOpenInsuranceDrawer: () => void;
  onOpenPassengerServicesDrawer: () => void;
  onOpenPetDrawer: () => void;
  onBack: () => void;
  onContinue: () => void;
  isSubmitting?: boolean;
}

export default function AncillaryServicesStep({
  flight,
  returnFlight,
  isRoundTrip = false,
  passengerName: _passengerName = 'LONG CHIN',
  selectedSeats: _selectedSeats = [],
  returnSeats: _returnSeats = [],
  seatFee = 0,
  baggageLabel,
  returnBaggageLabel,
  baggageFee = 0,
  hasInsurance = false,
  insuranceFee = 72000,
  mealFee = 0,
  mealCount: _mealCount = 0,
  totalAmount,
  onOpenSeatDrawer,
  onOpenBaggageDrawer,
  onOpenMealDrawer,
  onOpenTaxiDrawer,
  onOpenInsuranceDrawer,
  onOpenPassengerServicesDrawer,
  onOpenPetDrawer,
  onBack,
  onContinue,
  isSubmitting = false,
}: AncillaryServicesStepProps) {
  return (
    <div className="space-y-4 pb-28">
      {/* Tiêu đề khối — site thật: 18px/600 (đo 13/11/2026) */}
      <div className="mb-2">
        <h2 className="font-koho text-base sm:text-lg font-bold text-emerald-700 italic tracking-tight">
          Đừng quên mua hành lý, suất ăn, chọn chỗ ngồi và hơn thế nữa...
        </h2>
      </div>

      {/* 7 Services in EXACT order of Vietjet reference */}
      <div className="space-y-3">
        {/* 1. Chọn chỗ ngồi yêu thích (Screenshot 8) */}
        <div
          onClick={onOpenSeatDrawer}
          className="group cursor-pointer rounded-2xl bg-white border border-gray-200/80 p-3.5 sm:p-4 shadow-xs hover:shadow-md hover:border-amber-300 transition-all flex items-center justify-between"
        >
          <div className="flex items-center gap-3.5 sm:gap-4 min-w-0 flex-1">
            <div className="shrink-0 flex items-center justify-center group-hover:scale-105 transition-transform">
              <SeatArmchairIcon width={50} height={66} className="drop-shadow-xs" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-koho text-sm sm:text-base font-bold text-gray-900 group-hover:text-primary transition-colors leading-snug">
                Chọn chỗ ngồi yêu thích
              </h3>
              <p className="font-koho text-xs text-gray-500 mt-0.5 font-normal">
                Hãy chọn chỗ ngồi yêu thích của bạn
              </p>
              <div className="font-koho text-sm sm:text-base font-bold text-primary mt-0.5">
                {seatFee > 0 ? `${seatFee.toLocaleString('vi-VN')} VND` : '0 VND'}
              </div>
              <div className="flex items-center gap-4 sm:gap-8 text-2xs sm:text-xs font-bold text-gray-700 mt-1.5 pt-1.5 border-t border-gray-100 font-koho">
                <span className="flex items-center gap-1.5">
                  {flight.from} <span className="text-primary text-xs">✈</span> {flight.to}
                </span>
                {isRoundTrip && (
                  <span className="flex items-center gap-1.5">
                    {returnFlight?.from || flight.to}{' '}
                    <span className="text-primary text-xs">✈</span>{' '}
                    {returnFlight?.to || flight.from}
                  </span>
                )}
              </div>
            </div>
          </div>
          <RiArrowRightSLine
            size={22}
            className="text-gray-400 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0"
          />
        </div>

        {/* 2. Chọn hành lý/Dịch vụ nối chuyến (Screenshot 8) */}
        <div
          onClick={onOpenBaggageDrawer}
          className="group cursor-pointer rounded-2xl bg-white border border-gray-200/80 p-3.5 sm:p-4 shadow-xs hover:shadow-md hover:border-amber-300 transition-all flex items-center justify-between"
        >
          <div className="flex items-center gap-3.5 sm:gap-4 min-w-0 flex-1">
            <div className="shrink-0 flex items-center justify-center group-hover:scale-105 transition-transform">
              <BaggageLuggageIcon width={50} height={66} className="drop-shadow-xs" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-koho text-sm sm:text-base font-bold text-gray-900 group-hover:text-primary transition-colors leading-snug">
                Chọn hành lý/Dịch vụ nối chuyến
              </h3>
              <p className="font-koho text-xs text-gray-500 mt-0.5 font-normal">
                Hãy lựa chọn gói hành lý phù hợp
              </p>
              <div className="font-koho text-sm sm:text-base font-bold text-primary mt-0.5">
                {baggageFee > 0 ? `${baggageFee.toLocaleString('vi-VN')} VND` : '0 VND'}
              </div>
              <div className="flex items-center gap-4 sm:gap-8 text-2xs sm:text-xs font-bold text-gray-700 mt-1.5 pt-1.5 border-t border-gray-100 font-koho">
                <span className="flex items-center gap-1.5">
                  {flight.from} <span className="text-primary text-xs">✈</span> {flight.to}{' '}
                  {baggageLabel ? `(${baggageLabel})` : ''}
                </span>
                {isRoundTrip && (
                  <span className="flex items-center gap-1.5">
                    {returnFlight?.from || flight.to}{' '}
                    <span className="text-primary text-xs">✈</span>{' '}
                    {returnFlight?.to || flight.from}{' '}
                    {returnBaggageLabel ? `(${returnBaggageLabel})` : ''}
                  </span>
                )}
              </div>
            </div>
          </div>
          <RiArrowRightSLine
            size={22}
            className="text-gray-400 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0"
          />
        </div>

        {/* 3. Chọn suất ăn (Screenshot 8) */}
        <div
          onClick={onOpenMealDrawer}
          className="group cursor-pointer rounded-2xl bg-white border border-gray-200/80 p-3.5 sm:p-4 shadow-xs hover:shadow-md hover:border-amber-300 transition-all flex items-center justify-between"
        >
          <div className="flex items-center gap-3.5 sm:gap-4 min-w-0 flex-1">
            <div className="shrink-0 flex items-center justify-center group-hover:scale-105 transition-transform">
              <HotMealIcon width={50} height={66} className="drop-shadow-xs" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-koho text-sm sm:text-base font-bold text-gray-900 group-hover:text-primary transition-colors leading-snug">
                Chọn suất ăn
              </h3>
              <p className="font-koho text-xs font-bold italic text-red-600 mt-0.5">jet café</p>
              <div className="font-koho text-sm sm:text-base font-bold text-primary mt-0.5">
                {mealFee > 0 ? `${mealFee.toLocaleString('vi-VN')} VND` : '0 VND'}
              </div>
              <div className="flex items-center gap-4 sm:gap-8 text-2xs sm:text-xs font-bold text-gray-700 mt-1.5 pt-1.5 border-t border-gray-100 font-koho">
                <span className="flex items-center gap-1.5">
                  {flight.from} <span className="text-primary text-xs">✈</span> {flight.to}
                </span>
                {isRoundTrip && (
                  <span className="flex items-center gap-1.5">
                    {returnFlight?.from || flight.to}{' '}
                    <span className="text-primary text-xs">✈</span>{' '}
                    {returnFlight?.to || flight.from}
                  </span>
                )}
              </div>
            </div>
          </div>
          <RiArrowRightSLine
            size={22}
            className="text-gray-400 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0"
          />
        </div>

        {/* 4. Dịch vụ Taxi */}
        <div
          onClick={onOpenTaxiDrawer}
          className="group cursor-pointer rounded-2xl bg-white border border-gray-200/80 p-3.5 sm:p-4 shadow-xs hover:shadow-md hover:border-amber-300 transition-all flex items-center justify-between"
        >
          <div className="flex items-center gap-3.5 sm:gap-4 min-w-0 flex-1">
            <div className="shrink-0 flex items-center justify-center group-hover:scale-105 transition-transform">
              <AirportTaxiIcon width={50} height={66} className="drop-shadow-xs" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-koho text-sm sm:text-base font-bold text-gray-900 group-hover:text-primary transition-colors leading-snug">
                Dịch vụ Taxi
              </h3>
              <div className="font-koho text-sm sm:text-base font-bold text-primary mt-0.5">
                0 VND
              </div>
              <div className="flex items-center gap-4 sm:gap-8 text-2xs sm:text-xs font-bold text-gray-700 mt-1.5 pt-1.5 border-t border-gray-100 font-koho">
                <span className="flex items-center gap-1.5">
                  {flight.from} <span className="text-primary text-xs">✈</span> {flight.to}
                </span>
                {isRoundTrip && (
                  <span className="flex items-center gap-1.5">
                    {returnFlight?.from || flight.to}{' '}
                    <span className="text-primary text-xs">✈</span>{' '}
                    {returnFlight?.to || flight.from}
                  </span>
                )}
              </div>
            </div>
          </div>
          <RiArrowRightSLine
            size={22}
            className="text-gray-400 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0"
          />
        </div>

        {/* 5. Bảo hiểm du lịch Vietjet Travel Safe */}
        <div
          onClick={onOpenInsuranceDrawer}
          className={`group cursor-pointer rounded-2xl border p-3.5 sm:p-4 shadow-xs hover:shadow-md transition-all flex items-center justify-between ${
            hasInsurance
              ? 'bg-red-50/40 border-primary-dark shadow-sm'
              : 'bg-white border-gray-200/80 hover:border-amber-300'
          }`}
        >
          <div className="flex items-center gap-3.5 sm:gap-4 min-w-0 flex-1">
            <div className="shrink-0 flex items-center justify-center group-hover:scale-105 transition-transform">
              <SkyCareInsuranceIcon width={50} height={66} className="drop-shadow-xs" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-koho text-sm sm:text-base font-bold text-gray-900 group-hover:text-primary transition-colors leading-snug">
                Bảo hiểm du lịch Vietjet Travel Safe
              </h3>
              <div className="font-koho text-sm sm:text-base font-bold text-primary mt-0.5">
                {hasInsurance ? `${insuranceFee.toLocaleString('vi-VN')} VND` : '0 VND'}
              </div>
              <div className="flex items-center gap-4 sm:gap-8 text-2xs sm:text-xs font-bold text-gray-700 mt-1.5 pt-1.5 border-t border-gray-100 font-koho">
                <span className="flex items-center gap-1.5">
                  {flight.from} <span className="text-primary text-xs">✈</span> {flight.to}
                </span>
                {isRoundTrip && (
                  <span className="flex items-center gap-1.5">
                    {returnFlight?.from || flight.to}{' '}
                    <span className="text-primary text-xs">✈</span>{' '}
                    {returnFlight?.to || flight.from}
                  </span>
                )}
              </div>
            </div>
          </div>
          <RiArrowRightSLine
            size={22}
            className="text-gray-400 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0"
          />
        </div>

        {/* 6. Dịch vụ theo hành khách [New] */}
        <div
          onClick={onOpenPassengerServicesDrawer}
          className="group cursor-pointer rounded-2xl bg-white border border-gray-200/80 p-3.5 sm:p-4 shadow-xs hover:shadow-md hover:border-amber-300 transition-all flex items-center justify-between"
        >
          <div className="flex items-center gap-3.5 sm:gap-4 min-w-0 flex-1">
            <div className="shrink-0 flex items-center justify-center group-hover:scale-105 transition-transform">
              <SkyKidsIcon width={50} height={66} className="drop-shadow-xs" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="font-koho text-sm sm:text-base font-bold text-gray-900 group-hover:text-primary transition-colors leading-snug">
                  Dịch vụ theo hành khách
                </h3>
                <span className="text-3xs bg-primary text-white font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider font-koho">
                  New
                </span>
              </div>
              <p className="font-koho text-xs text-gray-500 mt-0.5 font-normal">
                Hãy lựa chọn dịch vụ
              </p>
              <div className="font-koho text-sm sm:text-base font-bold text-primary mt-0.5">
                0 VND
              </div>
              <div className="flex items-center gap-4 sm:gap-8 text-2xs sm:text-xs font-bold text-gray-700 mt-1.5 pt-1.5 border-t border-gray-100 font-koho">
                <span className="flex items-center gap-1.5">
                  {flight.from} <span className="text-primary text-xs">✈</span> {flight.to}
                </span>
                {isRoundTrip && (
                  <span className="flex items-center gap-1.5">
                    {returnFlight?.from || flight.to}{' '}
                    <span className="text-primary text-xs">✈</span>{' '}
                    {returnFlight?.to || flight.from}
                  </span>
                )}
              </div>
            </div>
          </div>
          <RiArrowRightSLine
            size={22}
            className="text-gray-400 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0"
          />
        </div>

        {/* 7. Mang theo thú cưng [New] */}
        <div
          onClick={onOpenPetDrawer}
          className="group cursor-pointer rounded-2xl bg-white border border-gray-200/80 p-3.5 sm:p-4 shadow-xs hover:shadow-md hover:border-amber-300 transition-all flex items-center justify-between"
        >
          <div className="flex items-center gap-3.5 sm:gap-4 min-w-0 flex-1">
            <div className="shrink-0 flex items-center justify-center group-hover:scale-105 transition-transform">
              <PetTravelIcon width={50} height={66} className="drop-shadow-xs" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="font-koho text-sm sm:text-base font-bold text-gray-900 group-hover:text-primary transition-colors leading-snug">
                  Mang theo thú cưng
                </h3>
                <span className="text-3xs bg-primary text-white font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider font-koho">
                  New
                </span>
              </div>
              <p className="font-koho text-xs text-gray-500 mt-0.5 font-normal">
                Thú cưng ơi, bay thôi!
              </p>
              <div className="font-koho text-sm sm:text-base font-bold text-primary mt-0.5">
                0 VND
              </div>
              <div className="flex items-center gap-4 sm:gap-8 text-2xs sm:text-xs font-bold text-gray-700 mt-1.5 pt-1.5 border-t border-gray-100 font-koho">
                <span className="flex items-center gap-1.5">
                  {flight.from} <span className="text-primary text-xs">✈</span> {flight.to}
                </span>
                {isRoundTrip && (
                  <span className="flex items-center gap-1.5">
                    {returnFlight?.from || flight.to}{' '}
                    <span className="text-primary text-xs">✈</span>{' '}
                    {returnFlight?.to || flight.from}
                  </span>
                )}
              </div>
            </div>
          </div>
          <RiArrowRightSLine
            size={22}
            className="text-gray-400 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0"
          />
        </div>
      </div>

      {/* Sticky Bottom Bar */}
      <BookingBottomBar
        total={totalAmount}
        onBack={onBack}
        onContinue={onContinue}
        continueLabel="Đi tiếp"
        canContinue={!isSubmitting}
      />
    </div>
  );
}
