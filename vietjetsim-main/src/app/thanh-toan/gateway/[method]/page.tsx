'use client';
import React, { Suspense } from 'react';
import { Header, Footer } from '@/shared/components/navigation';
import GatewayDispatcher from './gateway-dispatcher';

export default function PaymentGatewayPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-vj-blue-tint-5 via-vj-blue-tint-4 to-vj-blue-tint-3 relative">
      <Header variant="subpage" mobileTitle="CỔNG THANH TOÁN" mobileRed />
      <main id="main-content">
        <Suspense fallback={<div className="p-10 text-center">Đang tải...</div>}>
          <GatewayDispatcher />
        </Suspense>
      </main>
      <Footer />
    </div>
  );
}
