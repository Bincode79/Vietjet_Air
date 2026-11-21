import { redirect } from 'next/navigation';

/**
 * `/dat-ve` không có nội dung riêng — chuyển về form đặt vé trên trang chủ
 * (giống `/tim-ve` khi thiếu tham số tìm kiếm).
 */
export default function DatVeIndex() {
  redirect('/trang-chu#hero-booking-form');
}
