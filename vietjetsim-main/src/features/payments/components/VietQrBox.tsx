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
  /** Cấu hình tài khoản ngân hàng admin làm fallback khi bookingId chưa có */
  fallbackAccount?: BankAccountFallback | null;
  fallbackAmount?: number;
  fallbackAddInfo?: string;
  fallbackPnr?: string | null;
  /** Loại phương thức thanh toán đang chọn: 'vnpay_qr' | 'vietqr' | 'napas' | 'bank' */
  methodType?: string;
  /** Tùy chỉnh hiển thị - cho gateway pages cần layout khác */
  variant?: 'full' | 'compact' | 'bank';
  /** Deprecated — không còn header gradient; giữ prop để tương thích caller cũ. */
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
  /** Mã giảm giá để tính toán số tiền đúng */
  discountCode?: string | null;
}

type PollState = 'waiting' | 'checking' | 'paid';

export default function VietQrBox({
  bookingId,
  onPaid,
  pollIntervalMs = 5000,
  fallbackAccount,
  fallbackAmount = 0,
  fallbackAddInfo = '',
  fallbackPnr = null,
  methodType = 'vietqr',
  hidePaymentDetails = false,
  hidePollStatus = false,
  hideScanGuide: _hideScanGuide = false, // deprecated, handled in parent
  discountCode,
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
          const discountParam = discountCode
            ? `&discountCode=${encodeURIComponent(discountCode)}`
            : '';
          const result = await apiRequest<VietQrData>(
            `/api/thanh-toan/vietqr?bookingId=${encodeURIComponent(bookingId)}${discountParam}`
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
    discountCode,
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
      {/* Dải logo phương thức — đặt ngay dưới header/tiêu đề cổng thanh toán */}
      {!hidePaymentDetails && (
        <div className="px-4 pt-3 flex items-center justify-center gap-2">
          <div className="flex items-center justify-center gap-2.5 rounded-vj border border-vj-border-light bg-white px-3 py-1.5 shadow-2xs">
            {isVnpay ? (
              <VnpayLogo className="h-4.5 w-auto" />
            ) : (
              <VietQrLogo className="h-5 w-auto" />
            )}
            <span className="h-3.5 w-px bg-vj-surface-3" />
            <NapasLogo className="h-4.5 w-auto" />
          </div>
        </div>
      )}

      {/* QR payload EMVCo / VietQR render trực tiếp */}
      <div className="flex flex-col items-center p-3.5 sm:p-4">
        <div className="relative group">
          {/* Ambient Glow */}
          <div className="absolute -inset-1.5 bg-gradient-to-r from-vj-bank-blue to-vjred rounded-2xl blur-sm opacity-20 group-hover:opacity-35 transition duration-300" />

          <div className="relative p-3 sm:p-3.5 bg-white rounded-xl border border-vj-border-light shadow-xs flex flex-col items-center">
            {/* QR SVG */}
            {qrSvg ? (
              <div
                className="w-36 h-36 sm:w-44 sm:h-44 [&>svg]:w-full [&>svg]:h-full"
                data-testid="vietqr-svg"
                dangerouslySetInnerHTML={{ __html: qrSvg }}
              />
            ) : (
              <div className="w-36 h-36 sm:w-44 sm:h-44 bg-blue-50/50 rounded-xl animate-pulse flex flex-col items-center justify-center gap-2">
                <Icon name="QrCodeIcon" size={36} className="text-vj-bank-blue" />
                <span className="text-3xs text-vj-gray font-medium">
                  Đang tạo mã {methodLabel}...
                </span>
              </div>
            )}

            {/* Dòng hướng dẫn thanh toán */}
            <p className="mt-2 text-center text-3xs text-vj-gray leading-tight px-1 font-koho">
              Thanh toán đúng số tiền và nội dung — hệ thống tự đối soát và xuất vé ngay.
            </p>
          </div>
        </div>

        {!hidePaymentDetails && (
          <>
            {/* Thông tin tài khoản thanh toán (Chủ TK → STK → NH → Số tiền → Nội dung) */}
            <div className="w-full mt-3 space-y-1.5 bg-slate-50 p-2.5 sm:p-3 rounded-vj border border-vj-border-light/90 shadow-2xs">
              <div className="flex items-center justify-between pb-1.5 border-b border-vj-border-light">
                <span className="text-2xs font-bold uppercase tracking-wider text-black font-koho flex items-center gap-1.5">
                  <Icon name="InformationCircleIcon" size={14} />
                  Thông tin tài khoản thanh toán
                </span>
              </div>

              {/* Chủ Tài Khoản */}
              <div className="flex items-center justify-between gap-2 rounded-vj bg-white px-2.5 py-1.5 sm:py-2">
                <span className="text-3xs font-semibold uppercase tracking-wider text-gray-500 font-koho shrink-0">
                  Chủ Tài Khoản
                </span>
                <span className="font-bold text-gray-900 text-xs sm:text-sm text-right">
                  {data?.bank?.accountHolder ?? '—'}
                </span>
              </div>

              {/* Số Tài Khoản */}
              <div className="flex items-center justify-between gap-2 rounded-vj bg-white px-2.5 py-1.5 sm:py-2">
                <span className="text-3xs font-semibold uppercase tracking-wider text-gray-500 font-koho shrink-0">
                  Số Tài Khoản
                </span>
                <span className="font-bold text-gray-900 text-xs sm:text-sm text-right select-all">
                  {data?.bank?.accountNumber ?? '—'}
                </span>
              </div>

              {/* Ngân Hàng Thụ Hưởng */}
              <div className="flex items-center justify-between gap-2 rounded-vj bg-white px-2.5 py-1.5 sm:py-2">
                <span className="text-3xs font-semibold uppercase tracking-wider text-gray-500 font-koho shrink-0">
                  Ngân Hàng Thụ Hưởng
                </span>
                <span className="font-bold text-gray-900 text-xs sm:text-sm text-right">
                  {data?.bank?.name ?? '—'}
                </span>
              </div>

              {/* Số Tiền */}
              <div className="flex items-center justify-between gap-2 rounded-vj bg-white px-2.5 py-1.5 sm:py-2">
                <span className="text-3xs font-semibold uppercase tracking-wider text-gray-500 font-koho shrink-0">
                  Số Tiền
                </span>
                <span className="font-bold text-gray-900 text-xs sm:text-sm text-right">
                  {(data?.amount ?? 0).toLocaleString('vi-VN')}₫
                </span>
              </div>

              {/* Nội Dung */}
              <div className="rounded-vj bg-white px-2.5 py-1.5 sm:py-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold uppercase tracking-wider text-gray-500 font-koho">
                      Nội Dung
                    </span>
                    <span className="block font-bold text-gray-900 text-xs sm:text-sm tracking-wider break-all select-all text-right">
                      {displayAddInfo}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-gray-400 mt-0.5 italic">
                  * Nhập đúng số tiền và nội dung để hệ thống tự xuất vé.
                </p>
              </div>
            </div>
          </>
        )}

        {!hidePollStatus && (
          <div
            data-testid="vietqr-poll-status"
            className={`mt-2.5 w-full flex items-center justify-center gap-2 rounded-vj px-3 py-1.5 text-3xs font-bold shadow-2xs transition-all ${
              pollState === 'paid'
                ? 'bg-lime-50 text-lime-800 border border-lime-300'
                : 'bg-blue-50 text-blue-800 border border-blue-200'
            }`}
          >
            {pollState === 'paid' ? (
              <>
                <Icon
                  name="CheckCircleIcon"
                  size={14}
                  className="text-vj-pay-green animate-bounce"
                />
                <span>Đã nhận được thanh toán thành công — Đang mở vé điện tử...</span>
              </>
            ) : (
              <>
                <span
                  className={`w-2 h-2 rounded-full bg-vj-bank-blue ${
                    pollState === 'checking' ? 'animate-ping' : 'animate-pulse'
                  }`}
                />
                <span>
                  {isVnpay
                    ? `Đang kiểm tra giao dịch VNPAY-QR (${Math.round(pollIntervalMs / 1000)}s)...`
                    : `Đang kiểm tra giao dịch VietQR (${Math.round(pollIntervalMs / 1000)}s)...`}
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
