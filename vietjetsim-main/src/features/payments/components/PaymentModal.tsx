'use client';

import React, { useState } from 'react';
import { RiCloseLine, RiShieldCheckLine } from 'react-icons/ri';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  methodLabel?: string;
  subtotal: number;
  discount?: number;
  convenienceFee?: number;
  grandTotal: number;
  onProceed: () => void;
}

export default function PaymentModal({
  isOpen,
  onClose,
  methodLabel = 'VietQR',
  subtotal,
  discount = 0,
  convenienceFee = 0,
  grandTotal,
  onProceed,
}: PaymentModalProps) {
  const [showConfirmCancel, setShowConfirmCancel] = useState(false);

  if (!isOpen) return null;

  const handleRequestClose = () => {
    setShowConfirmCancel(true);
  };

  const handleCancelTransaction = () => {
    setShowConfirmCancel(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/55 transition-opacity animate-fadeIn"
        onClick={handleRequestClose}
      />

      {/* Modal Card matching Screenshot 2 */}
      <div className="relative w-full max-w-xl bg-white rounded-vj shadow-2xl overflow-hidden z-10 flex flex-col animate-scaleUp">
        {/* Header - Red bar with "THÔNG TIN THANH TOÁN" */}
        <div className="bg-primary-dark text-white px-4 py-3 flex items-center justify-between">
          <h2 className="text-sm sm:text-base font-black uppercase tracking-wider text-center flex-1">
            THÔNG TIN THANH TOÁN
          </h2>
          <button
            onClick={handleRequestClose}
            className="text-white hover:text-amber-300 p-1 rounded transition-colors ml-2"
            aria-label="Đóng"
          >
            <RiCloseLine size={24} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
          {/* Method title & description */}
          <div className="flex items-center justify-between border-b border-vj-border-light pb-4">
            <div>
              <h3 className="text-base font-black text-vj-text">{methodLabel}</h3>
              <p className="text-xs text-vj-text-strong mt-1">
                Quý khách sẽ được dẫn sang trang có mã QR của {methodLabel} để thanh toán.
              </p>
            </div>
            {/* VietQR red logo badge */}
            <div className="w-10 h-10 rounded-vj bg-red-50 border border-red-200 flex items-center justify-center font-black text-primary-dark text-xl shadow-vj-sm shrink-0">
              V
            </div>
          </div>

          {/* Table: Chi tiết thanh toán */}
          <div>
            <h4 className="text-xs font-bold text-vj-text uppercase tracking-wider mb-3">
              Chi tiết thanh toán
            </h4>
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between py-1 text-vj-text-strong">
                <span>Tạm tính</span>
                <span className="font-bold text-vj-text">
                  {subtotal.toLocaleString('vi-VN')} VND
                </span>
              </div>
              <div className="flex items-center justify-between py-1 text-vj-text-strong">
                <span>Mã giảm giá/ phiếu quà tặng</span>
                <span className="font-bold text-success">
                  {discount > 0 ? `-${discount.toLocaleString('vi-VN')}` : '0'} VND
                </span>
              </div>
              <div className="flex items-center justify-between py-1 text-vj-text-strong">
                <span>Phí tiện ích</span>
                <span className="font-bold text-vj-text">
                  {convenienceFee.toLocaleString('vi-VN')} VND
                </span>
              </div>
              <div className="flex items-center justify-between py-2 border-t border-vj-border-light text-sm font-black text-vj-text">
                <span>Tổng thanh toán</span>
                <span className="text-primary-dark">{grandTotal.toLocaleString('vi-VN')} VND</span>
              </div>
            </div>
          </div>
        </div>

        {/* Security badge PCI-DSS */}
        <div className="bg-vj-surface-2 px-6 py-2 border-t border-vj-border-light flex items-center justify-center gap-1.5 text-xs2 text-vj-text-strong">
          <RiShieldCheckLine size={16} className="text-success" />
          <span>Thông tin của bạn sẽ được mã hoá và bảo mật theo tiêu chuẩn quốc tế PCI-DSS</span>
        </div>

        {/* Footer Red Bar matching Screenshot 2 */}
        <div className="bg-primary-dark text-white px-6 py-3 flex items-center justify-between shadow-vj-lg">
          <div className="leading-tight">
            <span className="text-2xs uppercase font-bold text-amber-200 block">
              Tổng thanh toán
            </span>
            <span className="text-base font-black text-white">
              {grandTotal.toLocaleString('vi-VN')} VND
            </span>
          </div>
          <button
            type="button"
            onClick={onProceed}
            className="bg-vjyellow hover:bg-accent-light text-vj-text font-black px-8 py-2.5 rounded-vj text-sm shadow transition-all active:scale-98"
          >
            Đi tiếp
          </button>
        </div>

        {/* Confirmation popup: Bạn muốn kết thúc giao dịch? matching Screenshot 1 */}
        {showConfirmCancel && (
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm z-30 flex items-center justify-center p-4 animate-fadeIn">
            <div className="bg-white rounded-vj p-5 shadow-2xl max-w-xs w-full text-center space-y-4 border border-vj-border-light animate-scaleUp">
              <h4 className="text-xs font-bold text-vj-text">Bạn muốn kết thúc giao dịch?</h4>
              <div className="flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowConfirmCancel(false)}
                  className="flex-1 bg-vjyellow hover:bg-accent-light text-vj-text font-bold py-2 px-3 rounded-vj text-xs shadow-vj-sm transition-all"
                >
                  Không huỷ
                </button>
                <button
                  type="button"
                  onClick={handleCancelTransaction}
                  className="flex-1 bg-white border border-vj-line text-vj-text-dim font-bold py-2 px-3 rounded-vj text-xs hover:bg-vj-surface-2 transition-all"
                >
                  Huỷ
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
