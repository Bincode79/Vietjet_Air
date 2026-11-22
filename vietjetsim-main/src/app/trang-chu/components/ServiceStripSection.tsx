'use client';

import Link from 'next/link';
import { AppImage } from '@/shared/components/ui';

/** 4 thẻ dịch vụ nhỏ, số đo site thật (đo 13/11/2026): ~178×96 px desktop,
 * ~160×88 px mobile, bo góc 12px, nền rgba(161,117,117,0.07), padding 12px —
 * icon trên, tiêu đề 14px/700, mô tả 12px. Luôn một hàng ngang (overflow-x-auto
 * trên mobile), thay vì rơi xuống nhiều hàng. */
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
    <section className="bg-white pt-4 pb-8 sm:pt-6 sm:pb-12 lg:pt-8 lg:pb-16">
      <div className="vj-section-wide">
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1 sm:mt-5">
          {SERVICE_CARDS.map((card) => (
            <Link
              key={card.title}
              href={card.href}
              className="vj-service-card flex w-[160px] min-w-[160px] max-w-[160px] shrink-0 flex-col overflow-hidden break-words transition-transform duration-200 hover:-translate-y-1 sm:w-[178px] sm:min-w-[178px] sm:max-w-[178px]"
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
