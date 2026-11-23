'use client';

import Link from 'next/link';
import { AppImage } from '@/shared/components/ui';

/** 4 thẻ dịch vụ nhỏ, bo góc 12px, nền trung tính, padding 12px — icon trên,
 * tiêu đề 14px/700, mô tả 12px. Grid responsive cho mỗi thẻ một vùng bố cục
 * riêng và để chiều cao tự tăng theo nội dung, tránh mô tả dài đè lên thẻ kế
 * bên hoặc section tiếp theo. */
const SERVICE_CARDS = [
  {
    title: 'SkyJoy',
    description: 'Tích điểm, đổi thưởng và nhận ưu đãi thành viên Vietjet.',
    href: '/tai-khoan',
    icon: '/images/subservices/skyjoy.png',
  },
  {
    title: 'Swift 247',
    description: 'Gửi hàng nhanh chóng toàn quốc trong 24 giờ.',
    href: '/dich-vu?service=cargo',
    icon: '/images/brand/vietjet-ribbon.png',
  },
  {
    title: 'E-Sim',
    description: 'Mua e-SIM du lịch và kết nối ngay khi hạ cánh.',
    href: '/dich-vu?service=esim',
    icon: '/images/subservices/esim.png',
  },
  {
    title: 'E-Visa',
    description: 'Thủ tục điện tử nhanh chóng cho hành trình của bạn.',
    href: '/dich-vu?service=evisa',
    icon: '/images/subservices/evisa.png',
  },
] as const;

export default function ServiceStripSection() {
  return (
    <section className="bg-white pt-1 pb-4 sm:pt-2 sm:pb-6 lg:pt-2 lg:pb-8">
      <div className="vj-section-wide">
        <div className="mt-1 grid grid-cols-1 gap-3 sm:mt-2 sm:grid-cols-2 lg:grid-cols-4 lg:gap-4">
          {SERVICE_CARDS.map((card) => (
            <Link
              key={card.title}
              href={card.href}
              className="vj-service-card flex min-w-0 flex-col overflow-hidden break-words transition-transform duration-200 hover:-translate-y-1"
            >
              <AppImage
                src={card.icon}
                alt=""
                className="h-8 w-8 shrink-0 object-contain mb-1"
                width={32}
                height={32}
              />
              <span className="mt-1 block text-sm font-bold text-[var(--vj-ink)]">
                {card.title}
              </span>
              <span className="mt-0.5 block text-xs leading-4 text-[var(--vj-muted)]">
                {card.description}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
