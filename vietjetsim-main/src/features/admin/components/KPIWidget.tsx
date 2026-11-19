import React, { ReactNode } from 'react';

export interface KPIWidgetProps {
  title: string;
  value: string | number;
  subValue?: string;
  change?: number; // e.g. +12.5%
  icon: ReactNode;
  trend?: 'up' | 'down' | 'neutral';
  colorClass?: string;
}

export function KPIWidget({
  title,
  value,
  subValue,
  change,
  icon,
  trend,
  colorClass = 'text-primary',
}: KPIWidgetProps) {
  const isPositive = change !== undefined && change >= 0;

  return (
    <div
      className="rounded-2xl border p-5 transition-all duration-300 hover:translate-y-[-2px] group"
      style={{
        background: 'rgba(30, 41, 59, 0.4)',
        backdropFilter: 'blur(12px)',
        borderColor: 'rgba(255, 255, 255, 0.05)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
      }}
    >
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <p className="text-xs font-bold text-vj-text-muted uppercase tracking-wider">{title}</p>
          <p className="text-2xl font-black font-koho text-white tracking-tight">{value}</p>
          {subValue && <p className="text-xs text-vj-text-muted">{subValue}</p>}
        </div>
        <div
          className={`w-12 h-12 rounded-vj bg-white/5 border border-white/10 flex items-center justify-center transition-transform group-hover:scale-110 ${colorClass}`}
        >
          {icon}
        </div>
      </div>
      {change !== undefined && (
        <div className="mt-3 pt-3 border-t border-white/5 flex items-center gap-1.5 text-xs font-medium">
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded text-2xs font-bold ${
              trend === 'up' || (trend === undefined && isPositive)
                ? 'bg-vj-pay-green text-vj-pay-green border border-vj-pay-green'
                : 'bg-vj-red-dark text-vj-red-dark border border-vj-red-dark'
            }`}
          >
            {isPositive ? '↑ +' : '↓ '}
            {Math.abs(change)}%
          </span>
          <span className="text-vj-text-muted text-xs2">so với hôm qua</span>
        </div>
      )}
    </div>
  );
}

export default KPIWidget;
