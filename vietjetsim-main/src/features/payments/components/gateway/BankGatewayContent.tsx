'use client';
import React, { useEffect, useMemo, useState } from 'react';
import { Icon } from '@/shared/components/ui';
import { apiRequest, getApiErrorMessage } from '@/shared/services';
import { renderTransferNote } from '@/lib/transfer-note';
import { validateBankTransferInput } from '@/lib/bank-transfer';
import VietQrBox from '@/features/payments/components/VietQrBox';

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

export interface BankGatewayPayload {
  bank_account_id?: string;
  transfer_note: string;
  transfer_amount: string;
}

interface Props {
  bookingId: string;
  bookingCode?: string;
  /** Tổng tiền vé gốc (chưa trừ khuyến mãi) — dùng render `{original}` trong memo. */
  originalAmount: number;
  /** Số tiền khách phải chuyển sau khuyến mãi — khớp `amount` server kỳ vọng. */
  amount: number;
  discountAmount?: number;
  discountCode?: string;
  onSuccess: (payload: { bank: BankGatewayPayload }) => void;
}

export default function BankGatewayContent({
  bookingId,
  bookingCode,
  originalAmount,
  amount,
  discountAmount = 0,
  discountCode = '',
  onSuccess,
}: Props) {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState('');
  const [transferNoteInput, setTransferNoteInput] = useState('');
  const [transferAmountInput, setTransferAmountInput] = useState('');
  const [formError, setFormError] = useState('');
  const [copied, setCopied] = useState<'note' | 'amount' | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiRequest<{ accounts?: BankAccount[] }>('/api/cong-khai/cau-hinh-ngan-hang')
      .then((data) => {
        if (cancelled) return;
        const list = data.accounts ?? [];
        setAccounts(list);
        const preferred = list.find((a) => a.is_default) ?? list[0];
        setSelectedId(preferred?.id ?? '');
        setLoadState('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(getApiErrorMessage(err, 'Không tải được tài khoản ngân hàng nhận.'));
        setLoadState('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedAccount = useMemo(
    () => accounts.find((a) => a.id === selectedId) ?? accounts[0] ?? null,
    [accounts, selectedId]
  );

  // Memo phải khớp từng ký tự với memo server tự render — server so sánh
  // `transfer_note` khách nhập với template của tài khoản nhận.
  const expectedNote = useMemo(
    () =>
      renderTransferNote(selectedAccount?.transfer_note_template, {
        code: bookingCode || '',
        originalAmount,
        discountAmount,
        amount,
        discountCode,
      }),
    [
      selectedAccount?.transfer_note_template,
      bookingCode,
      originalAmount,
      discountAmount,
      amount,
      discountCode,
    ]
  );

  // Điền sẵn đúng giá trị server kỳ vọng; khách vẫn có thể sửa để mô phỏng
  // việc tự gõ lại, và server sẽ từ chối nếu sai.
  useEffect(() => {
    if (expectedNote) setTransferNoteInput(expectedNote);
  }, [expectedNote]);

  useEffect(() => {
    if (amount > 0) setTransferAmountInput(String(amount));
  }, [amount]);

  const handleCopy = (kind: 'note' | 'amount', value: string) => {
    navigator.clipboard?.writeText(value).catch(() => {});
    setCopied(kind);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAccount) {
      setFormError('Vui lòng chọn tài khoản ngân hàng nhận.');
      return;
    }
    const validation = validateBankTransferInput(
      { transferNote: transferNoteInput, amount: transferAmountInput },
      { transferNote: expectedNote, amount }
    );
    if (!validation.valid) {
      setFormError(validation.message);
      return;
    }
    setFormError('');
    onSuccess({
      bank: {
        bank_account_id: selectedAccount.id,
        transfer_note: transferNoteInput.trim(),
        transfer_amount: transferAmountInput.trim(),
      },
    });
  };

  if (loadState === 'loading') {
    return (
      <div className="py-16 text-center text-sm text-vj-gray">Đang tải tài khoản ngân hàng…</div>
    );
  }

  if (loadState === 'error' || accounts.length === 0) {
    return (
      <div className="max-w-xl mx-auto my-8 px-4">
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6 text-center text-sm text-amber-900">
          <Icon name="ExclamationTriangleIcon" size={28} className="mx-auto mb-2" />
          <div className="font-bold">Chưa dùng được chuyển khoản</div>
          <div className="mt-1">
            {loadError || 'Hệ thống chưa cấu hình tài khoản ngân hàng nhận.'}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto py-6 px-4">
      <div className="bg-white rounded-3xl border border-vj-border-light/90 p-5 sm:p-8 shadow-vj-sm space-y-6 font-koho">
        <div className="text-center space-y-1">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-vj-bank-blue text-xs font-bold uppercase tracking-wider">
            <Icon name="BuildingLibraryIcon" size={16} />
            CHUYỂN KHOẢN NGÂN HÀNG
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-vj-text">
            Quét mã VietQR hoặc chuyển khoản
          </h2>
          <p className="text-xs sm:text-sm text-vj-gray">
            Chuyển đúng số tiền và nội dung bên dưới — hệ thống tự đối chiếu khi nhận được tiền.
          </p>
        </div>

        {accounts.length > 1 && (
          <div>
            <label className="block text-xs font-bold text-vj-text-dim mb-1">
              Tài khoản ngân hàng nhận
            </label>
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-vj border border-vj-line text-sm focus:border-primary outline-hidden bg-white"
            >
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.admin_bank_name} — {acc.admin_bank_account_number}
                </option>
              ))}
            </select>
          </div>
        )}

        {selectedAccount && (
          <div className="bg-vj-surface-2 rounded-vj p-4 border border-vj-border-light space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-vj-text-dim">Ngân hàng</span>
              <span className="font-bold">{selectedAccount.admin_bank_name}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-vj-text-dim">Số tài khoản</span>
              <span className="font-mono font-black">
                {selectedAccount.admin_bank_account_number}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-vj-text-dim">Chủ tài khoản</span>
              <span className="font-bold uppercase">
                {selectedAccount.admin_bank_account_holder}
              </span>
            </div>
            {selectedAccount.branch && (
              <div className="flex justify-between">
                <span className="text-vj-text-dim">Chi nhánh</span>
                <span>{selectedAccount.branch}</span>
              </div>
            )}
          </div>
        )}

        {/* VietQR Code - unified component */}
        {selectedAccount && (
          <div className="flex justify-center">
            <div className="w-full max-w-md">
              <VietQrBox
                bookingId={bookingId}
                fallbackAmount={amount}
                fallbackPnr={bookingCode || 'VJ'}
                fallbackAddInfo={expectedNote}
                fallbackAccount={{
                  admin_bank_name: selectedAccount.admin_bank_name,
                  admin_bank_account_number: selectedAccount.admin_bank_account_number,
                  admin_bank_account_holder: selectedAccount.admin_bank_account_holder,
                  bank_bin: selectedAccount.bank_bin,
                  logo_url: selectedAccount.logo_url,
                }}
                methodType="bank"
                variant="bank"
                hideGatewayHeader
                hidePaymentDetails
                hidePollStatus
                hideSteps
                hideScanGuide
                onCopyNote={(note) => handleCopy('note', note)}
                onCopyAmount={(amt) => handleCopy('amount', String(amt))}
                discountCode={discountCode}
              />
            </div>
          </div>
        )}

        <div className="bg-amber-50/70 rounded-vj p-4 border border-amber-200 space-y-3">
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold text-amber-800 uppercase">Số tiền cần chuyển</span>
              <button
                type="button"
                onClick={() => handleCopy('amount', String(amount))}
                className="text-3xs font-bold text-primary hover:underline cursor-pointer"
              >
                {copied === 'amount' ? 'Đã sao chép' : 'Sao chép'}
              </button>
            </div>
            <div className="text-2xl font-black text-primary">
              {amount.toLocaleString('vi-VN')} ₫
            </div>
            {discountAmount > 0 && (
              <div className="text-3xs text-vj-gray mt-0.5">
                Đã trừ khuyến mãi {discountAmount.toLocaleString('vi-VN')} ₫
                {discountCode ? ` (mã ${discountCode})` : ''}
              </div>
            )}
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold text-amber-800 uppercase">
                Nội dung chuyển khoản
              </span>
              <button
                type="button"
                onClick={() => handleCopy('note', expectedNote)}
                className="text-3xs font-bold text-primary hover:underline cursor-pointer"
              >
                {copied === 'note' ? 'Đã sao chép' : 'Sao chép'}
              </button>
            </div>
            <div className="font-mono font-black text-base text-vj-text break-all">
              {expectedNote}
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-vj-text-dim mb-1">
              Xác nhận nội dung đã chuyển <span className="text-vj-red">*</span>
            </label>
            <input
              type="text"
              required
              value={transferNoteInput}
              onChange={(e) => setTransferNoteInput(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-vj border border-vj-line font-mono text-sm focus:border-primary outline-hidden"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-vj-text-dim mb-1">
              Xác nhận số tiền đã chuyển <span className="text-vj-red">*</span>
            </label>
            <input
              type="text"
              required
              inputMode="numeric"
              value={transferAmountInput}
              onChange={(e) => setTransferAmountInput(e.target.value.replace(/[^\d]/g, ''))}
              className="w-full px-3.5 py-2.5 rounded-vj border border-vj-line font-mono text-sm focus:border-primary outline-hidden"
            />
          </div>

          {formError && (
            <div
              role="alert"
              className="rounded-vj border border-red-200 bg-red-50 p-3 text-xs text-red-800"
            >
              {formError}
            </div>
          )}

          <button
            type="submit"
            className="w-full py-3.5 rounded-vj bg-primary hover:bg-primary-dark text-white font-black text-sm uppercase tracking-wide transition-all shadow-vj-md cursor-pointer"
          >
            Tôi đã chuyển khoản — Xác nhận thanh toán
          </button>
          <p className="text-3xs text-vj-muted text-center">
            Đơn sẽ tự động xác nhận khi hệ thống đối chiếu được giao dịch. Bạn có thể đóng trang
            này.
          </p>
        </form>
      </div>
    </div>
  );
}
