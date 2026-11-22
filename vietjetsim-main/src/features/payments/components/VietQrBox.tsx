'use client';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '@/shared/components/ui';
import { apiRequest } from '@/shared/services';
import { buildVietQrPayload, lookupBankBin } from '@/lib/vietqr';
import { VietQrLogo, NapasLogo, VnpayLogo } from './PaymentMethodLogos';

/**
 * Mã VNPAY-QR / VietQR động cho một đặt chỗ: payload EMVCo do server sinh
 * (GET /api/thanh-toan/vietqr), QR render cục bộ bằng package `qrcode`
 * (không gọi dịch vụ bên thứ ba), kèm polling trạng thái giao dịch — khi
 * booking được xác nhận (webhook ngân hàng / admin), `onPaid` được gọi
 * để màn thanh toán tự chuyển sang success screen.
 *
 * Hỗ trợ fallbackAccount để luôn luôn hiển thị được mã QR và STK admin đã cài
 * ngay cả khi truy cập trực tiếp hoặc đang tải thông tin đặt chỗ.
 */

interface VietQrData {
  payload: string;
  pnr: string | null;
  amount: number;
  addInfo: string;
  bank: {
    name: string;
    logoUrl: string | null;
    accountNumber: string;
    accountHolder: string;
  };
}

export interface BankAccountFallback {
  id?: string;
  admin_bank_name: string;
  admin_bank_account_number: string;
  admin_bank_account_holder: string;
  bank_bin?: string;
  logo_url?: string;
  transfer_note_template?: string;
}

interface VietQrBoxProps {
  bookingId: string | null;
  onPaid?: () => void;
  /** Khoảng cách hai lần poll trạng thái (ms). */
  pollIntervalMs?: number;
  /** Ẩn khối logo/tên ngân hàng khi đặt trong card đã hiển thị sẵn (tab Ngân hàng). */
  showBankHeader?: boolean;
  /** Cấu hình tài khoản ngân hàng admin làm fallback khi bookingId chưa có */
  fallbackAccount?: BankAccountFallback | null;
  fallbackAmount?: number;
  fallbackAddInfo?: string;
  fallbackPnr?: string | null;
  /** Loại phương thức thanh toán đang chọn: 'vnpay_qr' | 'vietqr' | 'napas' | 'bank' */
  methodType?: string;
  /** Tùy chỉnh hiển thị - cho gateway pages cần layout khác */
  variant?: 'full' | 'compact' | 'bank';
  /** Ẩn header gradient (VNPAY-QR/VietQR + NAPAS 247) */
  hideGatewayHeader?: boolean;
  /** Ẩn thông tin thanh toán chi tiết (STK, số tiền, nội dung) */
  hidePaymentDetails?: boolean;
  /** Ẩn polling status */
  hidePollStatus?: boolean;
  /** Ẩn 3 bước hướng dẫn */
  hideSteps?: boolean;
  /** Ẩn hướng dẫn quét mã — deprecated, use hideSteps instead */
  hideScanGuide?: boolean;
  /** Callback khi copy nội dung chuyển khoản */
  onCopyNote?: (note: string) => void;
  /** Callback khi copy số tiền */
  onCopyAmount?: (amount: number) => void;
}

type PollState = 'waiting' | 'checking' | 'paid';

export default function VietQrBox({
  bookingId,
  onPaid,
  pollIntervalMs = 5000,
  showBankHeader = true,
  fallbackAccount,
  fallbackAmount = 0,
  fallbackAddInfo = '',
  fallbackPnr = null,
  methodType = 'vietqr',
  hideGatewayHeader = false,
  hidePaymentDetails = false,
  hidePollStatus = false,
  hideScanGuide: _hideScanGuide = false, // deprecated, handled in parent
}: VietQrBoxProps) {
  const isVnpay = methodType === 'vnpay_qr' || methodType === 'vnpay_dom';
  const methodLabel = isVnpay ? 'VNPAY-QR' : 'VietQR';
  const [data, setData] = useState<VietQrData | null>(null);
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pollState, setPollState] = useState<PollState>('waiting');
  const onPaidRef = useRef(onPaid);
  onPaidRef.current = onPaid;

  const effectivePnr =
    data?.pnr && data.pnr !== '—'
      ? data.pnr
      : fallbackPnr && fallbackPnr !== '—'
        ? fallbackPnr
        : 'VJ';

  const displayAddInfo =
    data?.addInfo && data.addInfo !== '—'
      ? data.addInfo.startsWith('—')
        ? data.addInfo.replace(/^—+/, effectivePnr)
        : data.addInfo
      : fallbackPnr && fallbackPnr !== '—'
        ? `${fallbackPnr}I98O`
        : '—';

  // Render QR SVG từ payload EMVCo
  const generateQrFromPayload = useCallback(async (payloadString: string) => {
    try {
      const QRCode = await import('qrcode');
      const svg = await QRCode.toString(payloadString, {
        type: 'svg',
        margin: 1,
        errorCorrectionLevel: 'M',
        color: { dark: '#0F172A', light: '#FFFFFF' },
      });
      setQrSvg(svg);
    } catch (err) {
      console.error('Failed to generate QR SVG:', err);
    }
  }, []);

  // Payload + QR render
  useEffect(() => {
    let cancelled = false;

    // 1. Thử gọi API server nếu có bookingId
    if (bookingId) {
      (async () => {
        try {
          const result = await apiRequest<VietQrData>(
            `/api/thanh-toan/vietqr?bookingId=${encodeURIComponent(bookingId)}`
          );
          if (cancelled) return;
          setData(result);
          await generateQrFromPayload(result.payload);
        } catch (err) {
          if (cancelled) return;
          console.warn('API VietQR failed, falling back to local account:', err);
          // Fallback sang tài khoản admin đã cấu hình
          if (fallbackAccount) {
            applyLocalFallback();
          } else {
            setError(err instanceof Error ? err.message : `Không tạo được mã ${methodLabel}`);
          }
        }
      })();
    } else if (fallbackAccount) {
      // 2. Không có bookingId nhưng có tài khoản admin -> sinh QR trực tiếp theo STK admin
      applyLocalFallback();
    }

    function applyLocalFallback() {
      if (!fallbackAccount) return;
      try {
        const bin = lookupBankBin(fallbackAccount.admin_bank_name, fallbackAccount.bank_bin);
        const amount = fallbackAmount > 0 ? fallbackAmount : 1730000;
        const pnr = fallbackPnr && fallbackPnr !== '—' ? fallbackPnr : 'VJ141';
        const addInfo =
          fallbackAddInfo && !fallbackAddInfo.startsWith('—') ? fallbackAddInfo : `${pnr}I98O`;
        const payload = buildVietQrPayload({
          bin,
          accountNumber: fallbackAccount.admin_bank_account_number,
          accountHolder: fallbackAccount.admin_bank_account_holder,
          bankName: fallbackAccount.admin_bank_name,
        });

        const localData: VietQrData = {
          payload,
          pnr,
          amount,
          addInfo,
          bank: {
            name: fallbackAccount.admin_bank_name,
            logoUrl: fallbackAccount.logo_url || null,
            accountNumber: fallbackAccount.admin_bank_account_number,
            accountHolder: fallbackAccount.admin_bank_account_holder,
          },
        };

        setData(localData);
        generateQrFromPayload(payload);
        setError(null);
      } catch (localErr) {
        console.error('Local VietQR generation failed:', localErr);
      }
    }

    return () => {
      cancelled = true;
    };
  }, [
    bookingId,
    fallbackAccount,
    fallbackAmount,
    fallbackAddInfo,
    fallbackPnr,
    generateQrFromPayload,
    methodLabel,
  ]);

  // Polling tự thăm dò giao dịch (giới hạn ~15 phút với nhịp 5s).
  useEffect(() => {
    if (!bookingId || !data) return;
    let active = true;
    let attempts = 0;
    const maxAttempts = Math.ceil((15 * 60 * 1000) / pollIntervalMs);
    const timer = setInterval(async () => {
      attempts += 1;
      setPollState('checking');
      try {
        const result = await apiRequest<{ booking: { status: string } }>(
          `/api/thanh-toan/trang-thai?bookingId=${encodeURIComponent(bookingId)}`
        );
        if (!active) return;
        if (result.booking?.status === 'confirmed') {
          setPollState('paid');
          clearInterval(timer);
          onPaidRef.current?.();
        } else {
          setPollState('waiting');
        }
      } catch {
        if (active) setPollState('waiting');
      }
      if (attempts >= maxAttempts) clearInterval(timer);
    }, pollIntervalMs);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [bookingId, data, pollIntervalMs]);

  if (!bookingId && !fallbackAccount && !data) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center text-sm text-amber-800">
        <Icon name="InformationCircleIcon" size={24} className="mx-auto mb-2 text-amber-600" />
        Đang tải thông tin tài khoản thanh toán VietQR...
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center text-sm text-red-700">
        <Icon name="ExclamationCircleIcon" size={24} className="mx-auto mb-2 text-vj-red-dark" />
        {error}
      </div>
    );
  }

  return (
    <div className="bg-white border border-vj-border-light/90 rounded-vj overflow-hidden shadow-2xs">
      {/* VietQR Header — Logo VietQR + Napas 247 + Ngân hàng thụ hưởng STK Admin */}
      {showBankHeader && !hideGatewayHeader && (
        <div className="p-4 sm:p-5 bg-gradient-to-r from-vj-bank-blue via-vj-bank-blue-dark to-vjred text-white shadow-vj-md">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="min-w-0 flex items-center gap-3 bg-white/95 rounded-vj px-3 py-1.5 shadow-2xs">
                {isVnpay ? (
                  <VnpayLogo className="h-6 w-auto" />
                ) : (
                  <VietQrLogo className="h-7 w-auto" />
                )}
                <span className="h-5 w-px bg-slate-200" />
                <NapasLogo className="h-6 w-auto" />
              </div>
            </div>

            <div className="hidden md:flex flex-col items-end shrink-0">
              <div className="flex items-center gap-1.5 bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-2xs font-bold text-white shadow-inner">
                <span className="w-2 h-2 rounded-full bg-vj-pay-green-bright animate-pulse" />
                Quét mã tức thì
              </div>
              <span className="text-3xs text-white/70 mt-1">
                Hỗ trợ 40+ ứng dụng ngân hàng & Ví điện tử
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Dải logo phương thức — đặt ngay dưới header/tiêu đề cổng thanh toán */}
      {!hidePaymentDetails && (
        <div className="px-5 sm:px-7 pt-4 flex items-center justify-center gap-3">
          <div className="flex items-center justify-center gap-3 rounded-vj border border-vj-border-light bg-white px-4 py-2.5 shadow-vj-sm">
            {isVnpay ? (
              <VnpayLogo className="h-5 sm:h-6 w-auto" />
            ) : (
              <VietQrLogo className="h-6 sm:h-7 w-auto" />
            )}
            <span className="h-4 w-px bg-vj-surface-3" />
            <NapasLogo className="h-5 sm:h-6 w-auto" />
          </div>
        </div>
      )}

      {/* QR payload EMVCo / VietQR render trực tiếp */}
      <div className="flex flex-col items-center p-5 sm:p-7">
        <div className="relative group">
          {/* Ambient Glow */}
          <div className="absolute -inset-2 bg-gradient-to-r from-vj-bank-blue to-vjred rounded-3xl blur-md opacity-25 group-hover:opacity-40 transition duration-300" />

          <div className="relative p-4 sm:p-5 bg-white rounded-2xl border border-vj-border-light shadow-vj-md flex flex-col items-center">
            {/* QR SVG */}
            {qrSvg ? (
              <div
                className="w-48 h-48 sm:w-60 sm:h-60 [&>svg]:w-full [&>svg]:h-full"
                data-testid="vietqr-svg"
                dangerouslySetInnerHTML={{ __html: qrSvg }}
              />
            ) : (
              <div className="w-48 h-48 sm:w-60 sm:h-60 bg-blue-50/50 rounded-2xl animate-pulse flex flex-col items-center justify-center gap-2">
                <Icon name="QrCodeIcon" size={48} className="text-vj-bank-blue" />
                <span className="text-xs text-vj-gray font-medium">
                  Đang tạo mã {methodLabel}...
                </span>
              </div>
            )}

            {/* Dòng hướng dẫn thanh toán */}
            <p className="mt-2.5 text-center text-xs text-vj-gray leading-relaxed px-2 font-koho">
              Thanh toán đúng số tiền và nội dung — hệ thống tự đối soát và xuất vé ngay.
            </p>
          </div>
        </div>

        {!hidePaymentDetails && (
          <>
            {/* Thông tin tài khoản thanh toán (Chủ TK → STK → NH → Số tiền → Nội dung) */}
            <div className="w-full mt-5 space-y-2 bg-slate-50 p-4 rounded-vj border border-vj-border-light/90 shadow-2xs">
              <div className="flex items-center justify-between pb-2 border-b border-vj-border-light">
                <span className="text-xs font-black uppercase tracking-wider text-black font-koho flex items-center gap-1.5">
                  <Icon name="InformationCircleIcon" size={16} />
                  Thông tin tài khoản thanh toán
                </span>
              </div>

              {/* Chủ Tài Khoản */}
              <div className="flex items-center justify-between gap-3 rounded-vj bg-white p-3 sm:p-4">
                <span className="text-3xs sm:text-2xs font-bold uppercase tracking-wider text-black font-koho shrink-0">
                  Chủ Tài Khoản
                </span>
                <span className="font-medium text-gray-700 text-sm text-right">
                  {data?.bank?.accountHolder ?? '—'}
                </span>
              </div>

              {/* Số Tài Khoản */}
              <div className="flex items-center justify-between gap-3 rounded-vj bg-white p-3 sm:p-4">
                <span className="text-3xs sm:text-2xs font-bold uppercase tracking-wider text-black font-koho shrink-0">
                  Số Tài Khoản
                </span>
                <span className="font-medium text-gray-700 text-sm text-right">
                  {data?.bank?.accountNumber ?? '—'}
                </span>
              </div>

              {/* Ngân Hàng Thụ Hưởng */}
              <div className="flex items-center justify-between gap-3 rounded-vj bg-white p-3 sm:p-4">
                <span className="text-3xs sm:text-2xs font-bold uppercase tracking-wider text-black font-koho shrink-0">
                  Ngân Hàng Thụ Hưởng
                </span>
                <span className="font-medium text-gray-700 text-sm text-right">
                  {data?.bank?.name ?? '—'}
                </span>
              </div>

              {/* Số Tiền */}
              <div className="flex items-center justify-between gap-3 rounded-vj bg-white p-3 sm:p-4">
                <span className="text-3xs sm:text-2xs font-bold uppercase tracking-wider text-black font-koho shrink-0">
                  Số Tiền
                </span>
                <span className="font-koho font-medium text-gray-700 text-sm text-right">
                  {(data?.amount ?? 0).toLocaleString('vi-VN')}₫
                </span>
              </div>

              {/* Nội Dung */}
              <div className="rounded-vj bg-white p-3 sm:p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <span className="block text-3xs sm:text-2xs font-black uppercase tracking-wider text-black font-koho">
                      Nội Dung
                    </span>
                    <span className="block font-medium font-sans text-gray-700 text-sm sm:text-base tracking-wider break-all select-all">
                      {displayAddInfo}
                    </span>
                  </div>
                </div>
                <p className="text-3xs text-gray-500 mt-1 italic">
                  * Nhập đúng số tiền và nội dung để hệ thống tự xuất vé.
                </p>
              </div>
            </div>
          </>
        )}

        {!hidePollStatus && (
          <div
            data-testid="vietqr-poll-status"
            className={`mt-4 w-full flex items-center justify-center gap-2.5 rounded-vj px-4 py-2.5 text-xs font-bold shadow-xs transition-all ${
              pollState === 'paid'
                ? 'bg-lime-50 text-lime-800 border border-lime-300'
                : 'bg-blue-50 text-blue-800 border border-blue-200'
            }`}
          >
            {pollState === 'paid' ? (
              <>
                <Icon
                  name="CheckCircleIcon"
                  size={18}
                  className="text-vj-pay-green animate-bounce"
                />
                <span>Đã nhận được thanh toán thành công — Đang mở vé điện tử...</span>
              </>
            ) : (
              <>
                <span
                  className={`w-2.5 h-2.5 rounded-full bg-vj-bank-blue ${
                    pollState === 'checking' ? 'animate-ping' : 'animate-pulse'
                  }`}
                />
                <span>
                  {isVnpay
                    ? `Đang tự động kiểm tra giao dịch qua VNPAY-QR (mỗi ${Math.round(pollIntervalMs / 1000)} giây)...`
                    : `Đang tự động kiểm tra giao dịch chuyển khoản VietQR (mỗi ${Math.round(pollIntervalMs / 1000)} giây)...`}
                </span>
              </>
            )}
          </div>
        )}

        {/* hideScanGuide removed - handled in GatewayQrPage */}
      </div>
    </div>
  );
}
