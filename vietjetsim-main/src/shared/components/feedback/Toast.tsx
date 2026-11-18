'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type ToastType = 'success' | 'error' | 'warning' | 'info' | 'promo';

export interface ToastAction {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'accent' | 'ghost';
}

export interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number; // ms, 0 = no auto-dismiss
  actions?: ToastAction[];
  icon?: React.ReactNode;
}

interface ToastProps {
  toast: ToastItem;
  onDismiss: (id: string) => void;
}

const TYPE_CONFIG: Record<
  ToastType,
  {
    bar: string;
    bg: string;
    iconBg: string;
    iconColor: string;
    titleColor: string;
    messageColor: string;
    closeBtn: string;
    progressColor: string;
    defaultIcon: React.ReactNode;
  }
> = {
  // ── Thành công: nền vàng-brand rất nhạt, viền vàng-brand ──
  success: {
    bar: 'bg-accent',
    bg: 'bg-accent-50 border-2 border-accent shadow-xl shadow-amber-200/30',
    iconBg: 'bg-accent shadow-md shadow-amber-200/30',
    iconColor: 'text-white',
    titleColor: 'text-vj-ink font-black',
    messageColor: 'text-vj-gray font-medium',
    closeBtn: 'text-vj-gray hover:text-accent-dark hover:bg-accent-100',
    progressColor: 'bg-accent',
    defaultIcon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-white">
        <path
          fillRule="evenodd"
          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
          clipRule="evenodd"
        />
      </svg>
    ),
  },
  error: {
    bar: 'bg-primary',
    bg: 'bg-primary-50 border-2 border-primary shadow-xl shadow-red-600/15',
    iconBg: 'bg-primary shadow-md shadow-red-700/30',
    iconColor: 'text-white',
    titleColor: 'text-primary font-black',
    messageColor: 'text-vj-gray font-medium',
    closeBtn: 'text-vj-gray hover:text-primary hover:bg-primary-100',
    progressColor: 'bg-primary',
    defaultIcon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-white">
        <path
          fillRule="evenodd"
          d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
          clipRule="evenodd"
        />
      </svg>
    ),
  },
  warning: {
    bar: 'bg-accent-dark',
    bg: 'bg-accent-100 border-2 border-accent-dark shadow-xl shadow-amber-300/20',
    iconBg: 'bg-accent-dark text-black shadow-md shadow-amber-300/30',
    iconColor: 'text-black',
    titleColor: 'text-accent-dark font-black',
    messageColor: 'text-vj-gray font-medium',
    closeBtn: 'text-vj-gray hover:text-accent-dark hover:bg-accent-200',
    progressColor: 'bg-accent-dark',
    defaultIcon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-black font-bold">
        <path
          fillRule="evenodd"
          d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
          clipRule="evenodd"
        />
      </svg>
    ),
  },
  info: {
    bar: 'bg-primary-dark',
    bg: 'bg-primary-100 border-2 border-primary-dark shadow-xl shadow-red-600/15',
    iconBg: 'bg-primary-dark shadow-md shadow-red-600/30',
    iconColor: 'text-white',
    titleColor: 'text-primary-dark font-black',
    messageColor: 'text-vj-gray font-medium',
    closeBtn: 'text-vj-gray hover:text-primary-dark hover:bg-primary-200',
    progressColor: 'bg-primary-dark',
    defaultIcon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-white">
        <path
          fillRule="evenodd"
          d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
          clipRule="evenodd"
        />
      </svg>
    ),
  },
  promo: {
    bar: 'bg-gradient-to-r from-primary via-red-500 to-vjyellow',
    bg: 'bg-gradient-to-br from-accent-50 via-white to-primary-50 border-2 border-accent-dark shadow-xl shadow-amber-200/20',
    iconBg: 'bg-accent text-black shadow-md shadow-amber-200/30',
    iconColor: 'text-black',
    titleColor: 'text-vj-ink font-black',
    messageColor: 'text-vj-gray font-medium',
    closeBtn: 'text-vj-gray hover:text-vj-ink hover:bg-accent-100',
    progressColor: 'bg-gradient-to-r from-primary to-vjyellow',
    defaultIcon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-black">
        <path
          fillRule="evenodd"
          d="M5 2a2 2 0 00-2 2v14l3.5-2 3.5 2 3.5-2 3.5 2V4a2 2 0 00-2-2H5zm4.707 3.707a1 1 0 00-1.414-1.414l-3 3a1 1 0 000 1.414l3 3a1 1 0 001.414-1.414L8.414 10l1.293-1.293zm2.586 0L13.586 7l-1.293 1.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 00-1.414 1.414L13.586 7l-1.293-1.293z"
          clipRule="evenodd"
        />
      </svg>
    ),
  },
};

function ToastProgressBar({
  duration,
  paused,
  color,
}: {
  duration: number;
  paused: boolean;
  color: string;
}) {
  return (
    <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-black/5 overflow-hidden rounded-b-xl">
      <div
        className={`h-full ${color} origin-left`}
        style={{
          animation: `toast-progress ${duration}ms linear forwards`,
          animationPlayState: paused ? 'paused' : 'running',
        }}
      />
    </div>
  );
}

function ToastNotification({ toast, onDismiss }: ToastProps) {
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [paused, setPaused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const config = TYPE_CONFIG[toast.type];
  const duration = toast.duration ?? 5000;

  const dismiss = () => {
    setExiting(true);
    setTimeout(() => onDismiss(toast.id), 320);
  };

  useEffect(() => {
    // Mount animation
    const mountTimer = setTimeout(() => setVisible(true), 10);
    return () => clearTimeout(mountTimer);
  }, []);

  useEffect(() => {
    if (duration === 0) return;
    if (paused) {
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }
    timerRef.current = setTimeout(dismiss, duration);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused, duration]);

  return (
    <div
      className={`relative w-[360px] max-w-[calc(100vw-32px)] rounded-xl shadow-vj-toast overflow-hidden cursor-pointer transition-all duration-300 ease-vj ${config.bg}
        ${visible && !exiting ? 'opacity-100 translate-x-0 scale-100' : 'opacity-0 translate-x-8 scale-95'}
      `}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      role="alert"
      aria-live="assertive"
    >
      {/* Top accent bar */}
      <div className={`h-1 w-full ${config.bar}`} />

      <div className="flex items-start gap-3 px-4 pt-3 pb-4">
        {/* Icon */}
        <div
          className={`flex-shrink-0 w-8 h-8 rounded-lg ${config.iconBg} ${config.iconColor} flex items-center justify-center mt-0.5`}
        >
          {toast.icon ?? config.defaultIcon}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className={`text-sm leading-tight font-['KoHo',sans-serif] ${config.titleColor}`}>
            {toast.title}
          </p>
          {toast.message && (
            <p className={`text-xs mt-1 leading-relaxed ${config.messageColor}`}>{toast.message}</p>
          )}

          {/* Action buttons */}
          {toast.actions && toast.actions.length > 0 && (
            <div className="flex items-center gap-2 mt-2.5 flex-wrap">
              {toast.actions.map((action, idx) => (
                <button
                  key={idx}
                  onClick={(e) => {
                    e.stopPropagation();
                    action.onClick();
                    dismiss();
                  }}
                  className={`text-xs px-3 py-1.5 rounded-lg transition-all duration-150 active:scale-95 font-['KoHo',sans-serif]
                    ${
                      action.variant === 'ghost'
                        ? 'text-gray-700 hover:text-black hover:bg-black/5 font-bold'
                        : 'bg-vjyellow text-gray-950 font-black border border-amber-300 shadow-xs hover:brightness-105'
                    }
                  `}
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Dismiss button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            dismiss();
          }}
          className={`flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center transition-colors duration-150 mt-0.5 ${config.closeBtn}`}
          aria-label="Đóng thông báo"
        >
          <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
            <path d="M4.646 4.646a.5.5 0 01.708 0L8 7.293l2.646-2.647a.5.5 0 01.708.708L8.707 8l2.647 2.646a.5.5 0 01-.708.708L8 8.707l-2.646 2.647a.5.5 0 01-.708-.708L7.293 8 4.646 5.354a.5.5 0 010-.708z" />
          </svg>
        </button>
      </div>

      {/* Progress bar */}
      {duration > 0 && (
        <ToastProgressBar duration={duration} paused={paused} color={config.progressColor} />
      )}
    </div>
  );
}

export interface ToastContainerProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
  position?:
    | 'top-right'
    | 'top-left'
    | 'bottom-right'
    | 'bottom-left'
    | 'top-center'
    | 'bottom-center';
}

const POSITION_CLASSES: Record<NonNullable<ToastContainerProps['position']>, string> = {
  'top-right':
    'top-[108px] sm:top-[88px] right-3 sm:right-6 left-3 sm:left-auto items-center sm:items-end',
  'top-left':
    'top-[108px] sm:top-[88px] left-3 sm:left-6 right-3 sm:right-auto items-center sm:items-start',
  'bottom-right': 'bottom-4 right-3 sm:right-4 left-3 sm:left-auto items-center sm:items-end',
  'bottom-left': 'bottom-4 left-3 sm:left-4 right-3 sm:right-auto items-center sm:items-start',
  'top-center': 'top-[108px] sm:top-[88px] left-1/2 -translate-x-1/2 items-center px-2',
  'bottom-center': 'bottom-4 left-1/2 -translate-x-1/2 items-center px-2',
};

export function ToastContainer({ toasts, onDismiss, position = 'top-right' }: ToastContainerProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (toasts.length === 0) return null;

  const content = (
    <div
      className={`fixed z-[99999] flex flex-col gap-2.5 pointer-events-none ${POSITION_CLASSES[position]}`}
      aria-label="Thông báo"
    >
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <ToastNotification toast={toast} onDismiss={onDismiss} />
        </div>
      ))}
    </div>
  );

  if (typeof document !== 'undefined' && mounted) {
    return createPortal(content, document.body);
  }

  return content;
}

export default ToastNotification;
