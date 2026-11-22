'use client';
import React, { useState, useEffect } from 'react';
import { Icon } from '@/shared/components/ui';
import { sendFareDocument, type FareDocumentRouteItem } from '@/features/admin';
import { getApiErrorMessage } from '@/shared/services';

interface ToastAPI {
  success: (title: string, message?: string, options?: object) => void;
  error: (title: string, message?: string, options?: object) => void;
  warning?: (title: string, message?: string, options?: object) => void;
  info?: (title: string, message?: string, options?: object) => void;
}

interface SendFareDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialRoutes?: FareDocumentRouteItem[];
  onToast?: ToastAPI;
}

const FARE_LADDER_RATIO = 2.77;

export default function SendFareDocumentModal({
  isOpen,
  onClose,
  initialRoutes,
  onToast,
}: SendFareDocumentModalProps) {
  const [activeTab, setActiveTab] = useState<'config' | 'preview'>('config');
  const [isSending, setIsSending] = useState(false);

  // Document details
  const [documentNo, setDocumentNo] = useState('');
  const [title, setTitle] = useState(
    'THÔNG BÁO VỀ VIỆC ÁP DỤNG BIỂU GIÁ VÉ VÀ CHÍNH SÁCH MỚI TRÊN CÁC ĐƯỜNG BAY'
  );
  const [effectiveDate, setEffectiveDate] = useState('Áp dụng ngay từ hôm nay');
  const [note, setNote] = useState(
    'Giá vé chưa bao gồm thuế, phí sân bay theo quy định của Cục Hàng không Việt Nam. Tiêu chuẩn hành lý xách tay 07kg/khách.'
  );

  // Recipients
  const [recipientsType, setRecipientsType] = useState<'agencies' | 'custom' | 'all'>('agencies');
  const [customEmails, setCustomEmails] = useState('daily@vietjet.shop, booking@vietjetsim.vn');
  const [autoSendOnUpdate, setAutoSendOnUpdate] = useState(true);

  // Routes
  const [routes, setRoutes] = useState<FareDocumentRouteItem[]>([
    {
      from: 'SGN',
      to: 'HAN',
      flightNo: 'VJ 120 / VJ 121',
      ecoPrice: 599000,
      businessPrice: 1659000,
    },
    {
      from: 'SGN',
      to: 'DAD',
      flightNo: 'VJ 301 / VJ 302',
      ecoPrice: 499000,
      businessPrice: 1382000,
    },
    {
      from: 'HAN',
      to: 'PQC',
      flightNo: 'VJ 451 / VJ 452',
      ecoPrice: 799000,
      businessPrice: 2213000,
    },
  ]);

  // Init document number
  useEffect(() => {
    if (isOpen) {
      const now = new Date();
      const code = `CV-VJC/${now.getFullYear()}/GVE-${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
      setDocumentNo(code);
      if (initialRoutes && initialRoutes.length > 0) {
        setRoutes(initialRoutes);
      }
    }
  }, [isOpen, initialRoutes]);

  if (!isOpen) return null;

  const handleAddRoute = () => {
    setRoutes([
      ...routes,
      {
        from: 'SGN',
        to: 'CXR',
        flightNo: 'VJ 601',
        ecoPrice: 399000,
        businessPrice: Math.round(399000 * FARE_LADDER_RATIO),
      },
    ]);
  };

  const handleRemoveRoute = (index: number) => {
    if (routes.length <= 1) {
      onToast?.error('Lỗi', 'Bảng biểu giá vé cần tối thiểu 1 chặng bay.');
      return;
    }
    setRoutes(routes.filter((_, idx) => idx !== index));
  };

  const handleRouteChange = (
    index: number,
    field: keyof FareDocumentRouteItem,
    value: string | number
  ) => {
    const updated = [...routes];
    if (field === 'ecoPrice') {
      const eco = Math.max(0, Number(value));
      updated[index] = {
        ...updated[index],
        ecoPrice: eco,
        businessPrice: Math.round(eco * FARE_LADDER_RATIO),
      };
    } else {
      updated[index] = {
        ...updated[index],
        [field]: value,
      };
    }
    setRoutes(updated);
  };

  const handleSend = async () => {
    if (routes.length === 0) {
      onToast?.error('Lỗi gửi văn bản', 'Vui lòng cung cấp ít nhất một chặng bay trong biểu giá.');
      return;
    }

    const emailList = customEmails
      .split(/[,\n;]/)
      .map((e) => e.trim())
      .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));

    if (recipientsType === 'custom' && emailList.length === 0) {
      onToast?.error('Lỗi email', 'Vui lòng nhập ít nhất một địa chỉ email người nhận hợp lệ.');
      return;
    }

    setIsSending(true);
    try {
      const res = await sendFareDocument({
        documentNo,
        title,
        effectiveDate,
        routes,
        recipientsType,
        customEmails: emailList,
        note,
      });

      if (res.success) {
        onToast?.success(
          'Đã gửi văn bản giá vé tự động thành công',
          `Công văn ${res.documentNo} đã được gửi tới ${res.sentCount} đối tác/đại lý.`
        );
        onClose();
      } else {
        onToast?.error('Lỗi gửi văn bản', res.message);
      }
    } catch (err) {
      onToast?.error('Lỗi hệ thống', getApiErrorMessage(err, 'Không thể gửi văn bản giá vé.'));
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-3xl text-white flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/20 text-primary flex items-center justify-center">
              <Icon name="DocumentTextIcon" size={22} />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">
                Gửi văn bản thông báo giá vé tự động 📄⚡
              </h3>
              <p className="text-xs text-vj-admin-muted mt-0.5">
                Phát hành công văn biểu giá vé chính thức và gửi tự động tới Đại lý, Đối tác &amp;
                Hội viên
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-white flex items-center justify-center transition-colors"
          >
            <Icon name="XMarkIcon" size={16} />
          </button>
        </div>

        {/* Tab switch */}
        <div className="flex border-b border-white/10 px-5 pt-3 bg-slate-950/40">
          <button
            type="button"
            onClick={() => setActiveTab('config')}
            className={`pb-3 px-4 text-xs font-bold transition-all border-b-2 flex items-center gap-2 ${
              activeTab === 'config'
                ? 'border-primary text-primary'
                : 'border-transparent text-vj-admin-muted hover:text-white'
            }`}
          >
            <Icon name="PencilIcon" size={14} />
            Cấu hình Công văn &amp; Danh sách gửi
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('preview')}
            className={`pb-3 px-4 text-xs font-bold transition-all border-b-2 flex items-center gap-2 ${
              activeTab === 'preview'
                ? 'border-primary text-primary'
                : 'border-transparent text-vj-admin-muted hover:text-white'
            }`}
          >
            <Icon name="EyeIcon" size={14} />
            Xem trước Văn bản Công văn (Live Preview)
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-5 overflow-y-auto">
          {activeTab === 'config' ? (
            <div className="space-y-4">
              {/* Thông tin văn bản */}
              <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
                <span className="text-xs font-black text-amber-400 uppercase tracking-wider block">
                  1. Thông tin Công văn biểu giá vé
                </span>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-3xs font-bold text-vj-admin-muted uppercase mb-1">
                      Số công văn
                    </label>
                    <input
                      type="text"
                      value={documentNo}
                      onChange={(e) => setDocumentNo(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-white/15 rounded-xl text-xs font-mono font-bold text-white focus:outline-none focus:border-primary"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-3xs font-bold text-vj-admin-muted uppercase mb-1">
                      Hiệu lực áp dụng
                    </label>
                    <input
                      type="text"
                      value={effectiveDate}
                      onChange={(e) => setEffectiveDate(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-white/15 rounded-xl text-xs font-bold text-white focus:outline-none focus:border-primary"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-3xs font-bold text-vj-admin-muted uppercase mb-1">
                    Tiêu đề thông báo
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-white/15 rounded-xl text-xs font-bold text-white focus:outline-none focus:border-primary"
                  />
                </div>
              </div>

              {/* Đối tượng nhận */}
              <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
                <span className="text-xs font-black text-emerald-400 uppercase tracking-wider block">
                  2. Đối tượng nhận thông báo tự động
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <label
                    className={`p-3 rounded-xl border cursor-pointer transition-all ${
                      recipientsType === 'agencies'
                        ? 'bg-emerald-500/10 border-emerald-500 text-white'
                        : 'bg-slate-950 border-white/10 text-white/70 hover:border-white/20'
                    }`}
                  >
                    <input
                      type="radio"
                      name="recipients"
                      checked={recipientsType === 'agencies'}
                      onChange={() => setRecipientsType('agencies')}
                      className="sr-only"
                    />
                    <div className="font-bold text-xs">🏢 Toàn bộ Đại lý</div>
                    <div className="text-3xs text-vj-admin-muted mt-1">
                      Tự động gửi email tới tất cả đại lý F1, F2 trong hệ thống
                    </div>
                  </label>

                  <label
                    className={`p-3 rounded-xl border cursor-pointer transition-all ${
                      recipientsType === 'custom'
                        ? 'bg-emerald-500/10 border-emerald-500 text-white'
                        : 'bg-slate-950 border-white/10 text-white/70 hover:border-white/20'
                    }`}
                  >
                    <input
                      type="radio"
                      name="recipients"
                      checked={recipientsType === 'custom'}
                      onChange={() => setRecipientsType('custom')}
                      className="sr-only"
                    />
                    <div className="font-bold text-xs">✉️ Email tùy chỉnh</div>
                    <div className="text-3xs text-vj-admin-muted mt-1">
                      Nhập danh sách email đối tác cụ thể
                    </div>
                  </label>

                  <label
                    className={`p-3 rounded-xl border cursor-pointer transition-all ${
                      recipientsType === 'all'
                        ? 'bg-emerald-500/10 border-emerald-500 text-white'
                        : 'bg-slate-950 border-white/10 text-white/70 hover:border-white/20'
                    }`}
                  >
                    <input
                      type="radio"
                      name="recipients"
                      checked={recipientsType === 'all'}
                      onChange={() => setRecipientsType('all')}
                      className="sr-only"
                    />
                    <div className="font-bold text-xs">🌐 Đại lý + Hội viên</div>
                    <div className="text-3xs text-vj-admin-muted mt-1">
                      Gửi công văn cho đại lý &amp; thông báo cho hội viên SkyJoy
                    </div>
                  </label>
                </div>

                {recipientsType === 'custom' && (
                  <div>
                    <label className="block text-3xs font-bold text-vj-admin-muted uppercase mb-1">
                      Danh sách email nhận tin (cách nhau bởi dấu phẩy hoặc xuống dòng):
                    </label>
                    <textarea
                      rows={2}
                      value={customEmails}
                      onChange={(e) => setCustomEmails(e.target.value)}
                      placeholder="daily1@vietjet.shop, daily2@agency.com..."
                      className="w-full px-3 py-2 bg-slate-950 border border-white/15 rounded-xl font-mono text-xs text-white focus:outline-none focus:border-emerald-400"
                    />
                  </div>
                )}
              </div>

              {/* Bảng biểu giá vé */}
              <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-rose-400 uppercase tracking-wider">
                    3. Biểu giá vé các chặng bay ({routes.length} chặng)
                  </span>
                  <button
                    type="button"
                    onClick={handleAddRoute}
                    className="px-2.5 py-1 bg-white/10 hover:bg-white/20 text-rose-300 rounded-lg text-xs font-bold transition-colors"
                  >
                    + Thêm chặng
                  </button>
                </div>

                <div className="space-y-2">
                  {routes.map((route, idx) => (
                    <div
                      key={idx}
                      className="bg-slate-950/80 border border-white/10 rounded-xl p-3 grid grid-cols-2 sm:grid-cols-6 gap-2 items-center"
                    >
                      <div>
                        <label className="block text-3xs text-vj-admin-muted font-bold">
                          Điểm đi
                        </label>
                        <input
                          type="text"
                          value={route.from}
                          onChange={(e) =>
                            handleRouteChange(idx, 'from', e.target.value.toUpperCase())
                          }
                          className="w-full px-2 py-1 bg-slate-900 border border-white/10 rounded-lg text-xs font-bold text-white text-center"
                        />
                      </div>
                      <div>
                        <label className="block text-3xs text-vj-admin-muted font-bold">
                          Điểm đến
                        </label>
                        <input
                          type="text"
                          value={route.to}
                          onChange={(e) =>
                            handleRouteChange(idx, 'to', e.target.value.toUpperCase())
                          }
                          className="w-full px-2 py-1 bg-slate-900 border border-white/10 rounded-lg text-xs font-bold text-white text-center"
                        />
                      </div>
                      <div>
                        <label className="block text-3xs text-vj-admin-muted font-bold">
                          Số hiệu
                        </label>
                        <input
                          type="text"
                          value={route.flightNo || ''}
                          onChange={(e) => handleRouteChange(idx, 'flightNo', e.target.value)}
                          className="w-full px-2 py-1 bg-slate-900 border border-white/10 rounded-lg text-xs font-mono text-white text-center"
                          placeholder="VJ 120"
                        />
                      </div>
                      <div>
                        <label className="block text-3xs text-emerald-400 font-bold">
                          Giá Eco (₫)
                        </label>
                        <input
                          type="number"
                          step={1000}
                          value={route.ecoPrice}
                          onChange={(e) => handleRouteChange(idx, 'ecoPrice', e.target.value)}
                          className="w-full px-2 py-1 bg-slate-900 border border-white/10 rounded-lg text-xs font-bold text-emerald-400 text-right"
                        />
                      </div>
                      <div>
                        <label className="block text-3xs text-rose-400 font-bold">
                          Giá SkyBoss (₫)
                        </label>
                        <input
                          type="number"
                          step={1000}
                          value={route.businessPrice}
                          onChange={(e) =>
                            handleRouteChange(idx, 'businessPrice', Number(e.target.value))
                          }
                          className="w-full px-2 py-1 bg-slate-900 border border-white/10 rounded-lg text-xs font-bold text-rose-400 text-right"
                        />
                      </div>
                      <div className="flex justify-end pt-3 sm:pt-0">
                        <button
                          type="button"
                          onClick={() => handleRemoveRoute(idx)}
                          className="w-7 h-7 rounded-lg bg-white/5 hover:bg-rose-500/20 text-rose-400 flex items-center justify-center transition-colors"
                          title="Xóa chặng này"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Ghi chú & Tự động hóa */}
              <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
                <div>
                  <label className="block text-3xs font-bold text-vj-admin-muted uppercase mb-1">
                    Ghi chú &amp; Điều kiện bổ sung trong công văn:
                  </label>
                  <textarea
                    rows={2}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-white/15 rounded-xl text-xs text-white focus:outline-none focus:border-primary"
                  />
                </div>

                <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-white/90 pt-1">
                  <input
                    type="checkbox"
                    checked={autoSendOnUpdate}
                    onChange={(e) => setAutoSendOnUpdate(e.target.checked)}
                    className="rounded border-white/20 text-primary focus:ring-primary bg-slate-900"
                  />
                  <span>
                    Bật chế độ tự động gửi thông báo giá vé cho Đại lý mỗi khi hoàn tất Điều chỉnh
                    giá vé
                  </span>
                </label>
              </div>
            </div>
          ) : (
            /* Mode 2: Live Preview */
            <div className="bg-white text-slate-900 rounded-xl p-6 shadow-vj-lg font-sans border border-stone-200 space-y-4">
              <div className="border-b-2 border-primary pb-3">
                <div className="flex items-center justify-between text-xs text-stone-500 font-semibold uppercase">
                  <span>Số: {documentNo}</span>
                  <span>Hà Nội, ngày {new Date().toLocaleDateString('vi-VN')}</span>
                </div>
                <div className="text-center my-3">
                  <h4 className="text-xs font-bold text-stone-600 uppercase tracking-widest">
                    CÔNG TY CỔ PHẦN HÀNG KHÔNG VIETJET
                  </h4>
                  <h3 className="text-base font-black text-primary uppercase mt-1">{title}</h3>
                  <p className="text-xs text-stone-500 mt-0.5 italic">{effectiveDate}</p>
                </div>
              </div>

              <div className="text-xs text-stone-700 leading-relaxed space-y-2">
                <p>
                  <strong>Kính gửi:</strong>{' '}
                  {recipientsType === 'agencies'
                    ? 'Quý Đại lý bán vé máy bay trên toàn quốc'
                    : recipientsType === 'all'
                      ? 'Quý Đại lý, Quý Đối tác & Quý Khách hàng'
                      : 'Quý Đối tác & Khách hàng'}
                </p>
                <p>
                  Công ty Cổ phần Hàng không Vietjet trân trọng gửi tới Quý vị văn bản biểu giá vé
                  áp dụng cho các đường bay như sau:
                </p>
              </div>

              {/* Bảng biểu giá */}
              <div className="border border-stone-300 rounded-lg overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead className="bg-stone-100 text-stone-800 border-b border-stone-300">
                    <tr>
                      <th className="p-2.5 font-bold">Chặng bay</th>
                      <th className="p-2.5 font-bold">Số hiệu</th>
                      <th className="p-2.5 text-right font-bold text-emerald-700">Hạng Eco</th>
                      <th className="p-2.5 text-right font-bold text-stone-600">Hạng Deluxe</th>
                      <th className="p-2.5 text-right font-bold text-primary">Hạng SkyBoss</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-200">
                    {routes.map((r, i) => (
                      <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-stone-50'}>
                        <td className="p-2.5 font-bold text-stone-900">
                          {r.from} ➔ {r.to}
                        </td>
                        <td className="p-2.5 font-mono text-stone-600">{r.flightNo || 'Tất cả'}</td>
                        <td className="p-2.5 text-right font-bold text-emerald-700">
                          {r.ecoPrice.toLocaleString('vi-VN')} ₫
                        </td>
                        <td className="p-2.5 text-right text-stone-600">
                          {(r.ecoPrice + 250000).toLocaleString('vi-VN')} ₫
                        </td>
                        <td className="p-2.5 text-right font-bold text-primary">
                          {(
                            r.businessPrice || Math.round(r.ecoPrice * FARE_LADDER_RATIO)
                          ).toLocaleString('vi-VN')}{' '}
                          ₫
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {note && (
                <div className="bg-amber-50 border-l-4 border-amber-500 p-2.5 text-xs text-amber-900 rounded">
                  <strong>Ghi chú:</strong> {note}
                </div>
              )}

              <div className="pt-4 flex justify-between items-end text-xs text-stone-600">
                <div>
                  <p className="font-bold text-stone-700">Nơi nhận:</p>
                  <p>- Như trên;</p>
                  <p>- Lưu: VT, BTM.</p>
                </div>
                <div className="text-right">
                  <p className="uppercase font-bold text-stone-800">
                    TM. CÔNG TY CP HÀNG KHÔNG VIETJET
                  </p>
                  <p className="font-black text-primary mt-1">
                    BAN THƯƠNG MẠI &amp; QUẢN LÝ GIÁ VÉ
                  </p>
                  <div className="h-10 flex items-center justify-end text-3xs text-stone-400 italic">
                    (Đã ký duyệt điện tử)
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-5 border-t border-white/10 bg-slate-950/50">
          <div className="text-xs text-vj-admin-muted">
            Sẽ gửi tới:{' '}
            <strong className="text-white">
              {recipientsType === 'agencies'
                ? 'Toàn bộ Đại lý kích hoạt'
                : recipientsType === 'all'
                  ? 'Tất cả Đại lý & Hội viên'
                  : 'Danh sách email tùy chỉnh'}
            </strong>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSending}
              className="px-4 py-2.5 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-xs font-bold text-white transition-colors disabled:opacity-50"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleSend}
              disabled={isSending}
              className="px-6 py-2.5 rounded-xl bg-primary hover:bg-primary-dark text-white text-xs font-black tracking-wider uppercase flex items-center gap-2 shadow-glow-red transition-all disabled:opacity-50"
            >
              {isSending ? (
                <>
                  <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  <span>Đang gửi văn bản...</span>
                </>
              ) : (
                <>
                  <Icon name="PaperAirplaneIcon" size={14} />
                  <span>Gửi văn bản tự động ngay 🚀</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
