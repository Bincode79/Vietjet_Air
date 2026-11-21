'use client';
import React from 'react';

/**
 * Loading skeleton cho các gateway pages.
 * Dùng chung cho tất cả phương thức thanh toán để tránh layout shift khi chuyển method.
 */
export default function GatewaySkeleton() {
  return (
    <div className="max-w-xl mx-auto space-y-4 animate-pulse">
      {/* Header skeleton */}
      <div className="h-12 bg-vj-surface-2 rounded-xl" />

      {/* QR/Card form skeleton */}
      <div className="h-56 bg-vj-surface-2 rounded-2xl border border-vj-border-light" />

      {/* Amount summary skeleton */}
      <div className="h-16 bg-vj-surface-2 rounded-xl border border-vj-border-light" />

      {/* Steps skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 bg-vj-surface-2 rounded-vj border border-vj-border-light" />
        ))}
      </div>

      {/* Polling status skeleton */}
      <div className="h-10 bg-vj-surface-2 rounded-vj border border-vj-border-light" />
    </div>
  );
}
