'use client';
import { Suspense } from 'react';
import { Header, Footer } from '@/shared/components/navigation';
import SuccessContent from './success-content';

export default function PaymentSuccessPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-vj-blue-tint-5 via-vj-blue-tint-4 to-vj-blue-tint-3 relative">
      <Header variant="subpage" mobileTitle="KẾT QUẢ ĐẶT VÉ" mobileRed />
      <main id="main-content">
        <Suspense fallback={<div className="p-10 text-center">Đang tải...</div>}>
          <SuccessContent />
        </Suspense>
      </main>
      <Footer />
    </div>
  );
}
