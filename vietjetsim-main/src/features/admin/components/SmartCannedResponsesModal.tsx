'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Icon } from '@/shared/components/ui';

export interface SmartCannedResponse {
  id: string;
  category: 'greeting' | 'booking' | 'payment' | 'change_refund' | 'delay';
  categoryLabel: string;
  shortcut: string;
  title: string;
  template: string;
}

export const DEFAULT_CANNED_RESPONSES: SmartCannedResponse[] = [
  {
    id: 'g-1',
    category: 'greeting',
    categoryLabel: 'Chào hỏi & Tiếp nhận',
    shortcut: '/chao',
    title: 'Lời chào chuẩn Vietjet CSKH',
    template:
      'Kính chào Quý khách {{name}}, em là Chuyên viên Hỗ trợ Vietjet. Em có thể hỗ trợ thông tin chuyến bay nào cho mình hôm nay ạ?',
  },
  {
    id: 'g-2',
    category: 'greeting',
    categoryLabel: 'Chào hỏi & Tiếp nhận',
    shortcut: '/xinchao-pnr',
    title: 'Xác nhận mã PNR hành khách',
    template:
      'Dạ chào bạn {{name}}, em đã nhận được yêu cầu về mã đặt chỗ {{pnr}}. Em đang kiểm tra thông tin vé trên hệ thống cho mình ngay đây ạ.',
  },
  {
    id: 'b-1',
    category: 'booking',
    categoryLabel: 'Đặt vé & Giữ chỗ',
    shortcut: '/hold-exp',
    title: 'Nhắc giữ chỗ sắp hết hạn',
    template:
      'Mã đặt chỗ {{pnr}} của Quý khách sẽ hết hạn giữ chỗ sau 30 phút. Quý khách vui lòng hoàn tất thanh toán để hệ thống tự động xuất vé điện tử ạ.',
  },
  {
    id: 'b-2',
    category: 'booking',
    categoryLabel: 'Đặt vé & Giữ chỗ',
    shortcut: '/baggage',
    title: 'Hướng dẫn mua hành lý ký gửi',
    template:
      'Dạ đối với vé {{pnr}}, mình có thể mua thêm gói hành lý ký gửi (15kg/20kg/30kg) trước giờ khởi hành tối thiểu 3 tiếng với mức phí ưu đãi nhất ạ.',
  },
  {
    id: 'p-1',
    category: 'payment',
    categoryLabel: 'Thanh toán & Hóa đơn',
    shortcut: '/pay-vietqr',
    title: 'Hướng dẫn chuyển khoản VietQR',
    template:
      'Quý khách vui lòng quét mã VietQR trên trang thanh toán với nội dung chuyển khoản chính xác là {{pnr}} để hệ thống tự động duyệt vé sau 10 giây.',
  },
  {
    id: 'p-2',
    category: 'payment',
    categoryLabel: 'Thanh toán & Hóa đơn',
    shortcut: '/invoice',
    title: 'Yêu cầu xuất hóa đơn VAT',
    template:
      'Dạ để xuất hóa đơn tài chính cho mã {{pnr}}, Quý khách vui lòng cung cấp Tên công ty, Mã số thuế và Địa chỉ đăng ký kinh doanh giúp em nhé ạ.',
  },
  {
    id: 'r-1',
    category: 'change_refund',
    categoryLabel: 'Đổi vé & Hoàn tiền',
    shortcut: '/doi-ve',
    title: 'Quy định đổi chuyến bay',
    template:
      'Dạ đối với vé hạng Eco, phí đổi chuyến là 350.000₫/khách/chặng cộng với chênh lệch giá vé (nếu có). Quý khách muốn đổi sang giờ bay nào ạ?',
  },
  {
    id: 'r-2',
    category: 'change_refund',
    categoryLabel: 'Đổi vé & Hoàn tiền',
    shortcut: '/hoan-ve',
    title: 'Tiến độ xử lý hoàn tiền',
    template:
      'Yêu cầu hoàn vé của Quý khách cho mã {{pnr}} đã được Admin duyệt chuyển tiền. Thời gian nhận tiền về tài khoản ngân hàng từ 1-3 ngày làm việc ạ.',
  },
  {
    id: 'd-1',
    category: 'delay',
    categoryLabel: 'Delay & Điều chỉnh lịch bay',
    shortcut: '/delay-apology',
    title: 'Xin lỗi vì chuyến bay delay',
    template:
      'Vietjet thành thật cáo lỗi cùng Quý khách vì sự thay đổi giờ bay ngoài ý muốn do điều kiện thời tiết/khai thác. Kính mong Quý khách thông cảm ạ.',
  },
];

export interface SmartCannedResponsesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (renderedText: string) => void;
  contextVariables?: {
    name?: string;
    pnr?: string;
    route?: string;
    flightNo?: string;
  };
}

export default function SmartCannedResponsesModal({
  isOpen,
  onClose,
  onSelect,
  contextVariables = {},
}: SmartCannedResponsesModalProps) {
  const [responses, setResponses] = useState<SmartCannedResponse[]>(DEFAULT_CANNED_RESPONSES);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newShortcut, setNewShortcut] = useState('');
  const [newTemplate, setNewTemplate] = useState('');
  const [newCategory, setNewCategory] = useState<SmartCannedResponse['category']>('greeting');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('vj_canned_responses');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setResponses(parsed);
          }
        }
      } catch {
        // Fallback to defaults
      }
    }
  }, [isOpen]);

  const saveResponses = (newItems: SmartCannedResponse[]) => {
    setResponses(newItems);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('vj_canned_responses', JSON.stringify(newItems));
      } catch (err) {
        console.warn('Could not save to localStorage:', err);
      }
    }
  };

  const handleAddNew = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newTemplate.trim()) return;

    const newItem: SmartCannedResponse = {
      id: `custom-${Date.now()}`,
      category: newCategory,
      categoryLabel:
        newCategory === 'greeting'
          ? 'Chào hỏi & Tiếp nhận'
          : newCategory === 'booking'
            ? 'Đặt vé & Giữ chỗ'
            : newCategory === 'payment'
              ? 'Thanh toán & Hóa đơn'
              : newCategory === 'change_refund'
                ? 'Đổi vé & Hoàn tiền'
                : 'Delay & Điều chỉnh lịch bay',
      shortcut: newShortcut.startsWith('/') ? newShortcut : `/${newShortcut || 'custom'}`,
      title: newTitle.trim(),
      template: newTemplate.trim(),
    };

    const updated = [newItem, ...responses];
    saveResponses(updated);
    setIsAddingNew(false);
    setNewTitle('');
    setNewShortcut('');
    setNewTemplate('');
  };

  const handleDelete = (id: string) => {
    const updated = responses.filter((r) => r.id !== id);
    saveResponses(updated);
  };

  const interpolate = (tpl: string) => {
    const name = contextVariables.name || 'Quý khách';
    const pnr = contextVariables.pnr || 'MÃ_PNR';
    return tpl.replace(/\{\{name\}\}/g, name).replace(/\{\{pnr\}\}/g, pnr);
  };

  const filtered = useMemo(() => {
    return responses.filter((r) => {
      const matchCat = activeCategory === 'all' || r.category === activeCategory;
      const query = searchQuery.toLowerCase().trim();
      const matchQuery =
        !query ||
        r.title.toLowerCase().includes(query) ||
        r.shortcut.toLowerCase().includes(query) ||
        r.template.toLowerCase().includes(query);
      return matchCat && matchQuery;
    });
  }, [responses, activeCategory, searchQuery]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="smart-canned-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-fade-in"
    >
      <div className="bg-slate-900 border border-white/10 rounded-3xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden text-slate-100">
        {/* Header */}
        <div className="p-6 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-400">
              <Icon name="ChatBubbleLeftRightIcon" size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 id="smart-canned-title" className="text-lg font-black tracking-wide text-white">
                  Kho Câu Trả Lời Mẫu Thông Minh
                </h3>
                <span className="px-2 py-0.5 rounded text-2xs font-bold uppercase bg-sky-500/20 text-sky-300 border border-sky-500/30">
                  Phím tắt /
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Chọn câu trả lời nhanh hoặc tìm theo phím tắt (tự điền tên khách và mã PNR)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsAddingNew(!isAddingNew)}
              className="px-3.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-bold text-sky-400 border border-sky-500/30 flex items-center gap-1.5 transition-colors"
            >
              <Icon name="PlusIcon" size={14} />
              <span>{isAddingNew ? 'Danh sách' : 'Tạo mẫu mới'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition-all ml-1"
            >
              <Icon name="XMarkIcon" size={20} />
            </button>
          </div>
        </div>

        {isAddingNew ? (
          <form onSubmit={handleAddNew} className="p-6 space-y-4 overflow-y-auto">
            <h4 className="text-sm font-bold text-white">Thêm câu trả lời mẫu tùy chỉnh</h4>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Tiêu đề gợi nhớ:</label>
              <input
                type="text"
                required
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="VD: Hướng dẫn check-in trực tuyến"
                className="w-full px-3.5 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-sky-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Phím tắt (bắt đầu bằng /):
                </label>
                <input
                  type="text"
                  value={newShortcut}
                  onChange={(e) => setNewShortcut(e.target.value)}
                  placeholder="/checkin"
                  className="w-full px-3.5 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-sky-500"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Danh mục:</label>
                <select
                  value={newCategory}
                  onChange={(e) =>
                    setNewCategory(e.target.value as SmartCannedResponse['category'])
                  }
                  className="w-full px-3.5 py-2 bg-slate-800 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-sky-500"
                >
                  <option value="greeting">Chào hỏi & Tiếp nhận</option>
                  <option value="booking">Đặt vé & Giữ chỗ</option>
                  <option value="payment">Thanh toán & Hóa đơn</option>
                  <option value="change_refund">Đổi vé & Hoàn tiền</option>
                  <option value="delay">Delay & Điều chỉnh lịch bay</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Nội dung câu trả lời (Dùng biến <code>{'{{name}}'}</code> và{' '}
                <code>{'{{pnr}}'}</code>):
              </label>
              <textarea
                required
                rows={4}
                value={newTemplate}
                onChange={(e) => setNewTemplate(e.target.value)}
                placeholder="Dạ chào Quý khách {{name}}, em xin thông báo vé {{pnr}} của mình..."
                className="w-full px-3.5 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-sky-500"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsAddingNew(false)}
                className="px-4 py-2 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl text-xs font-bold"
              >
                Hủy
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-sky-600/30"
              >
                Lưu mẫu câu
              </button>
            </div>
          </form>
        ) : (
          <>
            {/* Search & Categories */}
            <div className="p-4 px-6 border-b border-white/5 bg-slate-900/50 space-y-3">
              <div className="relative">
                <Icon
                  name="MagnifyingGlassIcon"
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm theo nội dung hoặc gõ phím tắt (VD: /chao, /doi-ve)..."
                  className="w-full pl-9 pr-4 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                />
              </div>

              {/* Category Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
                {[
                  { id: 'all', label: 'Tất cả' },
                  { id: 'greeting', label: 'Chào hỏi' },
                  { id: 'booking', label: 'Đặt vé' },
                  { id: 'payment', label: 'Thanh toán' },
                  { id: 'change_refund', label: 'Đổi/Hoàn vé' },
                  { id: 'delay', label: 'Delay' },
                ].map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setActiveCategory(cat.id)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                      activeCategory === cat.id
                        ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                        : 'bg-white/5 text-slate-400 hover:text-white border border-transparent'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-4 px-6 space-y-2.5">
              {filtered.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400">
                  Không tìm thấy câu trả lời mẫu nào phù hợp.
                </div>
              ) : (
                filtered.map((item) => {
                  const rendered = interpolate(item.template);
                  const isCustom = item.id.startsWith('custom-');

                  return (
                    <div
                      key={item.id}
                      onClick={() => {
                        onSelect(rendered);
                        onClose();
                      }}
                      className="p-3.5 rounded-2xl bg-white/[0.02] hover:bg-white/[0.06] border border-white/5 hover:border-sky-500/30 cursor-pointer transition-all group relative"
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded border border-sky-500/20">
                            {item.shortcut}
                          </span>
                          <span className="text-xs font-bold text-white group-hover:text-sky-300 transition-colors">
                            {item.title}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-2xs text-slate-500">{item.categoryLabel}</span>
                          {isCustom && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(item.id);
                              }}
                              className="text-slate-500 hover:text-red-400 p-1"
                              title="Xóa mẫu này"
                            >
                              <Icon name="TrashIcon" size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed line-clamp-2">
                        {rendered}
                      </p>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}

        {/* Footer */}
        <div className="p-4 px-6 border-t border-white/10 bg-white/[0.01] flex items-center justify-between text-xs text-slate-400">
          <div>
            Đang hiển thị {filtered.length} mẫu • Click vào mẫu để áp dụng ngay vào khung chat
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-1.5 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white rounded-xl font-bold transition-all"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
