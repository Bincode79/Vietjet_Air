'use client';
import React, { useCallback, useState } from 'react';
import { getApiErrorMessage } from '@/shared/services';

export type PaymentErrorType =
  | 'validation'
  | 'network'
  | 'server'
  | 'payment_failed'
  | 'booking_not_found'
  | 'method_invalid'
  | 'application_incomplete'
  | 'insufficient_funds'
  | 'expired'
  | 'duplicate'
  | 'unknown';

export interface PaymentError {
  type: PaymentErrorType;
  message: string;
  originalError?: Error | unknown;
  statusCode?: number;
  retryable: boolean;
  actionLabel?: string;
  action?: () => void;
}

const ERROR_MESSAGES: Record<PaymentErrorType, { message: string; retryable: boolean; actionLabel?: string }> = {
  validation: {
    message: 'Thông tin thanh toán không hợp lệ. Vui lòng kiểm tra lại.',
    retryable: true,
    actionLabel: 'Nhập lại',
  },
  network: {
    message: 'Mất kết nối mạng. Vui lòng kiểm tra kết nối và thử lại.',
    retryable: true,
    actionLabel: 'Thử lại',
  },
  server: {
    message: 'Máy chủ đang bận. Vui lòng thử lại sau vài giây.',
    retryable: true,
    actionLabel: 'Thử lại',
  },
  payment_failed: {
    message: 'Thanh toán không thành công. Vui lòng thử phương thức khác.',
    retryable: true,
    actionLabel: 'Chọn phương thức khác',
  },
  booking_not_found: {
    message: 'Không tìm thấy thông tin đặt chỗ.',
    retryable: false,
    actionLabel: 'Quay lại trang chủ',
  },
  method_invalid: {
    message: 'Phương thức thanh toán không được hỗ trợ.',
    retryable: false,
    actionLabel: 'Chọn phương thức khác',
  },
  application_incomplete: {
    message: 'Thiếu thông tin hồ sơ. Vui lòng điền đầy đủ.',
    retryable: true,
    actionLabel: 'Điền hồ sơ',
  },
  insufficient_funds: {
    message: 'Số dư không đủ để thực hiện giao dịch.',
    retryable: true,
    actionLabel: 'Nạp thêm / Chọn phương thức khác',
  },
  expired: {
    message: 'Phiên thanh toán đã hết hạn. Vui lòng tạo đơn mới.',
    retryable: false,
    actionLabel: 'Tạo đơn mới',
  },
  duplicate: {
    message: 'Đơn hàng đã được thanh toán. Đang chuyển đến vé điện tử...',
    retryable: false,
  },
  unknown: {
    message: 'Đã có lỗi xảy ra. Vui lòng thử lại.',
    retryable: true,
    actionLabel: 'Thử lại',
  },
};

function classifyError(err: unknown, context?: string): PaymentError {
  const statusCode = (err as { status?: number; response?: { status?: number } })?.status ??
    (err as { response?: { status?: number } })?.response?.status;

  // 409 = duplicate payment (already handled by gateway-dispatcher)
  if (statusCode === 409) {
    return { type: 'duplicate', message: ERROR_MESSAGES.duplicate.message, originalError: err, statusCode, retryable: false };
  }

  // 400/422 = validation
  if (statusCode === 400 || statusCode === 422) {
    return { type: 'validation', message: getApiErrorMessage(err, ERROR_MESSAGES.validation.message), originalError: err, statusCode, retryable: true };
  }

  // 401/403 = auth/session expired
  if (statusCode === 401 || statusCode === 403) {
    return { type: 'expired', message: ERROR_MESSAGES.expired.message, originalError: err, statusCode, retryable: false };
  }

  // 404 = booking not found
  if (statusCode === 404) {
    return { type: 'booking_not_found', message: ERROR_MESSAGES.booking_not_found.message, originalError: err, statusCode, retryable: false };
  }

  // 5xx = server error
  if (statusCode && statusCode >= 500) {
    return { type: 'server', message: ERROR_MESSAGES.server.message, originalError: err, statusCode, retryable: true };
  }

  // Network errors (no response)
  if (err instanceof TypeError && err.message.includes('fetch')) {
    return { type: 'network', message: ERROR_MESSAGES.network.message, originalError: err, retryable: true };
  }

  // MOVI application incomplete
  if (context === 'movi' && statusCode === 400) {
    return { type: 'application_incomplete', message: ERROR_MESSAGES.application_incomplete.message, originalError: err, statusCode, retryable: true };
  }

  // Insufficient funds keywords
  const errorMessage = getApiErrorMessage(err, '').toLowerCase();
  if (errorMessage.includes('insufficient') || errorMessage.includes('số dư') || errorMessage.includes('không đủ')) {
    return { type: 'insufficient_funds', message: ERROR_MESSAGES.insufficient_funds.message, originalError: err, statusCode, retryable: true };
  }

  // Method invalid
  if (errorMessage.includes('method') || errorMessage.includes('phương thức') || errorMessage.includes('unsupported')) {
    return { type: 'method_invalid', message: ERROR_MESSAGES.method_invalid.message, originalError: err, statusCode, retryable: false };
  }

  // Expired/session
  if (errorMessage.includes('expired') || errorMessage.includes('hết hạn') || errorMessage.includes('session')) {
    return { type: 'expired', message: ERROR_MESSAGES.expired.message, originalError: err, statusCode, retryable: false };
  }

  return { type: 'unknown', message: getApiErrorMessage(err, ERROR_MESSAGES.unknown.message), originalError: err, statusCode, retryable: true };
}

/**
 * Hook xử lý lỗi thanh toán thống nhất.
 * Trả về hàm `handleError` nhận error + context, trả về PaymentError đã format.
 */
export function usePaymentError() {
  const handleError = useCallback((err: unknown, context?: string): PaymentError => {
    const paymentError = classifyError(err, context);
    // Log for debugging (remove in production if needed)
    if (process.env.NODE_ENV === 'development') {
      console.group(`[PaymentError] ${paymentError.type}`);
      console.log('Message:', paymentError.message);
      console.log('Status:', paymentError.statusCode);
      console.log('Retryable:', paymentError.retryable);
      console.log('Original:', paymentError.originalError);
      console.groupEnd();
    }
    return paymentError;
  }, []);

  return { handleError };
}

/**
 * Hook dùng chung cho các component gateway để hiển thị banner lỗi + action retry.
 * Quản lý state error + loading submit.
 */
export function usePaymentErrorState() {
  const [error, setError] = React.useState<PaymentError | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const { handleError } = usePaymentError();

  const clearError = useCallback(() => setError(null), []);

  const executeWithErrorHandling = useCallback(
    async <T,>(fn: () => Promise<T>, context?: string): Promise<T | null> => {
      setSubmitting(true);
      clearError();
      try {
        const result = await fn();
        setSubmitting(false);
        return result;
      } catch (err) {
        const paymentError = handleError(err, context);
        setError(paymentError);
        setSubmitting(false);
        return null;
      }
    },
    [handleError, clearError]
  );

  return {
    error,
    submitting,
    clearError,
    executeWithErrorHandling,
    setError,
    setSubmitting,
  };
}