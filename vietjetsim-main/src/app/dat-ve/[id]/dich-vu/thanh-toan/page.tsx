'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Header, Footer } from '@/shared/components/navigation';
import { apiRequest } from '@/shared/services';
import { useToast } from '@/hooks/useToast';
import { ToastContainer } from '@/shared/components/feedback';

interface AncillaryItem {
  option_id: string;
  unit_price: number;
  quantity: number;
  status?: string;
}

interface BaggageItem {
  id: string;
  package_id: string;
  weight_kg: number;
  unit_price: number;
  quantity: number;
  status?: string;
}

interface BookingSummary {
  booking_code?: string;
  booking_code_upper?: string;
}

export default function AncillaryPaymentPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const toast = useToast();

  const [booking, setBooking] = useState<BookingSummary | null>(null);
  const [baggage, setBaggage] = useState<BaggageItem[]>([]);
  const [ancillaries, setAncillaries] = useState<AncillaryItem[]>([]);
  const [totalDue, setTotalDue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [paid, setPaid] = useState(false);
  const [paidMethod, setPaidMethod] = useState<string>('');

  const formatCurrency = (n: number) => n.toLocaleString('vi-VN');

  useEffect(() => {
    async function load() {
      if (!id) return;
      try {
        setLoading(true);
        const data = await apiRequest<{
          baggage?: BaggageItem[];
          ancillaries?: AncillaryItem[];
          pendingAmount?: number;
        }>(`/api/dat-ve/${encodeURIComponent(id)}/dich-vu`);
        // Chỉ liệt kê khoản 'pending' — dòng 'paid' đã nằm trong tiền vé/đã thu.
        setBaggage((data.baggage || []).filter((b) => b.status !== 'paid'));
        setAncillaries((data.ancillaries || []).filter((a) => a.status !== 'paid'));
        setTotalDue(data.pendingAmount ?? 0);
        // Load booking base info for display
        const b = await apiRequest<{ booking?: BookingSummary } & BookingSummary>(
          `/api/dat-ve/${encodeURIComponent(id)}`
        );
        setBooking(b.booking || b);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Không thể tải thông tin thanh toán.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id, toast]);

  const handlePay = async (method: string) => {
    if (paying) return;
    if (totalDue <= 0) {
      toast.warning('Không có khoản phí dịch vụ nào cần thanh toán.');
      return;
    }
    setPaying(true);
    try {
      const res = await apiRequest<{ success?: boolean; amount?: number; message?: string }>(
        `/api/dat-ve/${encodeURIComponent(id)}/dich-vu/thanh-toan`,
        { method: 'POST', body: { method } }
      );
      if (res.success) {
        setPaidMethod(method);
        setPaid(true);
        toast.success(`Thanh toán ${formatCurrency(res.amount ?? 0)} thành công!`);
        setTimeout(() => {
          router.push(`/dat-ve/${id}`);
        }, 1500);
      } else {
        toast.error(res.message || 'Thanh toán thất bại.');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không thể xử lý thanh toán.');
    } finally {
      setPaying(false);
    }
  };

  const ancillaryTotal = ancillaries.reduce((sum, a) => sum + a.unit_price * a.quantity, 0);
  const baggageTotal = baggage.reduce((sum, b) => sum + b.unit_price * b.quantity, 0);

  const paymentMethods = [
    { id: 'vietqr', label: 'VietQR', icon: '🏦', desc: 'Quét mã QR thanh toán' },
    { id: 'vnpay', label: 'VNPay', icon: '💳', desc: 'Thanh toán qua VNPay' },
    { id: 'credit_card', label: 'Thẻ ATM/Napas', icon: '💳', desc: 'Thẻ nội địa Việt Nam' },
    { id: 'momo', label: 'Ví MoMo', icon: '📱', desc: 'Ví điện tử MoMo' },
    { id: 'zalopay', label: 'Ví ZaloPay', icon: '📱', desc: 'Ví điện tử ZaloPay' },
  ];

  if (loading) {
    return (
      <div className="relative min-h-screen bg-vj-surface-cool flex flex-col font-koho">
        <Header />
        <main id="main-content" className="flex-1 flex items-center justify-center p-8">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-red-200 border-t-red-600 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-vj-text-strong font-medium">Đang tải thông tin thanh toán...</p>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (paid) {
    return (
      <div className="relative min-h-screen bg-vj-surface-cool flex flex-col font-koho">
        <Header />
        <main
          id="main-content"
          className="flex-1 flex flex-col items-center justify-center p-8 min-h-[calc(100vh-200px)]"
        >
          <div className="text-center max-w-md">
            <div className="w-16 h-16 rounded-full bg-vj-pay-green flex items-center justify-center mx-auto mb-6 shadow-lg">
              <span className="text-3xl">✓</span>
            </div>
            <h1 className="text-2xl font-black text-vj-text mb-2">Thanh toán thành công</h1>
            <p className="text-vj-muted mb-6">
              Bạn đã thanh toán{' '}
              <span className="font-black text-vj-red-dark">{formatCurrency(totalDue)} VND</span>{' '}
              cho dịch vụ bổ sung.
            </p>
            <div className="bg-white rounded-xl border border-vj-border-light p-6 shadow-vj-sm mb-8">
              <div className="flex items-center justify-between mb-2">
                <span className="text-vj-muted">Mã đặt chỗ:</span>
                <span className="font-black text-vj-text">{booking?.booking_code || id}</span>
              </div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-vj-muted">Phương thức:</span>
                <span className="font-medium">{paidMethod.toUpperCase() || '—'}</span>
              </div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-vj-muted">Tổng thanh toán:</span>
                <span className="font-black text-vj-red-dark">{formatCurrency(totalDue)} VND</span>
              </div>
              <div className="flex gap-2">
                {baggage.length > 0 && (
                  <span className="px-3 py-1 rounded-full bg-vj-pay-green/10 text-vj-pay-green text-xs font-bold">
                    ✓ Hành lý đã thanh toán
                  </span>
                )}
                {ancillaries.length > 0 && (
                  <span className="px-3 py-1 rounded-full bg-vj-pay-green/10 text-vj-pay-green text-xs font-bold">
                    ✓ Dịch vụ bổ sung đã thanh toán
                  </span>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => router.push(`/dat-ve/${id}`)}
              className="w-full lg:w-auto px-10 py-3 rounded-full bg-vj-red-dark hover:bg-vj-red text-white font-bold shadow-vj-btn transition-colors active:scale-98"
            >
              Về trang quản lý đặt chỗ
            </button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-vj-surface-cool flex flex-col font-koho">
      <Header />
      <ToastContainer toasts={toast.toasts} onDismiss={toast.dismiss} position="top-right" />

      {/* Yellow PNR Subheader Bar */}
      <div className="w-full bg-vj-yellow text-vj-text border-b border-vj-yellow py-2.5 px-3 sm:px-6 shadow-xs sticky top-[74px] z-20">
        <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-y-1 text-2xs sm:text-xs">
          <div className="flex items-center gap-1.5 font-bold">
            <span>Mã đặt chỗ :</span>
            <span className="text-vj-red-dark font-black">{booking?.booking_code || id}</span>
          </div>
          <div className="flex items-center gap-1.5 font-bold">
            <span>Tổng cần thanh toán :</span>
            <span
              className={`font-black ${totalDue > 0 ? 'text-vj-red-dark' : 'text-vj-pay-green'}`}
            >
              {formatCurrency(totalDue)} VND
            </span>
          </div>
        </div>
      </div>

      <main id="main-content" className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 py-6 pb-28">
        <div className="mb-6">
          <h1 className="text-lg sm:text-xl font-black text-vj-text mb-1">
            Thanh toán dịch vụ bổ sung
          </h1>
          <p className="text-2xs sm:text-xs text-vj-muted">
            Chọn phương thức thanh toán để hoàn tất các dịch vụ đã chọn.
          </p>
        </div>

        {/* Summary Card */}
        <div className="bg-white rounded-xl border border-vj-border-light p-6 shadow-vj-sm mb-6">
          <h2 className="text-sm font-black text-vj-text mb-4">Tóm tắt thanh toán</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-vj-muted">
              <span>Hành lý ký gửi</span>
              <span>{baggage.length > 0 ? formatCurrency(baggageTotal) : '0'} VND</span>
            </div>
            {baggage.map((b) => (
              <div
                key={b.id}
                className="flex items-center justify-between text-2xs text-vj-text-strong"
              >
                <span className="text-vj-muted">{b.package_id}</span>
                <span>{formatCurrency(b.unit_price * b.quantity)} VND</span>
              </div>
            ))}
            <div className="flex items-center justify-between text-xs text-vj-muted">
              <span>Dịch vụ bổ sung</span>
              <span>{ancillaries.length > 0 ? formatCurrency(ancillaryTotal) : '0'} VND</span>
            </div>
            {ancillaries.map((a) => (
              <div
                key={a.option_id}
                className="flex items-center justify-between text-2xs text-vj-text-strong"
              >
                <span className="text-vj-muted">{a.option_id}</span>
                <span>{formatCurrency(a.unit_price * a.quantity)} VND</span>
              </div>
            ))}
            <div className="border-t border-vj-border-light pt-3 flex items-center justify-between">
              <span className="font-black text-vj-red-dark">Tổng cộng</span>
              <span className="font-black text-xl">{formatCurrency(totalDue)} VND</span>
            </div>
          </div>
        </div>

        {/* Payment Methods */}
        <div className="bg-white rounded-xl border border-vj-border-light p-6 shadow-vj-sm">
          <h2 className="text-sm font-black text-vj-text mb-4">Chọn phương thức thanh toán</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {paymentMethods.map((pm) => (
              <button
                key={pm.id}
                type="button"
                onClick={() => handlePay(pm.id)}
                disabled={paying || totalDue <= 0}
                className={`flex flex-col items-center justify-center p-4 rounded-xl border transition-all ${
                  paying
                    ? 'border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed opacity-60'
                    : totalDue <= 0
                      ? 'border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed'
                      : 'border-vj-border-light bg-white hover:border-vj-yellow hover:shadow-vj-sm cursor-pointer'
                }`}
              >
                <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-2 bg-gray-50 text-vj-red-dark font-bold text-xl">
                  {pm.icon}
                </div>
                <span className="text-xs font-black text-vj-text">{pm.label}</span>
                <span className="text-2xs text-vj-muted">{pm.desc}</span>
              </button>
            ))}
          </div>
          {totalDue <= 0 && (
            <p className="mt-3 text-2xs text-vj-muted">
              Không có khoản phí dịch vụ nào cần thanh toán.
            </p>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
