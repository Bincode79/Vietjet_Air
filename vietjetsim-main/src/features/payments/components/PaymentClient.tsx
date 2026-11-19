'use client';
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import PassengerDetailModal from '@/app/tim-ve/components/PassengerDetailModal';
import { Icon } from '@/shared/components/ui';
import { PaymentSkeleton } from '@/shared/components/ui';
import { useToast } from '@/hooks/useToast';
import { ToastContainer } from '@/shared/components/feedback';
import { createPayment, getWalletOverview } from '@/features/payments/services';
import { getMembership } from '@/features/loyalty/services';
import { useAuth } from '@/contexts/AuthContext';
import { getAirportCity } from '@/features/flights';
import { TAX_AND_FEE_RATE, ANCILLARY_OPTIONS, type AncillaryId } from '@/features/bookings/pricing';

import type { PaymentMethod } from '@/features/payments/types';
import { apiRequest, ApiRequestError } from '@/shared/services';
import { renderTransferNote } from '@/lib/transfer-note';
import { skypointPointsForAmount, skypointValueOfPoints } from '@/lib/skypoint';
import { MOVI_DEFAULT_TENOR, MOVI_HOLD_MINUTES } from '@/lib/movi';
import EBoardingPass from './EBoardingPass';
import PaymentModal from './PaymentModal';
import ReservationCountdown from './ReservationCountdown';
import BookingTicketCard from './BookingTicketCard';
import ItineraryModal from '@/features/bookings/components/ItineraryModal';
import {
  VisaLogo,
  MastercardLogo,
  JcbLogo,
  AmexLogo,
  NapasLogo,
  VietQrLogo,
  VnpayLogo,
  MomoLogo,
  ZaloPayLogo,
  ApplePayLogo,
  GooglePayLogo,
  SkyJoyLogo,
  MoviLogo,
  GalaxyPayBadge,
  PaymentSecurityFooter,
} from './PaymentMethodLogos';

interface BankAccount {
  id: string;
  admin_bank_name: string;
  admin_bank_account_number: string;
  admin_bank_account_holder: string;
  bank_bin?: string;
  branch?: string;
  logo_url?: string;
  is_default?: boolean;
  transfer_note_template?: string;
}


// Confetti particle type
interface Particle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  rotation: number;
  rotationSpeed: number;
  shape: 'rect' | 'circle';
  opacity: number;
}

const CONFETTI_COLORS = [
  '#EC2029',
  '#FFDD00',
  '#ffffff',
  '#ff6b6b',
  '#ffd93d',
  '#ff8c00',
  '#6f0000',
];

function ConfettiCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animFrameRef = useRef<number>(0);
  const startTimeRef = useRef<number>(Date.now());

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    // Spawn particles
    const particles: Particle[] = [];
    for (let i = 0; i < 120; i++) {
      particles.push({
        id: i,
        x: Math.random() * canvas.width,
        y: -20 - Math.random() * 200,
        vx: (Math.random() - 0.5) * 4,
        vy: 2 + Math.random() * 4,
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        size: 6 + Math.random() * 8,
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 8,
        shape: Math.random() > 0.4 ? 'rect' : 'circle',
        opacity: 1,
      });
    }
    particlesRef.current = particles;

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const elapsed = (Date.now() - startTimeRef.current) / 1000;

      particlesRef.current = particlesRef.current
        .map((p: Particle) => ({
          ...p,
          x: p.x + p.vx,
          y: p.y + p.vy,
          vy: p.vy + 0.08,
          rotation: p.rotation + p.rotationSpeed,
          opacity: elapsed > 2.5 ? Math.max(0, 1 - (elapsed - 2.5) / 1.5) : 1,
        }))
        .filter((p: Particle) => p.y < canvas.height + 50);

      particlesRef.current.forEach((p: Particle) => {
        ctx.save();
        ctx.globalAlpha = p.opacity;
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.fillStyle = p.color;
        if (p.shape === 'rect') {
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      });

      if (elapsed < 4) {
        animFrameRef.current = requestAnimationFrame(animate);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };

    animFrameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-50"
      style={{ width: '100vw', height: '100vh' }}
    />
  );
}

function AnimatedCheckmark() {
  const [animate, setAnimate] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setAnimate(true), 100);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 transition-all duration-500 ${animate ? 'scale-100 bg-white/20' : 'scale-0 bg-white/0'}`}
    >
      <svg
        viewBox="0 0 52 52"
        className="w-10 h-10"
        style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.15))' }}
      >
        <circle
          cx="26"
          cy="26"
          r="24"
          fill="none"
          stroke="rgba(255,255,255,0.4)"
          strokeWidth="2"
          className={`transition-all duration-500 ${animate ? 'opacity-100' : 'opacity-0'}`}
        />
        <path
          fill="none"
          stroke="white"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M14 27 L22 35 L38 19"
          style={{
            strokeDasharray: 30,
            strokeDashoffset: animate ? 0 : 30,
            transition: 'stroke-dashoffset 0.5s ease 0.3s',
          }}
        />
      </svg>
    </div>
  );
}

// ─── Payment Processing Overlay ───────────────────────────────────────────────
function PaymentProcessingOverlay() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div
        className="bg-white rounded-3xl shadow-2xl px-10 py-10 flex flex-col items-center gap-5 max-w-xs w-full mx-4"
        style={{ boxShadow: '0 32px 72px rgba(0,0,0,0.25)' }}
      >
        {/* Animated spinner */}
        <div className="relative w-20 h-20">
          <svg className="animate-spin w-20 h-20 text-primary" viewBox="0 0 80 80" fill="none">
            <circle
              cx="40"
              cy="40"
              r="34"
              stroke="currentColor"
              strokeWidth="6"
              strokeOpacity="0.15"
            />
            <path
              d="M40 6 A34 34 0 0 1 74 40"
              stroke="currentColor"
              strokeWidth="6"
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
              <Icon name="LockClosedIcon" size={20} className="text-primary" />
            </div>
          </div>
        </div>
        <div className="text-center">
          <div className="font-black text-[var(--vj-navy)] text-lg mb-1 font-koho">
            Đang xử lý thanh toán
          </div>
          <div className="text-sm text-[var(--foreground-muted)]">
            Vui lòng không đóng trang này...
          </div>
        </div>
        {/* Progress dots */}
        <div className="flex items-center gap-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-2 h-2 rounded-full bg-primary"
              style={{ animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite` }}
            />
          ))}
        </div>
        <div className="flex items-center gap-2 text-xs text-[var(--vj-green)] bg-[rgb(var(--vj-green-rgb))]/10 border border-[rgb(var(--vj-green-rgb))]/30 rounded-vj px-4 py-2">
          <Icon name="ShieldCheckIcon" size={14} className="text-[var(--vj-green)] flex-shrink-0" />
          Kết nối bảo mật SSL 256-bit
        </div>
      </div>
    </div>
  );
}

// ─── Error Modal ──────────────────────────────────────────────────────────────
interface ErrorModalProps {
  title: string;
  message: string;
  onRetry: () => void;
  onDismiss: () => void;
}

function ErrorModal({ title, message, onRetry, onDismiss }: ErrorModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <div
        className="bg-white rounded-3xl shadow-2xl max-w-sm w-full overflow-hidden"
        style={{ boxShadow: '0 32px 72px rgba(0,0,0,0.25)', animation: 'fadeInUp 0.3s ease-out' }}
      >
        {/* Red accent top */}
        <div className="h-1.5 w-full bg-gradient-to-r from-primary/60 via-primary to-primary/60" />
        <div className="p-8 flex flex-col items-center text-center">
          {/* Error icon */}
          <div className="w-16 h-16 bg-[rgb(var(--primary-rgb))]/10 rounded-full flex items-center justify-center mb-5 border-4 border-primary/20">
            <Icon name="ExclamationTriangleIcon" size={32} className="text-primary" />
          </div>
          <h3 className="font-black text-[var(--vj-navy)] text-xl mb-2 font-koho">{title}</h3>
          <p className="text-sm text-[var(--foreground-muted)] leading-relaxed mb-7">{message}</p>
          <div className="flex flex-col gap-3 w-full">
            <button
              onClick={onRetry}
              className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary-dark text-white font-bold py-3.5 rounded-vj transition-all shadow-vj-btn hover:shadow-vj-btn-hover hover:-translate-y-0.5"
            >
              <Icon name="ArrowPathIcon" size={16} />
              Thử lại
            </button>
            <button
              onClick={onDismiss}
              className="w-full py-3 rounded-vj border border-[var(--border)] text-[var(--foreground-muted)] font-semibold text-sm hover:bg-[var(--surface)] transition-all"
            >
              Đóng
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * `YYYY-MM-DD` from the booking, as `d/M/yyyy`.
 *
 * This is a calendar date, not an instant, so it is split by hand: handing
 * `'2026-10-07'` to `new Date()` would read it as UTC midnight and, anywhere
 * west of GMT, print the day before.
 */
function formatBookingDay(day: string): string {
  const [year, month, date] = day.split('-');
  if (!year || !month || !date) return day;
  return `${Number(date)}/${Number(month)}/${year}`;
}

function formatHoldExpireDate(iso?: string | null): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} | ${hours}:${mins}`;
  } catch {
    return '';
  }
}

function formatLocalBookingDateTime(iso?: string | null): string {
  const d = iso ? new Date(iso) : new Date();
  try {
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    return `${hours}:${mins}, ${day}/${month}/${year}`;
  } catch {
    return '';
  }
}

export default function PaymentClient() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [hasPromoChecked, setHasPromoChecked] = useState(false);
  const [selectedMethodGroup, setSelectedMethodGroup] = useState<string>(() => {
    if (typeof window === 'undefined') return 'vnpay_qr';
    const param = new URLSearchParams(window.location.search).get('method');
    return param || 'vnpay_qr';
  });
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(() => {
    if (typeof window === 'undefined') return 'vietqr';
    const param = new URLSearchParams(window.location.search).get('method');
    if (param === 'card') return 'card';
    if (param === 'bank') return 'bank';
    if (param === 'wallet') return 'wallet';
    if (param === 'skypoint') return 'skypoint';
    return 'vietqr';
  });
  // The bank tab no longer collects the customer's own account — it confirms a
  // transfer they already made, by re-typing the memo and amount we displayed.
  const [transferNoteInput, setTransferNoteInput] = useState('');
  const [transferAmountInput, setTransferAmountInput] = useState('');
  const [promoCode, setPromoCode] = useState('');
  const [promoApplied, setPromoApplied] = useState(false);
  const [promoData, setPromoData] = useState<{
    id: string;
    code: string;
    type: string;
    value: number;
    discountAmount: number;
  } | null>(null);
  const [promoError, setPromoError] = useState('');
  const [isApplyingPromo, setIsApplyingPromo] = useState(false);
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  // Receipt image upload state for bank transfer & VietQR verification
  const [receiptImage, setReceiptImage] = useState<string | null>(null);
  const [receiptFileName, setReceiptFileName] = useState<string | null>(null);
  const [receiptFileSize, setReceiptFileSize] = useState<string | null>(null);
  const [isDraggingReceipt, setIsDraggingReceipt] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchParams = useSearchParams();
  const bookingParam =
    searchParams?.get('bookingId') || searchParams?.get('code') || searchParams?.get('id');
  const [initialBookingId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    return params.get('bookingId') || params.get('code') || params.get('id');
  });
  const bookingId = bookingParam || initialBookingId;
  const [bookingCode, setBookingCode] = useState<string | null>(() => bookingParam ?? null);
  const [isBookingLoading, setIsBookingLoading] = useState<boolean>(() => !!bookingId);

  // Read booking data from sessionStorage (set by FlightBookingClient)
  const [booking, setBooking] = useState<{
    bookingId?: string;
    bookingCode?: string;
    returnBookingId?: string;
    contactEmail?: string;
    contactPhone?: string;
    flightNo: string;
    returnFlightNo?: string;
    from: string;
    to: string;
    fromCity: string;
    toCity: string;
    departTime: string;
    arriveTime: string;
    returnDepartTime?: string;
    returnArriveTime?: string;
    date: string;
    returnDate?: string;
    status?: string;
    hold_expires_at?: string;
    hold_method?: string;
    passengers: { name: string; seat: string; returnSeat?: string }[];
    /** Air fare across all passengers (written by FlightBookingClient). */
    fareSubtotal: number;
    tax: number;
    seatFee: number;
    ancillaryFee?: number;
    ancillaries?: AncillaryId[];
    total: number;
  } | null>(null);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('vjsim_booking');
      if (stored) {
        const parsed = JSON.parse(stored);
        setBooking(parsed);
        if (parsed.bookingCode && parsed.bookingCode !== '—') {
          setBookingCode(parsed.bookingCode);
        }
      }
      // Không có `vjsim_booking` ⇒ khách chưa có đơn đặt vé nào. Trước đây
      // nhánh `else` dựng một booking giả (VJ141 SGN→HAN, NGUYỄN VĂN AN,
      // 1.730.000đ) để "trang luôn hiển thị đầy đủ". Hậu quả: mở /thanh-toán
      // trực tiếp — hoặc từ một tab mới — hiện một vé điện tử hoàn chỉnh
      // cho một chuyến bay không tồn tại, kèm giá, giờ bay và thông tin hành
      // khách bịa. Khách đọc đó là vé của họ. `booking` phải giữ `null` để
      // trang hiện trạng thái "chưa có đơn" thật sự.
    } catch {
      // JSON hỏng ⇒ cũng coi như chưa có đơn.
    }
  }, []);

  useEffect(() => {
    if (!bookingId) return;
    let cancelled = false;
    apiRequest<{
      booking?: {
        id: string;
        booking_code: string | null;
        total_price?: number | string;
        status?: string;
        hold_expires_at?: string;
        hold_method?: string;
        flight?: {
          flight_no: string;
          from_code: string;
          to_code: string;
          depart_time: string;
          arrive_time: string;
          price: number;
          class: string;
        } | null;
        passengers?: Array<{
          name: string;
          seat_number?: string;
        }>;
        seats?: Array<{
          seat_number: string;
        }>;
      };
    }>(`/api/dat-ve/${bookingId}`)
      .then((data) => {
        if (!cancelled && data.booking) {
          const b = data.booking;
          setBookingCode(b.booking_code ?? null);
          const dbTotal = Number(b.total_price || 0);
          const dbFlight = b.flight;
          // Mọi trường dưới đây đến từ database. Trước đây chúng có
          // fallback về SGN/HAN/VJ141/08:30 và tên hành khách bịa — nghĩa là
          // một booking không có chuyến bay (dữ liệu chưa đủ) vẫn được hiện
          // như một chuyến bay hoàn chỉnh. Thiếu dữ liệu thì phải hiện
          // thiếu dữ liệu.
          const fromCode = (dbFlight?.from_code || '').toUpperCase();
          const toCode = (dbFlight?.to_code || '').toUpperCase();
          const departTimeStr = dbFlight?.depart_time
            ? new Date(dbFlight.depart_time).toLocaleTimeString('vi-VN', {
                hour: '2-digit',
                minute: '2-digit',
              })
            : '';
          const arriveTimeStr = dbFlight?.arrive_time
            ? new Date(dbFlight.arrive_time).toLocaleTimeString('vi-VN', {
                hour: '2-digit',
                minute: '2-digit',
              })
            : '';
          const dateStr = dbFlight?.depart_time
            ? new Date(dbFlight.depart_time).toISOString().split('T')[0]
            : '';
          const paxList = (b.passengers || []).map((p, idx) => ({
            name: p.name || `Hành khách ${idx + 1}`,
            seat: p.seat_number || b.seats?.[idx]?.seat_number || 'Chưa chọn',
          }));

          setBooking((prev) => ({
            ...prev,
            bookingId: b.id,
            flightNo: dbFlight?.flight_no || prev?.flightNo || '',
            from: fromCode,
            to: toCode,
            fromCity: fromCode ? getAirportCity(fromCode) : '',
            toCity: toCode ? getAirportCity(toCode) : '',
            departTime: departTimeStr,
            arriveTime: arriveTimeStr,
            date: dateStr,
            passengers:
              paxList.length > 0
                ? paxList.map((p, idx) => ({
                    ...p,
                    returnSeat: prev?.passengers?.[idx]?.returnSeat,
                  }))
                : (prev?.passengers ?? []),
            status: b.status,
            hold_expires_at: b.hold_expires_at,
            hold_method: b.hold_method,
            fareSubtotal: Math.round(dbTotal * 0.65),
            tax: Math.round(dbTotal * 0.25),
            seatFee: prev?.seatFee ?? 0,
            ancillaryFee: Math.round(dbTotal * 0.1),
            ancillaries: prev?.ancillaries || [],
            total: dbTotal > 0 ? dbTotal : (prev?.total ?? 0),
            returnBookingId: prev?.returnBookingId,
            returnFlightNo: prev?.returnFlightNo,
            returnDepartTime: prev?.returnDepartTime,
            returnArriveTime: prev?.returnArriveTime,
            returnDate: prev?.returnDate,
          }));
        }
      })
      .catch(() => {
        // A missing PNR must not block payment, and apiRequest already logged it.
        if (!cancelled) setBookingCode(null);
      })
      .finally(() => {
        if (!cancelled) {
          setIsBookingLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [bookingId]);

  const bookingCodeLabel = bookingCode ?? '—';
  const discountAmount = promoApplied && promoData ? promoData.discountAmount : 0;
  const total = booking ? booking.total - discountAmount : 0;
  const [pageLoading, setPageLoading] = useState(true);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [showVietQrModal, setShowVietQrModal] = useState(false);
  const toast = useToast();
  const [adminAccounts, setAdminAccounts] = useState<BankAccount[]>([]);
  const [selectedAdminAccount, setSelectedAdminAccount] = useState<BankAccount | null>(null);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  // SkyPoint (SkyJoy): số dư điểm + tỷ lệ quy đổi points/1.000đ của chương
  // trình loyalty — cả client hiển thị lẫn server trừ điểm dùng chung công
  // thức trong `@/lib/skypoint` để số hiển thị và số trừ không lệch nhau.
  const [skypointInfo, setSkypointInfo] = useState<{ points: number; rate: number } | null>(null);
  const [useCashPlusPoints, setUseCashPlusPoints] = useState(false);
  const [cashPlusPointsRedeem, setCashPlusPointsRedeem] = useState<number>(0);

  const maxPossiblePointsToRedeem = useMemo(() => {
    if (!skypointInfo) return 0;
    const pointsForFullTotal = skypointPointsForAmount(total, skypointInfo.rate);
    return Math.min(skypointInfo.points, pointsForFullTotal);
  }, [skypointInfo, total]);

  const cashPlusPointsDiscountVnd = useMemo(() => {
    if (!useCashPlusPoints || !skypointInfo || cashPlusPointsRedeem <= 0) return 0;
    return skypointValueOfPoints(cashPlusPointsRedeem, skypointInfo.rate);
  }, [useCashPlusPoints, skypointInfo, cashPlusPointsRedeem]);

  const payableTotal = useMemo(() => {
    return Math.max(0, total - cashPlusPointsDiscountVnd);
  }, [total, cashPlusPointsDiscountVnd]);

  /**
   * Phí tiện ích của modal VietQR.
   *
   * Trước đây modal nhận cứng `convenienceFee={108000}` — một con số không
   * thuộc về đơn nào. Nếu khách chọn chỗ hoặc mua thêm hành lý, tổng trên
   * modal không cộng ra được với tổng bên dưới, và con số cứng 108.000 là
   * phí mà khách không hề đặt ra. Phí thật là phí chọn chỗ cộng dịch vụ bổ
   * sung; nếu không có thì bằng 0.
   */
  const vietQrConvenienceFee = useMemo(() => {
    if (!booking) return 0;
    return (booking.seatFee ?? 0) + (booking.ancillaryFee ?? 0);
  }, [booking]);

  /**
   * Tổng mà modal VietQR in ra — phải bằng đúng tổng của các dòng nó hiện:
   * tạm tính + phí tiện ích − giảm giá.
   */
  const vietQrGrandTotal = useMemo(() => {
    const subtotal = booking?.fareSubtotal ?? 0;
    return Math.max(0, subtotal + vietQrConvenienceFee - discountAmount);
  }, [booking, vietQrConvenienceFee, discountAmount]);

  /**
   * Số tiền mặt khách phải trả — con số mà server sẽ kiểm tra.
   *
   * Với phương thức `skypoint` thuần (không bật Cash + Points), toàn bộ giá
   * vé được trả bằng điểm nên tiền mặt phải trả là 0. Server tính đúng như
   * vậy, và con số này phải được suy ra theo *cùng công thức* — trừ điểm làm
   * tròn lên, quy đổi làm tròn xuống — nếu không hai bên lệch nhau và giao
   * dịch bị từ chối với thông báo "Số tiền phải đúng …".
   */
  const cashDue = useMemo(() => {
    if (paymentMethod !== 'skypoint') return payableTotal;
    if (useCashPlusPoints && cashPlusPointsRedeem > 0) return payableTotal;
    if (!skypointInfo) return payableTotal;
    const pointsForFullTotal = skypointPointsForAmount(total, skypointInfo.rate);
    const pointsValue = skypointValueOfPoints(pointsForFullTotal, skypointInfo.rate);
    return Math.max(0, total - pointsValue);
  }, [paymentMethod, payableTotal, useCashPlusPoints, cashPlusPointsRedeem, skypointInfo, total]);

  // Tải cấu hình ngân hàng công khai (không yêu cầu đăng nhập)
  useEffect(() => {
    apiRequest<{
      accounts?: BankAccount[];
    }>('/api/cong-khai/cau-hinh-ngan-hang')
      .then((data) => {
        if (data.accounts && data.accounts.length > 0) {
          setAdminAccounts(data.accounts);
          setSelectedAdminAccount(data.accounts[0]);
        }
      })
      .catch((err) => console.error('Failed to load bank config:', err));
  }, []);

  // Chỉ tải số dư ví & SkyPoint khi người dùng đã đăng nhập (tránh lỗi 401 console khi là guest)
  useEffect(() => {
    if (authLoading || !user) return;

    // Fetch wallet balance (fail-soft: khách chưa đăng nhập thì im lặng, không ghi lỗi console)
    getWalletOverview()
      .then((data) => {
        if (data.wallet) {
          setWalletBalance(parseFloat(String(data.wallet.balance)));
        }
      })
      .catch((err) => {
        if (!String(err).includes('Authentication required') && !String(err).includes('401')) {
          console.error('Failed to load wallet balance:', err);
        }
      });

    // SkyPoint balance for the SkyJoy payment tab (fail-soft như ví).
    getMembership()
      .then((data) => {
        if (data?.membership && data?.program) {
          setSkypointInfo({
            points: data.membership.currentPoints ?? 0,
            rate: data.program.pointsPerThousandVnd ?? 10,
          });
        }
      })
      .catch((err) => {
        if (!String(err).includes('Authentication required') && !String(err).includes('401')) {
          console.error('Failed to load SkyPoint balance:', err);
        }
      });
  }, [user, authLoading]);

  useEffect(() => {
    const timer = setTimeout(() => setPageLoading(false), 50);
    return () => clearTimeout(timer);
  }, []);

  // Trạng thái Bay trước trả sau Movi
  const [moviCccd, setMoviCccd] = useState<string>('');
  const [moviFullName, setMoviFullName] = useState<string>('');
  const [moviBirthDate, setMoviBirthDate] = useState<string>('');
  const [moviPhone, setMoviPhone] = useState<string>('');
  /**
   * Mốc hết hạn của lượt giữ chỗ MOVI (30 phút), do SERVER quyết định.
   *
   * Đồng hồ đếm ngược đọc mốc này, không tự đếm — vì "tự hủy sau 30 phút"
   * chỉ có nghĩa nếu mốc thời gian nằm ở server. Một bộ đếm phía client
   * đóng tab là mất trắng, và chỉnh ngày giờ máy là thay đổi luật.
   */
  const [moviHoldExpiresAt, setMoviHoldExpiresAt] = useState<string | null>(null);
  const [moviHoldExpired, setMoviHoldExpired] = useState<boolean>(false);

  const [showMoviModal, setShowMoviModal] = useState<boolean>(false);
  const [moviQrDataUrl, setMoviQrDataUrl] = useState<string>('');
  const [showFlightInfoAccordion, setShowFlightInfoAccordion] = useState<boolean>(true);
  const [showPaxInfoAccordion, setShowPaxInfoAccordion] = useState<boolean>(true);

  const [showItineraryModal, setShowItineraryModal] = useState<boolean>(false);

  const itineraryBookingData = useMemo(() => {
    if (!booking) return null;
    // The itinerary renders a real ticket, so every identifier it shows has to
    // come from the booking. `vj-id` and `VJ-PNR` were placeholders that
    // reached a customer-facing document as if they were a PNR.
    const contactEmail = booking.contactEmail || '';
    return {
      id: bookingId || booking.bookingId || '',
      booking_code: bookingCodeLabel !== '—' ? bookingCodeLabel : booking.flightNo,
      status: 'confirmed',
      created_at: new Date().toISOString(),
      total_price: total,
      contact_name: booking.passengers?.[0]?.name,
      contact_email: contactEmail,
      flight: {
        flight_no: booking.flightNo,
        from_code: booking.from,
        to_code: booking.to,
        depart_time: booking.departTime,
        arrive_time: booking.arriveTime,
        class: 'Eco',
      },
      passengers: booking.passengers?.map((p, idx) => ({
        id: `p-${idx}`,
        name: p.name,
        seat_number: p.seat,
        email: contactEmail,
      })),
      seats: booking.passengers?.map((p) => ({
        seat_number: p.seat,
      })),
      payment: {
        status: 'completed',
        method: paymentMethod,
      },
    };
  }, [booking, bookingId, bookingCodeLabel, total, paymentMethod]);

  useEffect(() => {
    if (booking?.passengers && booking.passengers.length > 0 && !moviFullName) {
      const first = booking.passengers[0];
      // Tên hành khách phải là tên thật từ đơn đặt vé. Trước đây điều kiện
      // loại trừ chuỗi 'HÀNH KHÁCH' — một chuỗi chỉ tồn tại vì chính fallback
      // tạo ra nó — nên bỏ đi: tên nào cũng lấy, đừng tự bịa ra tiêu chí.
      if (first.name) {
        setMoviFullName(first.name);
      }
    }
  }, [booking, moviFullName]);

  // ─── Giữ chỗ MOVI: 30 phút, mốc thời gian do server quyết định ───────────
  //
  // Khi khách chọn MOVI, trang đặt lượt giữ chỗ trên server (migration 055)
  // và nhận về mốc hết hạn. Đồng hồ đếm ngược đọc mốc đó.
  //
  // Vì sao phải gọi API thay vì tự đếm 30 phút:
  //   * mốc thời gian phải là của SERVER — client đóng tab là mất trắng, và
  // Ưu tiên dùng PNR (booking_code) làm lookup target cho cả hold lẫn thanh toán
  // để mọi khách (dù chưa đăng nhập hoặc tra cứu lại vé) đều được cấp quyền qua canAccessBooking
  const effectiveLookupTarget =
    (bookingCode && bookingCode !== '—' ? bookingCode : null) ||
    (booking?.bookingCode && booking.bookingCode !== '—' ? booking.bookingCode : null) ||
    booking?.bookingId ||
    bookingId;

  const isPnrLookup = useMemo(() => {
    const src = searchParams?.get('source');
    if (src === 'manage') return true;
    if (typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search);
      if (sp.get('source') === 'manage') return true;
    }
    if (booking?.hold_expires_at || booking?.status === 'pending_hold') return true;
    return false;
  }, [searchParams, booking?.hold_expires_at, booking?.status]);

  useEffect(() => {
    if (!effectiveLookupTarget) return;
    let cancelled = false;
    import('qrcode')
      .then((QRCodeModule) => {
        const codeToEncode = bookingCodeLabel !== '—' ? bookingCodeLabel : effectiveLookupTarget;
        QRCodeModule.toDataURL(
          `VIETJET:${codeToEncode}`,
          {
            margin: 1,
            width: 140,
            color: { dark: '#111827', light: '#FFFFFF' },
          },
          (err, url) => {
            if (!cancelled && !err && url) {
              setMoviQrDataUrl(url);
            }
          }
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [effectiveLookupTarget, bookingCodeLabel]);

  const acquireMoviHold = useCallback(async () => {
    if (!effectiveLookupTarget) return;
    try {
      const data = await apiRequest<{
        hold?: { method?: string; expiresAt?: string; minutes?: number } | null;
      }>(`/api/dat-ve/${effectiveLookupTarget}/giu-cho`, {
        method: 'POST',
        body: { action: 'hold' },
      });
      if (data.hold?.expiresAt) {
        setMoviHoldExpiresAt(data.hold.expiresAt);
        setMoviHoldExpired(false);
      }
    } catch (err) {
      // Không giữ được chỗ thì vẫn cho khách thanh toán (đây là phương thức
      // thanh toán, không phải điều kiện được phép thanh toán) — nhưng phải
      // nói rõ, vì lúc đó không có ai hủy booking giúp khách.
      console.error('[MOVI] Failed to reserve the booking hold:', err);
      toast.error(
        'Không giữ được chỗ vé',
        'Vui lòng kiểm tra kết nối và thử lại. Mã đặt chỗ sẽ không tự hủy nếu chưa đặt giữ chỗ thành công.'
      );
    }
  }, [effectiveLookupTarget, toast]);

  useEffect(() => {
    if (paymentMethod !== 'movi') return;
    if (!effectiveLookupTarget) return;
    void acquireMoviHold();
  }, [paymentMethod, effectiveLookupTarget, acquireMoviHold]);

  /**
   * Đồng hồ đếm về 0 ⇒ báo cho server hủy booking NGAY, thay vì chờ một
   * request khác chạm vào nó. Endpoint cũng quét mọi lượt giữ chỗ quá hạn,
   * nên "tự hủy" không phụ thuộc vào việc khách còn mở trang này.
   */
  const handleMoviHoldExpired = useCallback(() => {
    if (!effectiveLookupTarget) return;
    void apiRequest<{ expired?: boolean; booking_status?: string }>(
      `/api/dat-ve/${effectiveLookupTarget}/giu-cho`,
      { method: 'POST', body: { action: 'expire' } }
    )
      .then((data) => {
        setMoviHoldExpired(true);
        if (data.expired || data.booking_status === 'cancelled') {
          toast.error(
            'Hết thời gian giữ chỗ',
            'Mã đặt chỗ đã bị hủy. Vui lòng đặt vé lại để tiếp tục.'
          );
        }
      })
      .catch((err) => console.error('[MOVI] Failed to expire the booking hold:', err));
  }, [effectiveLookupTarget, toast]);

  /** Gia hạn lượt giữ chỗ MOVI (nút "Gia hạn" của đồng hồ đếm ngược). */
  const renewMoviHold = useCallback(() => {
    void acquireMoviHold();
  }, [acquireMoviHold]);

  const effectiveBookingCode = useMemo(() => {
    if (bookingCode && bookingCode !== '—') return bookingCode;
    if (booking?.bookingCode && booking.bookingCode !== '—') return booking.bookingCode;
    if (bookingId && bookingId.length >= 6) {
      return bookingId
        .replace(/[^a-zA-Z0-9]/g, '')
        .slice(-6)
        .toUpperCase();
    }
    return '';
  }, [bookingCode, booking?.bookingCode, bookingId]);

  // Transfer content the customer must paste into their bank app. Admins
  // control the template (Admin → Ngân hàng); the amounts are rendered without
  // thousand separators so a receiving bank cannot misread them.
  // Mỗi phương thức thanh toán có trang cổng riêng tại
  // /thanh-toan/gateway/<method> — cổng đó tự tải lại booking và gọi API,
  // nên ở đây chỉ cần chuyển hướng kèm bookingId + mã giảm giá (nếu có).
  const GATEWAY_METHOD_BY_GROUP: Record<string, string> = {
    vnpay_qr: 'qr',
    vietqr: 'qr',
    vnpay_dom: 'qr',
    napas: 'napas',
    card: 'card',
    applepay: 'card',
    googlepay: 'card',
    momo: 'ewallet',
    zalopay: 'ewallet',
    skypoint: 'skypoint',
    movi: 'movi',
    wallet: 'wallet',
    bank: 'bank',
  };

  const goToPaymentGateway = () => {
    const gatewayMethod = GATEWAY_METHOD_BY_GROUP[selectedMethodGroup] || 'qr';
    const params = new URLSearchParams();
    const target = effectiveBookingCode || bookingId;
    if (target) params.set('bookingId', target);
    if (promoApplied && promoData?.code) {
      params.set('promo', promoData.code);
      params.set('promoDiscount', String(discountAmount));
    }
    const qs = params.toString();
    router.push(`/thanh-toan/gateway/${gatewayMethod}${qs ? `?${qs}` : ''}`);
  };

  const transferNote = useMemo(
    () =>
      renderTransferNote(selectedAdminAccount?.transfer_note_template, {
        code:
          effectiveBookingCode ||
          (bookingCodeLabel !== '—' ? bookingCodeLabel : booking?.flightNo || 'VJ'),
        originalAmount: booking?.total ?? 0,
        discountAmount,
        amount: total,
        discountCode: promoData?.code ?? '',
      }),
    [
      selectedAdminAccount?.transfer_note_template,
      effectiveBookingCode,
      bookingCodeLabel,
      booking?.flightNo,
      booking?.total,
      discountAmount,
      total,
      promoData?.code,
    ]
  );

  // Tự động điền nội dung và số tiền chuyển khoản dự kiến nếu khách chưa nhập.
  //
  // Hai effect này PHẢI ghi đè giá trị đang có, không chỉ điền khi ô còn
  // trống. Trước đây điều kiện là `!transferNoteInput` / `!transferAmountInput`,
  // nên ở lần render đầu tiên `bookingCodeLabel` còn là '—' và `total` bằng 0
  // ⇒ ô nhận giá trị tạm '—I98O'. Khi PNR và tổng tiền tải về sau, điều kiện
  // đó không còn đúng nữa ⇒ ô vẫn giữ '—I98O' ⇒ server trả 400
  // "Transfer details do not match" dù khách đã nhập đúng.
  useEffect(() => {
    if (transferNote) {
      setTransferNoteInput(transferNote);
    }
  }, [transferNote]);

  useEffect(() => {
    if (total > 0) {
      setTransferAmountInput(String(total));
    }
  }, [total]);

  const applyPromo = async () => {
    if (!promoCode.trim()) return;
    setPromoError('');
    setIsApplyingPromo(true);
    try {
      const data = await apiRequest<{
        valid: boolean;
        discount: typeof promoData;
        message?: string;
      }>('/api/ma-giam-gia/xac-thuc', {
        method: 'POST',
        body: {
          code: promoCode,
          // The discount is sized against the booking total — the same base the
          // server uses. The page's own split into fare / tax / ancillary is
          // fabricated, so sending the fare subtotal here made a percentage
          // code worth a different amount on the two sides.
          bookingAmount: booking?.total || 0,
        },
      });
      if (data.valid) {
        setPromoApplied(true);
        setPromoData(data.discount);
        toast.success('Thành công', 'Đã áp dụng mã giảm giá');
      } else {
        setPromoApplied(false);
        setPromoData(null);
        setPromoError(data.message || 'Mã giảm giá không hợp lệ');
      }
    } catch (error) {
      setPromoApplied(false);
      setPromoData(null);
      setPromoError(
        error instanceof ApiRequestError ? error.message : 'Có lỗi xảy ra khi kiểm tra mã giảm giá'
      );
    } finally {
      setIsApplyingPromo(false);
    }
  };

  const executeMoviPayment = async () => {
    setShowMoviModal(false);
    setLoading(true);
    setPaymentError(null);
    setShowErrorModal(false);
    try {
      const targetBookingId = effectiveLookupTarget || booking?.bookingId || bookingId;
      if (!targetBookingId) {
        throw new Error('Không tìm thấy thông tin đặt chỗ');
      }

      await createPayment({
        booking_id: targetBookingId,
        return_booking_id: booking?.returnBookingId || undefined,
        method: 'movi',
        amount: cashDue,
        discount_code_id: promoData?.id ?? undefined,
        discount_amount: discountAmount,
        discount_code: promoData?.code,
        bank_account_id: selectedAdminAccount?.id,
        transfer_note: `MOVI: ${moviFullName.trim()} - CCCD ${moviCccd.trim()} - SĐT ${moviPhone.trim()}`,
        transfer_amount: transferAmountInput.trim() || String(cashDue),
        receipt_image: receiptImage || undefined,
        points_to_redeem:
          useCashPlusPoints && cashPlusPointsRedeem > 0 ? cashPlusPointsRedeem : undefined,
        movi: {
          fullName: moviFullName.trim(),
          birthDate: moviBirthDate.trim(),
          nationalId: moviCccd.trim(),
          phone: moviPhone.trim(),
          tenor: MOVI_DEFAULT_TENOR,
        },
      });

      setLoading(false);
      setConfirmed(true);
      toast.success('Thanh toán thành công!', 'Vé điện tử đã được gửi đến email của bạn.', {
        duration: 6000,
      });
    } catch (err) {
      setLoading(false);
      const errMsg =
        (err instanceof Error && err.message) ||
        'Thanh toán thất bại. Vui lòng kiểm tra thông tin và thử lại.';
      setPaymentError(errMsg);
      setShowErrorModal(true);
    }
  };

  const handleCloseMoviModal = () => {
    setShowMoviModal(false);
    toast.info(
      `Mã đặt chỗ của bạn: ${bookingCodeLabel}`,
      'Vé đã được giữ chỗ trong vòng 30 phút. Bạn có thể kiểm tra và thanh toán tại mục Chuyến bay của tôi.'
    );
  };

  const shareText = useMemo(() => {
    if (!booking) return 'Tôi vừa đặt vé thành công trên Vietjet Air!';
    return `Tôi vừa đặt vé thành công trên Vietjet Air!\n✈️ ${booking.flightNo}: ${booking.fromCity} → ${booking.toCity}\n📅 ${booking.date} | ${booking.departTime} - ${booking.arriveTime}\n🎫 Mã đặt chỗ: ${bookingCodeLabel}`;
  }, [booking, bookingCodeLabel]);

  const handleShareNative = useCallback(async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Đặt vé Vietjet Air thành công!', text: shareText });
      } catch {
        /* ignore */
      }
    }
  }, [shareText]);


  const handleReceiptFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processReceiptFile(file);
  };

  const handleReceiptDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingReceipt(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processReceiptFile(file);
  };

  if (pageLoading || isBookingLoading) {
    return <PaymentSkeleton />;
  }

  /**
   * Chưa có đơn đặt vé ⇒ không có gì để thanh toán.
   *
   * Đây là trạng thái thật: khách mở `/thanh-toan` mà chưa đi qua luồng đặt vé
   * (mở tab mới, quay lại sau khi session hết hạn, bấm link trực tiếp). Trước
   * đây trang dựng một booking giả và hiện một vé điện tử hoàn chỉnh — chuyến
   * bay, giờ bay, hành khách, tổng tiền, QR chuyển khoản — cho một chuyến bay
   * không tồn tại. Khách đọc đó là vé của họ.
   */
  if (isBookingLoading) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-4 py-16">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin mx-auto mb-3" />
          <h2 className="text-sm font-bold text-gray-700 font-koho">
            Đang tải thông tin đặt chỗ...
          </h2>
        </div>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-4 py-16">
        <div className="max-w-md w-full text-center">
          <div className="w-20 h-20 mx-auto rounded-2xl bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-center">
            <Icon name="TicketIcon" size={36} className="text-[var(--foreground-subtle)]" />
          </div>
          <h1 className="mt-6 text-xl font-black font-koho text-[var(--vj-navy)]">
            Chưa có đơn đặt vé để thanh toán
          </h1>
          <p className="mt-3 text-sm text-[var(--foreground-muted)] leading-relaxed">
            Bạn chưa có đơn đặt vé nào đang chờ thanh toán. Hãy chọn chuyến bay và hoàn tất thông
            tin hành khách trước, hoặc xem các chuyến đã đặt của bạn.
          </p>
          <div className="mt-7 flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/tim-ve"
              className="vj-btn vj-btn-primary px-6 py-3 rounded-vj text-sm inline-flex items-center justify-center gap-2"
            >
              <Icon name="MagnifyingGlassIcon" size={16} />
              Tìm chuyến bay
            </Link>
            <Link
              href="/chuyen-bay-cua-toi"
              className="vj-btn vj-btn-outline px-6 py-3 rounded-vj text-sm inline-flex items-center justify-center gap-2"
            >
              <Icon name="TicketIcon" size={16} />
              Chuyến bay của tôi
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (confirmed) {
    return (
      <>
        <ConfettiCanvas />
        <ToastContainer toasts={toast.toasts} onDismiss={toast.dismiss} position="top-right" />

        <div className="pb-12 min-h-screen flex items-center justify-center">
          <div className="max-w-lg w-full mx-auto px-4">
            {/* Success state */}
            <div
              className="bg-white rounded-3xl border border-[var(--border)] overflow-hidden"
              style={{
                boxShadow: '0 32px 72px rgba(0,0,0,0.18), 0 12px 28px rgba(0,0,0,0.10)',
                animation: 'fadeInUp 0.5s ease-out',
              }}
            >
              {/* Header */}
              <div className="bg-gradient-red p-8 text-center relative overflow-hidden">
                <div
                  className="absolute inset-0 opacity-10"
                  style={{
                    backgroundImage:
                      "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
                  }}
                />
                <div className="relative z-10">
                  <AnimatedCheckmark />
                  <h2 className="text-2xl font-black font-koho text-white mb-1">
                    {paymentMethod === 'movi'
                      ? 'Thanh toán thành công! (Bay trước trả sau MOVI)'
                      : receiptImage
                        ? 'Đã ghi nhận thanh toán & ảnh biên lai!'
                        : 'Đặt vé thành công!'}
                  </h2>
                  <p className="text-white/90 text-sm font-medium">
                    {paymentMethod === 'movi'
                      ? 'Hồ sơ trả góp đã được ghi nhận. Thông tin chặng bay, vé, khách hàng và mã đặt chỗ được hiển thị bên dưới.'
                      : receiptImage
                        ? 'Ảnh biên lai đã được gửi đến Hệ Thống đối chiếu. Vé điện tử sẽ được kích hoạt ngay khi kiểm tra.'
                        : 'Vé điện tử đã được gửi đến email của bạn'}
                  </p>
                </div>
              </div>

              {/* ─── MOVI: bốn khối thông tin khách phải thấy ───────────────────
                  Thông tin chặng bay · Thông tin vé · Thông tin khách hàng ·
                  Mã đặt chỗ. Bốn khối này nằm ngay dưới tiêu đề "thanh toán
                  thành công" vì đó là câu hỏi đầu tiên của khách sau khi
                  chọn "mua trước trả sau": vé của tôi đi đâu, ai đi, và mã
                  đặt chỗ là gì. */}
              {paymentMethod === 'movi' && booking && (
                <div className="p-6 space-y-4">
                  {/* Mã đặt chỗ */}
                  <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-[var(--foreground-subtle)] mb-2">
                      Mã đặt chỗ
                    </h3>
                    <div className="text-3xl font-black text-primary tracking-widest">
                      {bookingCodeLabel}
                    </div>
                    <p className="text-xs text-[var(--foreground-subtle)] mt-1">
                      Dùng mã này để tra cứu chuyến bay, làm thủ tục và liên hệ bộ phận hỗ trợ.
                    </p>
                  </section>

                  {/* Thông tin chặng bay */}
                  <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-[var(--foreground-subtle)] mb-3">
                      Thông tin chặng bay
                    </h3>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-bold text-[var(--foreground)]">
                        {booking.flightNo}
                      </span>
                      <span className="text-xs text-[var(--foreground-subtle)]">
                        {formatBookingDay(booking.date)}
                      </span>
                    </div>
                    <div className="flex items-center gap-4">
                      <div>
                        <div className="text-2xl font-black text-[var(--foreground)]">
                          {booking.departTime}
                        </div>
                        <div className="text-xs font-semibold text-[var(--foreground-muted)]">
                          {booking.from}
                        </div>
                        <div className="text-xs text-[var(--foreground-subtle)]">
                          {booking.fromCity}
                        </div>
                      </div>
                      <div className="flex-1 flex flex-col items-center">
                        <Icon name="PaperAirplaneIcon" size={20} className="text-primary" />
                        <div className="text-xs text-[var(--foreground-subtle)] mt-1">
                          Bay thẳng
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-black text-[var(--foreground)]">
                          {booking.arriveTime}
                        </div>
                        <div className="text-xs font-semibold text-[var(--foreground-muted)]">
                          {booking.to}
                        </div>
                        <div className="text-xs text-[var(--foreground-subtle)]">
                          {booking.toCity}
                        </div>
                      </div>
                    </div>
                    {booking.returnFlightNo && (
                      <div className="mt-4 pt-4 border-t border-[var(--border)]">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-xs font-bold text-[var(--foreground-subtle)]">
                            {booking.returnFlightNo} (Chiều về)
                          </span>
                          <span className="text-xs text-[var(--foreground-subtle)]">
                            {booking.returnDate ? formatBookingDay(booking.returnDate) : ''}
                          </span>
                        </div>
                        <div className="flex items-center gap-4">
                          <div>
                            <div className="text-2xl font-black text-[var(--foreground)]">
                              {booking.returnDepartTime || '—'}
                            </div>
                            <div className="text-xs font-semibold text-[var(--foreground-muted)]">
                              {booking.to}
                            </div>
                          </div>
                          <div className="flex-1 flex flex-col items-center">
                            <Icon
                              name="PaperAirplaneIcon"
                              size={20}
                              className="text-primary rotate-180"
                            />
                            <div className="text-xs text-[var(--foreground-subtle)] mt-1">
                              Bay thẳng
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-2xl font-black text-[var(--foreground)]">
                              {booking.returnArriveTime || '—'}
                            </div>
                            <div className="text-xs font-semibold text-[var(--foreground-muted)]">
                              {booking.from}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </section>

                  {/* Thông tin vé */}
                  <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-[var(--foreground-subtle)] mb-3">
                      Thông tin vé
                    </h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between items-center">
                        <span className="text-[var(--foreground-muted)]">Hạng vé</span>
                        <span className="font-semibold text-[var(--foreground)]">Phổ thông</span>
                      </div>
                      <div className="border-t border-dashed border-[var(--border)]" />
                      <div className="flex justify-between items-center">
                        <span className="text-[var(--foreground-muted)]">Số hành khách</span>
                        <span className="font-semibold text-[var(--foreground)]">
                          {booking.passengers.length}
                        </span>
                      </div>
                      <div className="border-t border-dashed border-[var(--border)]" />
                      <div className="flex justify-between items-center">
                        <span className="text-[var(--foreground-muted)]">Tổng tiền vé</span>
                        <span className="font-bold text-primary">
                          {total.toLocaleString('vi-VN')}₫
                        </span>
                      </div>
                      <div className="border-t border-dashed border-[var(--border)]" />
                      <div className="flex justify-between items-center">
                        <span className="text-[var(--foreground-muted)]">
                          Phương thức thanh toán
                        </span>
                        <span className="font-semibold text-[var(--foreground)]">
                          Bay trước trả sau (MOVI)
                        </span>
                      </div>
                    </div>
                  </section>

                  {/* Thông tin khách hàng */}
                  <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-[var(--foreground-subtle)] mb-3">
                      Thông tin khách hàng
                    </h3>
                    {booking.passengers.map(
                      (p: { name: string; seat: string; returnSeat?: string }, i: number) => (
                        <div
                          key={i}
                          className="flex items-center justify-between py-2 border-b border-[var(--border)] last:border-b-0"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-primary-50 rounded-full flex items-center justify-center">
                              <Icon name="UserIcon" size={14} className="text-primary" />
                            </div>
                            <div>
                              <div className="font-semibold text-[var(--foreground)] text-sm">
                                {p.name}
                              </div>
                              <div className="text-xs text-[var(--foreground-subtle)]">
                                Hành khách {i + 1}
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-bold text-[var(--foreground)]">
                              {p.returnSeat
                                ? `Đi: ${p.seat} | Về: ${p.returnSeat}`
                                : `Ghế ${p.seat}`}
                            </div>
                            <div className="text-xs text-[var(--foreground-subtle)]">Phổ thông</div>
                          </div>
                        </div>
                      )
                    )}
                    <div className="mt-3 pt-3 border-t border-[var(--border)]">
                      <div className="text-xs font-bold uppercase tracking-widest text-[var(--foreground-subtle)] mb-2">
                        Người đăng ký trả góp
                      </div>
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between items-center">
                          <span className="text-[var(--foreground-muted)]">Họ và tên</span>
                          <span className="font-semibold text-[var(--foreground)]">
                            {moviFullName.trim() || '—'}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-[var(--foreground-muted)]">Ngày sinh</span>
                          <span className="font-semibold text-[var(--foreground)]">
                            {moviBirthDate.trim() || '—'}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-[var(--foreground-muted)]">Số điện thoại</span>
                          <span className="font-semibold text-[var(--foreground)]">
                            {moviPhone.trim() || '—'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </section>
                </div>
              )}

              {/* E-Ticket */}
              <div className="p-6">
                {/* Booking code with copy button */}
                <div className="text-center mb-6">
                  <div className="text-xs font-bold text-[var(--foreground-subtle)] uppercase tracking-widest mb-2">
                    Mã đặt chỗ
                  </div>
                  <div className="flex items-center justify-center gap-3">
                    <div className="text-3xl font-black text-primary tracking-widest">
                      {bookingCodeLabel}
                    </div>
                    {/* Nút sao chép mã đặt chỗ đã được xóa theo yêu cầu thiết kế */}
                  </div>
                </div>

                {/* Dashed divider */}
                <div className="relative my-5">
                  <div className="border-t-2 border-dashed border-[var(--border)] " />
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-4 bg-[var(--surface)] rounded-full -ml-2 border border-[var(--border)] " />
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 bg-[var(--surface)] rounded-full -mr-2 border border-[var(--border)] " />
                </div>

                {/* Flight info */}
                <div className="bg-[var(--surface)] rounded-2xl p-4 mb-4">
                  {booking && (
                    <>
                      <div className="flex items-center justify-between mb-3">
                        <div className="text-xs font-bold text-[var(--foreground-subtle)]">
                          {booking.flightNo}
                        </div>
                        <div className="text-xs text-[var(--foreground-subtle)]">
                          {formatBookingDay(booking.date)}
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div>
                          <div className="text-2xl font-black text-[var(--foreground)]">
                            {booking.departTime}
                          </div>
                          <div className="text-xs font-semibold text-[var(--foreground-muted)]">
                            {booking.from}
                          </div>
                          <div className="text-xs text-[var(--foreground-subtle)]">
                            {booking.fromCity}
                          </div>
                        </div>
                        <div className="flex-1 flex flex-col items-center">
                          <Icon name="AirplaneIcon" size={20} className="text-primary rotate-90" />
                          <div className="text-xs text-[var(--foreground-subtle)] mt-1">
                            Bay thẳng
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-black text-[var(--foreground)]">
                            {booking.arriveTime}
                          </div>
                          <div className="text-xs font-semibold text-[var(--foreground-muted)]">
                            {booking.to}
                          </div>
                          <div className="text-xs text-[var(--foreground-subtle)]">
                            {booking.toCity}
                          </div>
                        </div>
                      </div>

                      {booking.returnFlightNo && (
                        <div className="mt-4 pt-4 border-t border-[var(--border)]">
                          <div className="flex items-center justify-between mb-3">
                            <div className="text-xs font-bold text-[var(--foreground-subtle)]">
                              {booking.returnFlightNo} (Chiều về)
                            </div>
                            <div className="text-xs text-[var(--foreground-subtle)]">
                              {booking.returnDate ? formatBookingDay(booking.returnDate) : ''}
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <div>
                              <div className="text-2xl font-black text-[var(--foreground)]">
                                {booking.returnDepartTime || '—'}
                              </div>
                              <div className="text-xs font-semibold text-[var(--foreground-muted)]">
                                {booking.to}
                              </div>
                              <div className="text-xs text-[var(--foreground-subtle)]">
                                {booking.toCity}
                              </div>
                            </div>
                            <div className="flex-1 flex flex-col items-center">
                              <Icon
                                name="AirplaneIcon"
                                size={20}
                                className="text-primary -rotate-90"
                              />
                              <div className="text-xs text-[var(--foreground-subtle)] mt-1">
                                Bay thẳng
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-2xl font-black text-[var(--foreground)]">
                                {booking.returnArriveTime || '—'}
                              </div>
                              <div className="text-xs font-semibold text-[var(--foreground-muted)]">
                                {booking.from}
                              </div>
                              <div className="text-xs text-[var(--foreground-subtle)]">
                                {booking.fromCity}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Passenger */}
                {booking?.passengers.map(
                  (p: { name: string; seat: string; returnSeat?: string }, i: number) => (
                    <div
                      key={i}
                      className="flex items-center justify-between py-3 border-b border-[var(--border)] "
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-primary-50 rounded-full flex items-center justify-center">
                          <Icon name="UserIcon" size={14} className="text-primary" />
                        </div>
                        <div>
                          <div className="font-semibold text-[var(--foreground)] text-sm">
                            {p.name}
                          </div>
                          <div className="text-xs text-[var(--foreground-subtle)]">
                            Hành khách {i + 1}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-[var(--foreground)]">
                          {p.returnSeat ? `Đi: ${p.seat} | Về: ${p.returnSeat}` : `Ghế ${p.seat}`}
                        </div>
                        <div className="text-xs text-[var(--foreground-subtle)]">Phổ thông</div>
                      </div>
                    </div>
                  )
                )}

                {/* Bank Payment Info — the receiving account, since the customer
                    no longer enters an account of their own. */}
                {paymentMethod === 'bank' && selectedAdminAccount && (
                  <div className="mt-4 bg-[rgb(var(--blue-rgb))]/10 border border-[rgb(var(--blue-rgb))]/30 rounded-vj p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-8 h-8 rounded-vj flex items-center justify-center text-white text-xs font-bold flex-shrink-0 bg-primary">
                        {selectedAdminAccount.admin_bank_name.substring(0, 2)}
                      </div>
                      <div>
                        <span className="text-xs font-bold text-[var(--blue)] uppercase tracking-wider block">
                          Thanh toán qua ngân hàng
                        </span>
                        <span className="text-xs text-[var(--blue)]">
                          {selectedAdminAccount.admin_bank_name}
                        </span>
                      </div>
                    </div>
                    <div className="space-y-2 text-sm bg-[var(--background)] rounded-vj p-3 border border-[rgb(var(--blue-rgb))]/20">
                      <div className="flex justify-between items-center">
                        <span className="text-[var(--foreground-muted)] text-xs">Số tài khoản</span>
                        <span className="font-mono font-bold text-[var(--foreground)]">
                          {selectedAdminAccount.admin_bank_account_number}
                        </span>
                      </div>
                      <div className="border-t border-dashed border-[var(--border)] " />
                      <div className="flex justify-between items-center">
                        <span className="text-[var(--foreground-muted)] text-xs">
                          Chủ tài khoản
                        </span>
                        <span className="font-semibold text-[var(--foreground)]">
                          {selectedAdminAccount.admin_bank_account_holder}
                        </span>
                      </div>
                      <div className="border-t border-dashed border-[var(--border)] " />
                      <div className="flex justify-between items-center">
                        <span className="text-[var(--foreground-muted)] text-xs">
                          Nội dung chuyển khoản
                        </span>
                        <span className="font-mono font-bold text-primary">{transferNote}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Total */}
                <div className="flex justify-between items-center mt-4 pt-4 border-t border-[var(--border)] ">
                  <span className="font-bold text-[var(--foreground-muted)]">Tổng thanh toán</span>
                  <span className="text-xl font-black text-primary">
                    {total.toLocaleString('vi-VN')}₫
                  </span>
                </div>

                {/* E-boarding passes — mỗi hành khách một thẻ, QR + mã vạch thật. */}
                <div className="mt-5 space-y-4">
                  <div className="text-xs font-bold text-[var(--foreground-subtle)] uppercase tracking-widest text-center">
                    Thẻ lên máy bay điện tử
                  </div>
                  {ticketData?.passengers.map((p, i) => (
                    <EBoardingPass key={i} data={ticketData} passenger={p} />
                  ))}
                </div>

                {/* Share section */}
                <div className="mt-5 pt-4 border-t border-[var(--border)] ">
                  <div className="text-xs font-bold text-[var(--foreground-subtle)] uppercase tracking-widest mb-3 text-center">
                    Chia sẻ chuyến bay
                  </div>
                  <div className="flex items-center justify-center gap-2">
                    {/* Facebook */}
                    <button
                      onClick={handleShareFacebook}
                      title="Chia sẻ lên Facebook"
                      className="flex items-center gap-2 px-4 py-2 rounded-vj bg-social-facebook text-white text-xs font-semibold hover:bg-social-facebook-hover transition-all hover:-translate-y-0.5 hover:shadow-vj-md"
                    >
                      <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
                        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                      </svg>
                      Facebook
                    </button>
                    {/* Twitter/X */}
                    <button
                      onClick={handleShareTwitter}
                      title="Chia sẻ lên X (Twitter)"
                      className="flex items-center gap-2 px-4 py-2 rounded-vj bg-[var(--foreground)] text-white text-xs font-semibold hover:bg-[var(--foreground-muted)] transition-all hover:-translate-y-0.5 hover:shadow-vj-md"
                    >
                      <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                      </svg>
                      X
                    </button>
                    {/* Native share (mobile) */}
                    {typeof navigator !== 'undefined' && 'share' in navigator && (
                      <button
                        onClick={handleShareNative}
                        title="Chia sẻ"
                        className="flex items-center gap-2 px-4 py-2 rounded-vj bg-[var(--surface-2)] text-[var(--foreground-muted)] text-xs font-semibold hover:bg-[var(--surface-3)] transition-all hover:-translate-y-0.5 hover:shadow-vj-md border border-[var(--border)] "
                      >
                        <Icon name="ShareIcon" size={14} />
                        Chia sẻ
                      </button>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="mt-6 flex flex-col gap-3">
                  <button
                    type="button"
                    onClick={handleDownloadETicket}
                    className="w-full flex items-center justify-center gap-2 bg-vjyellow hover:bg-accent-dark text-[var(--foreground)] font-black py-3.5 rounded-vj transition-all shadow-vj-btn hover:shadow-vj-btn-hover hover:-translate-y-0.5 text-sm"
                  >
                    <Icon name="ArrowDownTrayIcon" size={16} />
                    Tải vé điện tử (PDF)
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowItineraryModal(true)}
                    className="w-full flex items-center justify-center gap-2 bg-vj-booking-red hover:bg-vj-booking-red-hover text-white font-bold py-3.5 rounded-vj transition-all shadow-vj-sm text-sm cursor-pointer"
                  >
                    <Icon name="TicketIcon" size={16} />
                    Xem Hành trình & Vé điện tử (Vietjet Itinerary)
                  </button>
                  <Link
                    href={`/dat-ve/${bookingCode || bookingId || booking?.bookingId || ''}`}
                    className="w-full flex items-center justify-center gap-2 bg-vj-pill hover:bg-vj-surface-3 text-vj-text-strong font-bold py-3 rounded-vj transition-all text-sm"
                  >
                    <Icon name="DocumentTextIcon" size={16} />
                    Trang chi tiết vé #{bookingCodeLabel}
                  </Link>
                  <Link
                    href="/chuyen-bay-cua-toi"
                    className="vj-btn vj-btn-primary w-full py-3 rounded-vj text-sm"
                  >
                    <Icon name="HomeIcon" size={16} />
                    Chuyến bay của tôi
                  </Link>
                  <Link
                    href="/trang-chu"
                    className="w-full border border-[var(--border)] text-[var(--foreground-muted)] hover:bg-[var(--surface)] font-semibold py-2.5 rounded-vj transition-all text-sm text-center"
                  >
                    Về trang chủ
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>

        <ItineraryModal
          isOpen={showItineraryModal}
          onClose={() => setShowItineraryModal(false)}
          booking={itineraryBookingData}
        />
      </>
    );
  }

  return (
    <>
      {/* Trip strip — brand-yellow band directly under header matching Image #1 or Image #8 */}
      {isPnrLookup ? (
        <div
          className="bg-vj-yellow text-vj-dark shadow-vj-sm border-b border-amber-300 py-2.5 px-3 sm:px-6 z-20 font-koho sticky top-[74px]"
          data-testid="trip-board"
        >
          <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-y-1 text-2xs sm:text-xs">
            <div className="flex items-center gap-1.5 font-bold">
              <span>Mã đặt chỗ :</span>
              <span className="text-red-600 font-black text-xs sm:text-sm">{bookingCodeLabel}</span>
            </div>
            <div className="flex items-center gap-1.5 font-bold">
              <span>Trạng thái thanh toán :</span>
              <span className="text-red-600 font-black">Chưa thanh toán</span>
            </div>
            <div className="flex items-center gap-1 text-right font-bold">
              <span>Yêu cầu thanh toán :</span>
              <span className="text-red-600 font-black">{total.toLocaleString('vi-VN')} VND</span>
              {moviHoldExpiresAt && (
                <span className="text-red-600 text-3xs font-medium ml-1">
                  trước {formatHoldExpireDate(moviHoldExpiresAt)} (Theo giờ địa phương)
                </span>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div
          className="bg-vj-yellow text-vj-dark shadow-vj-sm border-b border-amber-300"
          data-testid="trip-board"
        >
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-x-3 px-3 py-2 sm:px-6 sm:py-2 text-xs">
            {/* Mobile compact summary */}
            <div className="flex sm:hidden items-center gap-2">
              <button
                type="button"
                onClick={() => setShowSummaryModal(true)}
                className="bg-white rounded-full px-2.5 py-1 text-2xs font-bold text-vj-text flex items-center gap-1 shadow-xs cursor-pointer hover:bg-vj-surface-2 active:scale-98 transition-all border border-amber-200 shrink-0"
              >
                <span>Tổng:</span>
                <span className="text-vj-red-dark font-bold">
                  {total > 0 ? `${total.toLocaleString('vi-VN')} VND` : '0 VND'}
                </span>
                <span className="text-3xs text-vj-gray">▾</span>
              </button>
              <div className="flex items-center gap-1 font-koho text-2xs font-semibold text-vj-text truncate">
                <span>{booking.fromCity || booking.from}</span>
                <span className="text-vj-red-dark">✈</span>
                <span>{booking.toCity || booking.to}</span>
              </div>
            </div>

            {/* Desktop matching Image #1: 2 lines */}
            <div className="hidden sm:flex flex-col font-koho leading-tight">
              <span className="font-bold text-xs uppercase tracking-normal text-vj-text">
                CHUYẾN BAY MỘT CHIỀU | {booking.passengers?.length || 1} Người lớn
              </span>
              <div className="text-3xs font-medium text-vj-text-strong flex items-center gap-2 mt-0.5">
                <span>
                  * Điểm khởi hành: {booking.fromCity || 'Tp. Hồ Chí Minh'} ({' '}
                  {booking.from || 'SGN'} )
                </span>
                <span>
                  * Điểm đến: {booking.toCity || 'Hà Nội'} ( {booking.to || 'HAN'} )
                </span>
              </div>
            </div>

            {/* 4 Green Circle Badges matching Image #1 */}
            <div className="flex items-center gap-2 font-koho">
              <div
                className="w-7 h-7 rounded-full bg-vj-pay-green text-white flex items-center justify-center shadow-xs cursor-default"
                title="1. Chuyến bay"
              >
                <Icon name="AirplaneIcon" size={13} className="rotate-90" />
              </div>
              <div
                className="w-7 h-7 rounded-full bg-vj-pay-green text-white flex items-center justify-center shadow-xs cursor-default"
                title="2. Hành khách"
              >
                <Icon name="UserIcon" size={13} />
              </div>
              <div
                className="w-7 h-7 rounded-full bg-vj-pay-green text-white flex items-center justify-center shadow-xs cursor-default"
                title="3. Dịch vụ"
              >
                <Icon name="BriefcaseIcon" size={13} />
              </div>
              <div
                className="w-7 h-7 rounded-full bg-vj-pay-green text-white flex items-center justify-center shadow-xs cursor-default font-bold text-xs leading-none"
                title="4. Thanh toán"
              >
                $
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="pt-4 sm:pt-6 pb-28 sm:pb-12">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          {/* Reservation Countdown Timer
           *
           * MOVI có đồng hồ RIÊNG, đếm theo mốc hết hạn do SERVER quyết
           * định (`bookings.hold_expires_at`, migration 055) — không phải
           * 15 phút của `sessionStorage`. Vì sao phải vậy:
           *
           *   - mốc thời gian giữ chỗ phải là của server; đồng hồ của trình
           *     duyệt là đồng hồ của RIÊNG một thiết bị, và chỉnh ngày giờ
           *     máy là thay đổi luật;
           *   - server phải biết booking nào đang được giữ chỗ để tự hủy nó
           *     khi hết hạn — không có cái đó thì "tự hủy sau 30 phút" không
           *     tồn tại;
           *   - khi đồng hồ về 0, `onExpire` báo server hủy NGAY, và
           *     `onRenew` gia hạn qua server (ghi vào `sessionStorage` thì
           *     đồng hồ lệch với mốc thật và vé vẫn bị hủy đúng lúc server
           *     nói hết hạn).
           */}
          {!isPnrLookup &&
            (paymentMethod === 'movi' ? (
              <ReservationCountdown
                initialMinutes={MOVI_HOLD_MINUTES}
                expiresAt={moviHoldExpiresAt}
                storageKey="vj_movi_reservation_expire_time"
                bookingCode={bookingCodeLabel !== '—' ? bookingCodeLabel : undefined}
                onExpire={handleMoviHoldExpired}
                onRenew={renewMoviHold}
              />
            ) : (
              <ReservationCountdown
                initialMinutes={15}
                bookingCode={bookingCodeLabel !== '—' ? bookingCodeLabel : undefined}
              />
            ))}

          {/* H1 for accessibility */}
          <h1 className="sr-only">Thanh toán vé máy bay</h1>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Payment Form */}
            <div className="lg:col-span-2 space-y-4">
              {/* Accordions Thông tin chuyến bay & hành khách khi tra cứu vé giữ chỗ chuẩn Image #8 */}
              {isPnrLookup && booking && (
                <div className="space-y-3 font-koho text-xs">
                  {/* 1. Thông tin chuyến bay */}
                  <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-2xs">
                    <button
                      type="button"
                      onClick={() => setShowFlightInfoAccordion((prev) => !prev)}
                      className="w-full flex items-center justify-between p-3.5 bg-gray-50/80 hover:bg-gray-100 transition-colors cursor-pointer text-left font-bold text-gray-900 border-b border-gray-100"
                    >
                      <span className="text-sm">Thông tin chuyến bay</span>
                      <span className="text-xs text-gray-500 font-mono">
                        {showFlightInfoAccordion ? '▲' : '▼'}
                      </span>
                    </button>
                    {showFlightInfoAccordion && (
                      <div className="p-4 space-y-2 text-gray-700 bg-white">
                        <div className="font-bold text-gray-900 text-sm">
                          Chuyến đi: {booking.from}-{booking.to}
                        </div>
                        <div className="text-red-600 font-semibold text-xs">
                          Số hiệu chuyến bay: {booking.flightNo}
                        </div>
                        <div className="text-xs leading-relaxed">
                          <span className="text-red-600 font-bold">* Khởi hành: </span>
                          <span>
                            {booking.departTime}, {formatBookingDay(booking.date)} (Giờ địa phương)
                          </span>
                          <div className="text-gray-500 ml-3">
                            {booking.fromCity} - Sân bay ({booking.from}) - Nhà ga 1
                          </div>
                        </div>
                        <div className="text-xs leading-relaxed">
                          <span className="text-vj-pay-green font-bold">• Đến: </span>
                          <span>
                            {booking.arriveTime}, {formatBookingDay(booking.date)} (Giờ địa phương)
                          </span>
                          <div className="text-gray-500 ml-3">
                            {booking.toCity} - Sân bay ({booking.to})
                          </div>
                        </div>
                        <div className="text-gray-500 text-3xs pt-1.5 border-t border-gray-100">
                          Thời gian: 2 giờ 10 phút &nbsp;|&nbsp; Airbus: A321 &nbsp;|&nbsp; Khai
                          thác bởi: Vietjet
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 2. Thông tin hành khách */}
                  <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-2xs">
                    <button
                      type="button"
                      onClick={() => setShowPaxInfoAccordion((prev) => !prev)}
                      className="w-full flex items-center justify-between p-3.5 bg-gray-50/80 hover:bg-gray-100 transition-colors cursor-pointer text-left font-bold text-gray-900 border-b border-gray-100"
                    >
                      <span className="text-sm">Thông tin hành khách</span>
                      <span className="text-xs text-gray-500 font-mono">
                        {showPaxInfoAccordion ? '▲' : '▼'}
                      </span>
                    </button>
                    {showPaxInfoAccordion && (
                      <div className="p-4 space-y-1.5 text-gray-700 bg-white text-xs">
                        <div className="font-bold text-gray-900 flex items-center gap-1.5">
                          <span>👤</span>
                          <span>Người lớn: {booking.passengers?.[0]?.name || '—'}</span>
                        </div>
                        <div className="font-semibold text-gray-600">
                          {booking.from} ➔ {booking.to}
                        </div>
                        <div>
                          Số ghế: {booking.flightNo}-{booking.passengers?.[0]?.seat || '15A'}
                        </div>
                        <div>Hành lý ký gửi: Gói 20kg</div>
                      </div>
                    )}
                  </div>
                </div>
              )}
              {/* Payment Method Card */}
              <div className="bg-white rounded-2xl border border-[var(--border)] p-4 sm:p-5 shadow-vj-sm">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-bold font-koho text-vj-text">
                      Phương thức thanh toán
                    </h2>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-vj-gray font-koho">
                    <span>Được xử lý bởi Cổng thanh toán</span>
                    <GalaxyPayBadge />
                  </div>
                </div>

                {/* 1. Thẻ và tài khoản ngân hàng (Screenshot 3) */}
                <div className="mb-5">
                  <h3 className="text-2xl3 font-semibold font-koho uppercase text-vj-text tracking-normal mb-2.5">
                    Thẻ và tài khoản ngân hàng
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {/* 1. Quét mã QR VNPAY (Khuyên dùng - Mặc định) */}
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedMethodGroup('vnpay_qr');
                        setPaymentMethod('vietqr');
                      }}
                      className={`p-3 rounded-vj border flex flex-col justify-between text-left transition-all cursor-pointer min-h-[96px] relative overflow-hidden ${
                        selectedMethodGroup === 'vnpay_qr'
                          ? 'border-2 border-primary bg-[rgb(var(--vj-red-rgb))]/10 shadow-xs'
                          : 'border-vj-border-light hover:border-vj-line bg-white'
                      }`}
                    >
                      <div className="absolute top-0 right-0 bg-primary text-white text-4xs font-black px-1.5 py-0.5 rounded-bl-md uppercase tracking-wider">
                        Khuyên dùng
                      </div>
                      <div className="flex items-center h-8">
                        <VnpayLogo className="h-5 w-auto max-w-[104px]" />
                      </div>
                      <span className="text-xs font-bold text-vj-text mt-2 line-clamp-2 leading-tight">
                        Quét mã VNPAY-QR
                      </span>
                    </button>

                    {/* 2. Mobile Banking VietQR */}
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedMethodGroup('vietqr');
                        setPaymentMethod('vietqr');
                      }}
                      className={`p-3 rounded-vj border flex flex-col justify-between text-left transition-all cursor-pointer min-h-[96px] relative overflow-hidden ${
                        selectedMethodGroup === 'vietqr'
                          ? 'border-2 border-primary bg-[rgb(var(--vj-red-rgb))]/10 shadow-xs'
                          : 'border-vj-border-light hover:border-vj-line bg-white'
                      }`}
                    >
                      <div className="flex items-center h-8">
                        <VietQrLogo className="h-5 w-auto max-w-[104px]" />
                      </div>
                      <span className="text-xs font-bold text-vj-text mt-2 line-clamp-2 leading-tight">
                        Mobile Banking VietQR
                      </span>
                    </button>

                    {/* 3. Thẻ ATM nội địa Napas */}
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedMethodGroup('napas');
                        setPaymentMethod('bank');
                      }}
                      className={`p-3 rounded-vj border flex flex-col justify-between text-left transition-all cursor-pointer min-h-[96px] ${
                        selectedMethodGroup === 'napas'
                          ? 'border-2 border-primary bg-[rgb(var(--vj-red-rgb))]/10 shadow-xs'
                          : 'border-vj-border-light hover:border-vj-line bg-white'
                      }`}
                    >
                      <div className="flex items-center h-8">
                        <NapasLogo className="h-4 w-auto max-w-[104px]" />
                      </div>
                      <span className="text-xs font-bold text-vj-text mt-2">Thẻ ATM nội địa</span>
                    </button>

                    {/* 4. Thẻ tín dụng / ghi nợ quốc tế */}
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedMethodGroup('card');
                        setPaymentMethod('card');
                      }}
                      className={`p-3 rounded-vj border flex flex-col justify-between text-left transition-all cursor-pointer min-h-[96px] ${
                        selectedMethodGroup === 'card'
                          ? 'border-2 border-primary bg-[rgb(var(--vj-red-rgb))]/10 shadow-xs'
                          : 'border-vj-border-light hover:border-vj-line bg-white'
                      }`}
                    >
                      {/* Bốn logo mạng thẻ xếp 2×2 để không bị chồng lên nhau */}
                      <div className="grid grid-cols-2 gap-x-2 gap-y-1 h-8 items-center">
                        <VisaLogo className="h-4 w-auto" />
                        <MastercardLogo className="h-4 w-auto" />
                        <JcbLogo className="h-4 w-auto" />
                        <AmexLogo className="h-4 w-auto" />
                      </div>
                      <span className="text-xs font-bold text-vj-text mt-2 line-clamp-2 leading-tight">
                        Thẻ tín dụng / ghi nợ quốc tế
                      </span>
                    </button>

                    {/* 5. Thanh toán nội địa VNPAY */}
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedMethodGroup('vnpay_dom');
                        setPaymentMethod('vietqr');
                      }}
                      className={`p-3 rounded-vj border flex flex-col justify-between text-left transition-all cursor-pointer min-h-[96px] ${
                        selectedMethodGroup === 'vnpay_dom'
                          ? 'border-2 border-primary bg-[rgb(var(--vj-red-rgb))]/10 shadow-xs'
                          : 'border-vj-border-light hover:border-vj-line bg-white'
                      }`}
                    >
                      <div className="flex items-center h-8">
                        <VnpayLogo className="h-4 w-auto max-w-[104px]" />
                      </div>
                      <span className="text-xs font-bold text-vj-text mt-2 line-clamp-2 leading-tight">
                        Thanh toán nội địa VNPAY
                      </span>
                    </button>
                  </div>
                </div>

                {/* 2. Ví điện tử (Screenshot 3) */}
                <div className="mb-5">
                  <h3 className="text-2xl3 font-semibold font-koho uppercase text-vj-text tracking-normal mb-2.5">
                    Ví điện tử
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {/* SkyJoy (ví tích lũy / điểm SkyPoint) */}
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedMethodGroup('skypay');
                        setPaymentMethod('skypoint');
                      }}
                      className={`p-3 rounded-vj border flex flex-col justify-between text-left transition-all cursor-pointer min-h-[90px] ${
                        selectedMethodGroup === 'skypay'
                          ? 'border-2 border-primary bg-[rgb(var(--vj-red-rgb))]/10 shadow-xs'
                          : 'border-vj-border-light hover:border-vj-line bg-white'
                      }`}
                    >
                      <div className="flex items-center h-8">
                        <SkyJoyLogo className="h-7 w-auto" />
                      </div>
                      <span className="text-xs font-bold text-vj-text mt-2">Ví SkyJoy</span>
                    </button>

                    {/* MoMo */}
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedMethodGroup('momo');
                        setPaymentMethod('e_wallet');
                      }}
                      className={`p-3 rounded-vj border flex flex-col justify-between text-left transition-all cursor-pointer min-h-[90px] ${
                        selectedMethodGroup === 'momo'
                          ? 'border-2 border-primary bg-[rgb(var(--vj-red-rgb))]/10 shadow-xs'
                          : 'border-vj-border-light hover:border-vj-line bg-white'
                      }`}
                    >
                      <div className="flex items-center h-8">
                        <MomoLogo className="h-7 w-auto" />
                      </div>
                      <span className="text-xs font-bold text-vj-text mt-2">Ví MoMo</span>
                    </button>

                    {/* ZaloPay */}
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedMethodGroup('zalopay');
                        setPaymentMethod('e_wallet');
                      }}
                      className={`p-3 rounded-vj border flex flex-col justify-between text-left transition-all cursor-pointer min-h-[90px] ${
                        selectedMethodGroup === 'zalopay'
                          ? 'border-2 border-primary bg-[rgb(var(--vj-red-rgb))]/10 shadow-xs'
                          : 'border-vj-border-light hover:border-vj-line bg-white'
                      }`}
                    >
                      <div className="flex items-center h-8">
                        <ZaloPayLogo className="h-5 w-auto max-w-[104px]" />
                      </div>
                      <span className="text-xs font-bold text-vj-text mt-2">Ví ZaloPay</span>
                    </button>

                    {/* Apple Pay */}
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedMethodGroup('applepay');
                        setPaymentMethod('card');
                      }}
                      className={`p-3 rounded-vj border flex flex-col justify-between text-left transition-all cursor-pointer min-h-[90px] ${
                        selectedMethodGroup === 'applepay'
                          ? 'border-2 border-primary bg-[rgb(var(--vj-red-rgb))]/10 shadow-xs'
                          : 'border-vj-border-light hover:border-vj-line bg-white'
                      }`}
                    >
                      <div className="flex items-center h-8">
                        <ApplePayLogo className="h-6 w-auto max-w-[104px]" />
                      </div>
                      <span className="text-xs font-bold text-vj-text mt-2">Apple Pay</span>
                    </button>

                    {/* Google Pay */}
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedMethodGroup('googlepay');
                        setPaymentMethod('card');
                      }}
                      className={`p-3 rounded-vj border flex flex-col justify-between text-left transition-all cursor-pointer min-h-[90px] ${
                        selectedMethodGroup === 'googlepay'
                          ? 'border-2 border-primary bg-[rgb(var(--vj-red-rgb))]/10 shadow-xs'
                          : 'border-vj-border-light hover:border-vj-line bg-white'
                      }`}
                    >
                      <div className="flex items-center h-8">
                        <GooglePayLogo className="h-5 w-auto max-w-[104px]" />
                      </div>
                      <span className="text-xs font-bold text-vj-text mt-2">Google Pay</span>
                    </button>
                  </div>
                </div>

                {/* 3. Giữ mã đặt chỗ & thanh toán sau (Screenshot 4) */}
                <div className="mb-5">
                  <h3 className="text-2xl3 font-semibold font-koho uppercase text-vj-text tracking-normal mb-2.5">
                    Giữ mã đặt chỗ & thanh toán sau
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedMethodGroup('movi');
                        setPaymentMethod('movi');
                      }}
                      className={`p-3 rounded-vj border flex flex-col justify-between text-left transition-all cursor-pointer min-h-[90px] ${
                        selectedMethodGroup === 'movi'
                          ? 'border-2 border-primary bg-[rgb(var(--vj-red-rgb))]/10 shadow-xs'
                          : 'border-vj-border-light hover:border-vj-line bg-white'
                      }`}
                    >
                      <div className="flex items-center h-8">
                        <MoviLogo className="h-6 w-auto max-w-[104px]" />
                      </div>
                      <span className="text-4xs text-vj-gray font-medium block mt-0.5">
                        Bay trước, trả sau
                      </span>
                      <span className="text-xs font-bold text-vj-text mt-1">Trả góp Movi</span>
                    </button>
                  </div>
                </div>

                {/* Giao diện áp mã giảm giá — Chung 1 vùng (ẩn khi chọn MOVI theo đúng Image #1) */}
                {paymentMethod !== 'movi' && (
                  <div className="pt-4 border-t border-vj-border-light">
                    <label className="flex items-center gap-3 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={hasPromoChecked}
                        onChange={(e) => setHasPromoChecked(e.target.checked)}
                        className="w-5 h-5 rounded border-vj-line text-vj-red-dark focus:ring-red-500 cursor-pointer accent-red-600"
                      />
                      <span className="text-sm font-extrabold text-vj-text font-koho">
                        Mã khuyến mãi hoặc phiếu quà tặng
                      </span>
                    </label>
                    {hasPromoChecked && (
                      <div className="mt-3 pt-3 border-t border-vj-border-light flex gap-2 font-koho">
                        <input
                          type="text"
                          value={promoCode}
                          onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                          placeholder="Nhập mã khuyến mãi"
                          className="flex-1 px-3 py-2 bg-white border border-vj-line rounded-vj text-xs uppercase font-bold outline-none focus:border-red-500 font-koho"
                        />
                        <button
                          type="button"
                          onClick={applyPromo}
                          disabled={isApplyingPromo || !promoCode.trim()}
                          className="bg-vjyellow hover:bg-vjamber disabled:opacity-50 text-black font-black text-xs px-4 py-2 rounded-vj cursor-pointer transition-colors font-koho"
                        >
                          {isApplyingPromo ? 'Đang kiểm tra...' : 'Áp dụng'}
                        </button>
                      </div>
                    )}
                    {promoApplied && promoData && (
                      <div className="mt-2 text-xs font-bold text-green-700 flex items-center gap-1 font-koho">
                        <span>✓</span> Đã áp dụng mã {promoData.code}: -
                        {promoData.discountAmount.toLocaleString('vi-VN')} VND
                      </div>
                    )}
                    {promoError && (
                      <div className="mt-2 text-xs font-semibold text-vj-red-dark font-koho">
                        {promoError}
                      </div>
                    )}
                  </div>
                )}

                {/* CTA dẫn sang cổng thanh toán riêng của từng phương thức */}
                <div className="pt-4 border-t border-vj-border-light space-y-3">
                  <button
                    type="button"
                    onClick={goToPaymentGateway}
                    className="w-full py-3.5 rounded-vj bg-primary hover:bg-primary-dark text-white font-black text-sm uppercase tracking-wide transition-all shadow-vj-md cursor-pointer"
                  >
                    Tiếp tục thanh toán
                    {total > 0 ? ` • ${total.toLocaleString('vi-VN')}₫` : ''}
                  </button>
                  <p className="text-3xs text-vj-muted text-center font-koho">
                    Bạn sẽ được chuyển đến cổng bảo mật để hoàn tất thanh toán.
                  </p>
                </div>

                {/* Security and Accepted Logos Footer - hidden on MOVI matching Image #1 */}
                {paymentMethod !== 'movi' && <PaymentSecurityFooter />}
              </div>

              {/* Security note - hidden on MOVI matching Image #1 */}
              {paymentMethod !== 'movi' && (
                <div className="flex items-center gap-3 bg-[rgb(var(--vj-green-rgb))]/10 border border-[rgb(var(--vj-green-rgb))]/30 rounded-vj p-4 text-sm text-[var(--vj-green)]">
                  <Icon
                    name="ShieldCheckIcon"
                    size={20}
                    className="text-[var(--vj-green)] flex-shrink-0"
                  />
                  <span>
                    Thanh toán được bảo mật bằng mã hóa SSL 256-bit. Thông tin thẻ của bạn an toàn
                    tuyệt đối.
                  </span>
                </div>
              )}
            </div>

            {/* Order Summary */}
            <div className="lg:col-span-1 space-y-4">
              {/* Realistic Vietjet Ticket Card */}
              <BookingTicketCard
                flightNo={booking.flightNo}
                from={booking.from}
                to={booking.to}
                fromCity={booking.fromCity}
                toCity={booking.toCity}
                departTime={booking.departTime}
                arriveTime={booking.arriveTime}
                date={booking.date ? formatBookingDay(booking.date) : ''}
                bookingCode={bookingCodeLabel !== '—' ? bookingCodeLabel : undefined}
                passengers={booking.passengers}
                fareClass="Eco"
                ancillaries={
                  booking.ancillaries?.length
                    ? (booking.ancillaries
                        .map((id) => ANCILLARY_OPTIONS.find((o) => o.id === id)?.title)
                        .filter(Boolean) as string[])
                    : ['Hành lý xách tay 7kg']
                }
                fareSubtotal={booking.fareSubtotal ?? 1738800}
                tax={booking.tax ?? 581581}
                seatFee={booking.seatFee ?? 259200}
                ancillaryFee={booking.ancillaryFee ?? 44000}
                total={total}
                onOpenDetails={() => setShowSummaryModal(true)}
              />

              {paymentMethod !== 'movi' && (
                <div className="bg-white rounded-2xl border border-[var(--border)] p-5 sticky top-[140px] shadow-vj-sm">
                  <h3 className="font-extrabold text-sm text-[var(--foreground)] mb-3">
                    Chi tiết giá & thanh toán
                  </h3>

                  {/* Promo code — chuẩn underline MUI 40px Vietjet live */}
                  <div className="mt-4">
                    <label className="block text-xs font-semibold text-[var(--foreground-subtle)] uppercase tracking-wider mb-1.5">
                      Mã khuyến mãi
                    </label>
                    <div className="flex items-center gap-2">
                      <div className="vj-lookup-field relative flex-1 mt-2 flex items-center h-[42px] px-3 bg-white border border-vj-line rounded-vj shadow-2xs focus-within:border-primary focus-within:ring-1 focus-within:ring-primary transition-all">
                        <input
                          id="promo-code-input"
                          name="promoCode"
                          type="text"
                          value={promoCode}
                          onChange={(e) => {
                            setPromoCode(e.target.value.toUpperCase());
                            setPromoError('');
                          }}
                          placeholder=" "
                          disabled={promoApplied}
                          className={`vj-lookup-input font-mono uppercase font-bold text-black !text-black !border-b-0 w-full disabled:opacity-50 ${promoApplied ? 'form-input-valid' : ''}`}
                        />
                        <label
                          htmlFor="promo-code-input"
                          className={`vj-lookup-label font-medium font-koho pointer-events-none transition-all ${
                            promoCode
                              ? '-top-2 bg-white px-1 text-3xs font-medium text-vj-gray !text-vj-gray'
                              : 'left-3 text-sm text-vj-muted !text-vj-muted'
                          }`}
                        >
                          VJ2026
                        </label>
                      </div>
                      <button
                        onClick={applyPromo}
                        disabled={promoApplied || !promoCode || isApplyingPromo}
                        className="h-[40px] px-3 bg-accent text-[var(--foreground)] font-bold rounded-vj text-xs hover:bg-accent-dark transition-colors disabled:opacity-50 min-w-[80px] flex items-center justify-center shrink-0"
                      >
                        {isApplyingPromo ? (
                          <div className="w-4 h-4 border-2 border-[rgb(var(--foreground-rgb))]/20 border-t-[var(--foreground)] rounded-full animate-spin" />
                        ) : promoApplied ? (
                          '✓'
                        ) : (
                          'Áp dụng'
                        )}
                      </button>
                    </div>
                    {promoError && <p className="text-xs text-primary mt-1">{promoError}</p>}
                    {promoApplied && promoData && (
                      <p className="text-xs text-[var(--vj-green)] mt-1 font-semibold">
                        ✓ Đã áp dụng mã {promoData.code}
                      </p>
                    )}
                  </div>

                  {/* Price breakdown */}
                  <div className="mt-4 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-[var(--foreground-muted)]">Giá vé cơ bản</span>
                      <span className="font-semibold">
                        {booking?.fareSubtotal.toLocaleString('vi-VN')}₫
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--foreground-muted)]">
                        Thuế &amp; phí sân bay ({Math.round(TAX_AND_FEE_RATE * 100)}%)
                      </span>
                      <span className="font-semibold">
                        +{(booking?.tax ?? 0).toLocaleString('vi-VN')}₫
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--foreground-muted)]">Phí chọn chỗ</span>
                      <span className="font-semibold">
                        +{(booking?.seatFee ?? 0).toLocaleString('vi-VN')}₫
                      </span>
                    </div>
                    {(booking?.ancillaryFee ?? 0) > 0 && (
                      <div className="flex justify-between">
                        <span className="text-[var(--foreground-muted)]">
                          Dịch vụ bổ sung
                          {booking?.ancillaries?.length
                            ? ` (${booking.ancillaries
                                .map((id) => ANCILLARY_OPTIONS.find((o) => o.id === id)?.title)
                                .filter(Boolean)
                                .join(', ')})`
                            : ''}
                        </span>
                        <span className="font-semibold">
                          +{booking!.ancillaryFee!.toLocaleString('vi-VN')}₫
                        </span>
                      </div>
                    )}
                    {promoApplied && (
                      <div className="flex justify-between text-[var(--vj-green)] font-medium">
                        <span>
                          Giảm giá {promoData?.type === 'percentage' ? `(${promoData.value}%)` : ''}
                        </span>
                        <span className="font-bold">
                          -{discountAmount.toLocaleString('vi-VN')}₫
                        </span>
                      </div>
                    )}
                    <div className="border-t border-[var(--border)] pt-2 flex justify-between font-bold text-[var(--foreground)]">
                      <span>Tổng thanh toán</span>
                      <span className="text-primary text-lg">{total.toLocaleString('vi-VN')}₫</span>
                    </div>
                  </div>

                  <Link
                    href="/tim-ve"
                    className="mt-3 flex min-h-9 items-center gap-1.5 text-xs text-[var(--foreground-subtle)] hover:text-[var(--foreground-muted)] transition-colors"
                  >
                    <Icon name="ArrowLeftIcon" size={12} />
                    Quay lại chọn chuyến bay
                  </Link>
                </div>
              )}
            </div>
          </div>

          {/* Desktop Bottom Action Buttons matching Image #1 & Image #8 */}
          {isPnrLookup ? (
            <div className="hidden sm:flex justify-between items-center w-full pt-10 pb-6">
              <button
                type="button"
                onClick={() =>
                  router.push(bookingCode ? `/dat-ve/${bookingCode}` : '/chuyen-bay-cua-toi')
                }
                className="px-10 py-2.5 rounded-full border border-gray-300 bg-white text-gray-700 font-bold text-xs hover:bg-gray-50 shadow-2xs transition-all active:scale-98 cursor-pointer"
              >
                Quay lại
              </button>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() =>
                    router.push(bookingCode ? `/dat-ve/${bookingCode}` : '/chuyen-bay-cua-toi')
                  }
                  className="px-8 py-2.5 rounded-full bg-vjgold hover:bg-vjamber text-black font-bold text-xs shadow-2xs transition-all active:scale-98 cursor-pointer"
                >
                  Hủy bỏ
                </button>
                <button
                  type="button"
                  onClick={goToPaymentGateway}
                  className="px-8 py-2.5 rounded-full bg-vjyellow hover:bg-vjamber text-black font-bold text-xs shadow-2xs transition-all active:scale-98 cursor-pointer"
                >
                  Thanh toán
                </button>
              </div>
            </div>
          ) : (
            <div className="hidden sm:flex justify-center items-center gap-4 pt-10 pb-6">
              <button
                type="button"
                onClick={() => router.push('/tim-ve')}
                className="px-10 py-2.5 rounded-full border border-gray-300 bg-white text-gray-700 font-bold text-xs hover:bg-gray-50 shadow-2xs transition-all active:scale-98 cursor-pointer"
              >
                Quay lại
              </button>
              <button
                type="button"
                onClick={() => router.push('/tim-ve')}
                className="px-10 py-2.5 rounded-full bg-green-500 hover:bg-green-600 text-white font-bold text-xs shadow-2xs transition-all active:scale-98 cursor-pointer"
              >
                Mua Thêm
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Mascot Amy floating banner at bottom-left matching Image #1 */}
      <div className="fixed bottom-3 left-4 z-40 hidden sm:flex items-end gap-2 pointer-events-auto">
        <div id="vj-mascot-banner" className="relative group">
          <div className="flex items-center gap-2 bg-white/95 backdrop-blur-xs rounded-full pl-1.5 pr-3 py-1 shadow-vj-lg border border-amber-200 hover:shadow-xl transition-all">
            <img
              src="/images/hero/amy-mascot.png"
              alt="Vietjet Mascot"
              className="w-10 h-10 object-contain drop-shadow"
            />
            <div className="text-left font-koho">
              <div className="text-2xs font-extrabold text-vj-red leading-tight">
                DIỆN MẠO MỚI - TRẢI NGHIỆM MỚI
              </div>
              <div className="text-3xs text-amber-600 font-bold flex items-center gap-0.5">
                <span>(Khám phá ngay &gt;)</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                const el = document.getElementById('vj-mascot-banner');
                if (el) el.style.display = 'none';
              }}
              className="text-gray-400 hover:text-red-500 text-sm font-bold ml-1 cursor-pointer leading-none"
              title="Đóng"
            >
              ×
            </button>
          </div>
        </div>
      </div>
      <ToastContainer toasts={toast.toasts} onDismiss={toast.dismiss} position="top-right" />
      {/* Payment processing overlay */}
      {loading && <PaymentProcessingOverlay />}

      {/* Error modal */}
      {showErrorModal && paymentError && (
        <ErrorModal
          title="Thanh toán thất bại"
          message={paymentError}
          onRetry={() => {
            setShowErrorModal(false);
            setPaymentError(null);
          }}
          onDismiss={() => {
            setShowErrorModal(false);
            setPaymentError(null);
          }}
        />
      )}

      {/* VietQR Payment Modal matching Screenshot 2 & Screenshot 1 */}
      <PaymentModal
        isOpen={showVietQrModal}
        onClose={() => setShowVietQrModal(false)}
        methodLabel="VietQR"
        subtotal={booking.fareSubtotal}
        discount={discountAmount}
        convenienceFee={vietQrConvenienceFee}
        /* The modal shows subtotal + convenienceFee - discount, so the total it
           prints has to be that same sum. It used to be `booking.total -
           discount`, which already includes the fee — so the breakdown did not
           add up to the number under it, and the customer could not tell which
           figure was the one they would be charged. */
        grandTotal={vietQrGrandTotal}
        onProceed={() => {
          setShowVietQrModal(false);
          toast.success(
            'Chuyển sang trang mã QR VietQR',
            'Vui lòng quét mã QR để hoàn tất thanh toán.'
          );
        }}
      />

      {/* Mobile Sticky Bottom Bar matching Screenshots 3 & 4 */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-vj-border-light px-4 py-3 shadow-vj-up-md flex items-center gap-3 sm:hidden">
        <button
          type="button"
          onClick={() => router.push('/tim-ve')}
          className="flex-1 bg-vj-pay-green hover:bg-vj-pay-green-hover text-white font-black italic text-sm py-3 rounded-vj shadow transition-all active:scale-98 cursor-pointer text-center"
        >
          Mua thêm
        </button>
        <button
          type="button"
          onClick={goToPaymentGateway}
          className="flex-1 bg-vj-gold-button hover:bg-vj-gold-pure text-vj-dark font-black italic text-sm py-3 rounded-vj shadow transition-all active:scale-98 cursor-pointer text-center"
        >
          Thanh toán
        </button>
      </div>

      {/* Modal Popup Xác nhận khoản vay Bay trước - Trả sau MOVI chuẩn Image #2 */}
      {showMoviModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn"
          role="dialog"
          aria-modal="true"
          aria-labelledby="movi-modal-title"
        >
          <div className="relative w-full max-w-md bg-white rounded-2xl p-6 sm:p-7 shadow-2xl border border-gray-100 text-center animate-scaleUp">
            {/* Nút đóng modal */}
            <button
              type="button"
              onClick={handleCloseMoviModal}
              className="absolute top-3.5 right-3.5 text-gray-400 hover:text-gray-600 p-1 rounded-full text-base leading-none cursor-pointer"
              aria-label="Đóng"
            >
              ✕
            </button>

            {/* Mascot Amy trong khung tròn với vòng lá và sao vàng chuẩn Image #2 */}
            <div className="flex justify-center mb-1">
              <div className="relative w-20 h-20 flex items-center justify-center">
                <div className="absolute inset-0 rounded-full border-2 border-yellow-300 bg-amber-50/50 flex items-center justify-center shadow-xs">
                  <span className="absolute -top-1 left-2 text-xs text-amber-400">✨</span>
                  <span className="absolute -top-1 right-2 text-xs text-amber-400">✨</span>
                  <span className="absolute bottom-0 left-1 text-xs text-green-500">🌿</span>
                  <span className="absolute bottom-0 right-1 text-xs text-green-500">🌿</span>
                </div>
                <img
                  src="/images/hero/amy-mascot.png"
                  alt="Vietjet Mascot"
                  className="w-14 h-14 object-contain relative z-10 drop-shadow"
                />
              </div>
            </div>

            {/* Tiêu đề & thông điệp */}
            <h3
              id="movi-modal-title"
              className="text-base sm:text-lg font-bold text-gray-900 mt-2 font-koho"
            >
              Vé của bạn được hỗ trợ thanh toán trong vòng 30 phút
            </h3>
            <p className="text-xs text-gray-600 mt-1 font-koho">
              Vui lòng thực hiện xác nhận khoản vay và tiếp tục hoàn tất thủ tục với Bay trước - Trả
              sau!
            </p>

            {/* Khung Thông tin đặt chỗ */}
            <div className="mt-4 border border-gray-200 rounded-xl p-3.5 sm:p-4 bg-white text-left font-koho">
              <div className="text-2xs font-bold text-gray-700 uppercase tracking-wider mb-2.5">
                Thông tin đặt chỗ
              </div>
              <div className="grid grid-cols-[96px_1fr] gap-3 items-center">
                {/* Cột trái: QR Code */}
                <div className="flex flex-col items-center justify-center p-1 border border-gray-200 rounded-md bg-white">
                  {moviQrDataUrl ? (
                    <img
                      src={moviQrDataUrl}
                      alt={`QR Code ${bookingCodeLabel}`}
                      className="w-20 h-20 object-contain"
                    />
                  ) : (
                    <div className="w-20 h-20 bg-gray-100 animate-pulse rounded" />
                  )}
                </div>

                {/* Cột phải: Bảng thông tin */}
                <div className="space-y-1 text-2xs sm:text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="text-gray-500 font-medium">Mã đặt chỗ</span>
                    <span className="font-extrabold text-red-600 text-sm">{bookingCodeLabel}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500 font-medium">Họ tên</span>
                    <span className="font-semibold text-gray-800 uppercase">
                      {moviFullName.trim() || booking?.passengers?.[0]?.name || '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500 font-medium">Số điện thoại</span>
                    <span className="font-semibold text-gray-800">
                      {moviPhone.trim() || booking?.contactPhone || '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500 font-medium">Ngày đặt</span>
                    <span className="text-gray-700">
                      {formatLocalBookingDateTime(booking?.date || new Date().toISOString())}(giờ
                      địa phương)
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500 font-medium">Địa chỉ email</span>
                    <span className="text-gray-700 truncate max-w-[130px]">
                      {booking?.contactEmail || 'customer@vietjetsim.vn'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t border-gray-100">
                    <span className="text-gray-500 font-medium">Tổng tiền</span>
                    <span className="font-extrabold text-red-600 text-xs sm:text-sm">
                      {total.toLocaleString('vi-VN')} VND
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Nút Thanh toán màu vàng chuẩn Image #2 */}
            <div className="mt-5 flex justify-center">
              <button
                type="button"
                onClick={executeMoviPayment}
                disabled={loading}
                className="px-8 py-2 bg-vjyellow hover:bg-vjamber text-black font-bold text-xs sm:text-sm rounded-md shadow-xs active:scale-98 transition-all cursor-pointer disabled:opacity-50"
              >
                {loading ? 'Đang xử lý...' : 'Thanh toán'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Thông tin đặt chỗ (Screenshot 7) */}
      <PassengerDetailModal
        isOpen={showSummaryModal}
        onClose={() => setShowSummaryModal(false)}
        outboundFare={booking.total ? Math.round(booking.total * 0.7) : 0}
        outboundFlightNo={booking.flightNo}
        outboundTrip={
          booking.from && booking.to
            ? `${booking.fromCity || booking.from} (${booking.from}) → ${booking.toCity || booking.to} (${booking.to})`
            : undefined
        }
      />
    </>
  );
}
