'use client';

import { useEffect, useState } from 'react';
import {
  HOMEPAGE_SECTION_CATALOG,
  type PageLayout,
  type PageSection,
  type SectionStyle,
} from '../types';
import { savePageLayout } from '../services/visualEditorService';
import VisualEditorCanvas from './VisualEditorCanvas';

interface VisualEditorPanelProps {
  pagePath: string;
  initialLayout: PageLayout;
}

/**
 * Bảng điều khiển của trình soạn thảo trực quan.
 *
 * Bố cục được sửa trong bộ nhớ (`layout`) và chỉ ghi xuống DB khi bấm "Lưu".
 * Đây là chủ ý: một bố cục bán xong nhưng chưa lưu không nên làm thay đổi
 * trang chủ đang chạy.
 */
export default function VisualEditorPanel({ pagePath, initialLayout }: VisualEditorPanelProps) {
  const [layout, setLayout] = useState<PageLayout>(initialLayout);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [message, setMessage] = useState<string>('');
  const [isDirty, setIsDirty] = useState(false);

  // Khi parent nạp được layout từ server, đồng bộ vào state.
  useEffect(() => {
    setLayout(initialLayout);
    setIsDirty(false);
  }, [initialLayout]);

  const updateLayout = (updater: (current: PageLayout) => PageLayout) => {
    setLayout((current) => updater(current));
    setIsDirty(true);
    setStatus('idle');
  };

  const handleReorder = (orderedIds: string[]) => {
    updateLayout((current) => {
      const byId = new Map<string, PageSection>(
        current.sections.map((section) => [section.id as string, section])
      );
      const reordered = orderedIds
        .map((id) => byId.get(id))
        .filter((section): section is NonNullable<typeof section> => Boolean(section));

      // Section không có trong danh sách mới (không thể xảy ra với GrapesJS,
      // nhưng để an toàn) được giữ lại ở cuối.
      const rest = current.sections.filter((section) => !orderedIds.includes(section.id));

      return { version: 1, sections: [...reordered, ...rest] };
    });
  };

  const handleStyleChange = (sectionId: string, style: SectionStyle) => {
    updateLayout((current) => ({
      version: 1,
      sections: current.sections.map((section) =>
        section.id === sectionId ? { ...section, style } : section
      ),
    }));
  };

  const toggleVisibility = (sectionId: string) => {
    updateLayout((current) => ({
      version: 1,
      sections: current.sections.map((section) =>
        section.id === sectionId ? { ...section, visible: section.visible === false } : section
      ),
    }));
  };

  const moveSection = (sectionId: string, direction: -1 | 1) => {
    updateLayout((current) => {
      const sections = [...current.sections];
      const index = sections.findIndex((section) => section.id === sectionId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= sections.length) return current;

      const [moved] = sections.splice(index, 1);
      sections.splice(target, 0, moved);
      return { version: 1, sections };
    });
  };

  const handleSave = async () => {
    setStatus('saving');
    setMessage('');
    try {
      await savePageLayout(pagePath, layout);
      setStatus('saved');
      setMessage('Đã lưu bố cục. Trang chủ sẽ dùng bố cục mới sau khi tải lại.');
      setIsDirty(false);
    } catch (error) {
      setStatus('error');
      setMessage(
        error instanceof Error ? error.message : 'Không lưu được bố cục. Vui lòng thử lại.'
      );
    }
  };

  const handleReset = () => {
    setLayout({
      version: 1,
      sections: HOMEPAGE_SECTION_CATALOG.map((entry) => ({
        id: entry.id,
        visible: true,
        style: {},
      })),
    });
    setIsDirty(true);
    setStatus('idle');
    setMessage('');
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-editor-canvas text-editor-ink">
      {/* Thanh công cụ */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-editor-divider bg-editor-panel px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold">🎨 Trình soạn thảo trực quan</span>
          <span className="rounded bg-editor-divider px-2 py-0.5 text-xs2 text-editor-ink-soft">
            {pagePath}
          </span>
          {isDirty && (
            <span className="rounded bg-editor-warning-bg px-2 py-0.5 text-xs2 text-editor-warning-ink">
              ● Chưa lưu
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleReset}
            className="rounded border border-editor-border bg-editor-canvas px-3 py-1.5 text-xs font-semibold text-editor-ink-dim hover:bg-vj-surface-dark"
          >
            Đặt lại
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={status === 'saving'}
            className="rounded bg-editor-success px-4 py-1.5 text-xs font-bold text-white hover:bg-editor-success-hover disabled:opacity-50"
          >
            {status === 'saving' ? 'Đang lưu...' : '💾 Lưu bố cục'}
          </button>
        </div>
      </div>

      {message && (
        <div
          className={`shrink-0 px-4 py-2 text-xs ${
            status === 'error'
              ? 'bg-editor-error-bg text-editor-error-ink'
              : 'bg-editor-success-bg text-editor-success-ink'
          }`}
        >
          {message}
        </div>
      )}

      {/* Canvas + Inspector */}
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 border-r border-editor-divider">
          <VisualEditorCanvas
            layout={layout}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onReorder={handleReorder}
            onStyleChange={handleStyleChange}
          />
        </div>

        <aside className="flex w-[320px] shrink-0 flex-col overflow-y-auto bg-editor-panel">
          <div className="border-b border-editor-divider px-4 py-3">
            <h2 className="text-xs font-bold uppercase tracking-wide text-editor-ink-soft">
              Cấu trúc trang
            </h2>
            <p className="mt-1 text-xs2 leading-relaxed text-editor-ink-muted">
              Kéo-thả trên canvas để đổi thứ tự, hoặc dùng nút ↑ ↓ bên dưới.
            </p>
          </div>

          <ul className="divide-y divide-editor-divider">
            {layout.sections.map((section, index) => {
              const entry = HOMEPAGE_SECTION_CATALOG.find((item) => item.id === section.id);
              const isSelected = section.id === selectedId;

              return (
                <li key={section.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(section.id)}
                    className={`flex w-full items-start gap-2 px-4 py-3 text-left transition-colors ${
                      isSelected ? 'bg-editor-selected' : 'hover:bg-vj-surface-dark'
                    }`}
                  >
                    <span className="mt-0.5 text-2xs font-bold text-editor-ink-muted">
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-xs font-bold text-editor-ink">
                          {entry?.label ?? section.id}
                        </span>
                        {section.visible === false && (
                          <span className="shrink-0 rounded bg-editor-error-bg px-1.5 py-0.5 text-2xs font-semibold text-editor-error-ink">
                            Ẩn
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block truncate text-xs2 text-editor-ink-muted">
                        {entry?.description ?? section.id}
                      </span>
                    </span>
                  </button>

                  {isSelected && (
                    <div className="space-y-3 bg-vj-surface-dark px-4 pb-4 pt-1">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => moveSection(section.id, -1)}
                          disabled={index === 0}
                          className="rounded border border-editor-border bg-editor-canvas px-2 py-1 text-xs2 font-bold text-editor-ink-dim disabled:opacity-40"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => moveSection(section.id, 1)}
                          disabled={index === layout.sections.length - 1}
                          className="rounded border border-editor-border bg-editor-canvas px-2 py-1 text-xs2 font-bold text-editor-ink-dim disabled:opacity-40"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleVisibility(section.id)}
                          className="ml-auto rounded border border-editor-border bg-editor-canvas px-2 py-1 text-xs2 font-bold text-editor-ink-dim"
                        >
                          {section.visible === false ? '👁 Hiện' : '🚫 Ẩn'}
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <NumberField
                          label="Padding trên"
                          value={section.style.paddingTop}
                          onChange={(value) =>
                            handleStyleChange(section.id, {
                              ...section.style,
                              paddingTop: value,
                            })
                          }
                        />
                        <NumberField
                          label="Padding dưới"
                          value={section.style.paddingBottom}
                          onChange={(value) =>
                            handleStyleChange(section.id, {
                              ...section.style,
                              paddingBottom: value,
                            })
                          }
                        />
                      </div>

                      <NumberField
                        label="Chiều rộng tối đa (px)"
                        value={section.style.maxWidth}
                        onChange={(value) =>
                          handleStyleChange(section.id, { ...section.style, maxWidth: value })
                        }
                      />

                      <label className="block">
                        <span className="mb-1 block text-xs2 font-semibold text-editor-ink-soft">
                          Màu nền
                        </span>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={toHexColor(section.style.backgroundColor)}
                            onChange={(event) =>
                              handleStyleChange(section.id, {
                                ...section.style,
                                backgroundColor: event.target.value,
                              })
                            }
                            className="h-8 w-10 cursor-pointer rounded border border-editor-border bg-editor-canvas"
                          />
                          <input
                            type="text"
                            value={section.style.backgroundColor ?? ''}
                            onChange={(event) => {
                              const raw = event.target.value.trim();
                              handleStyleChange(section.id, {
                                ...section.style,
                                backgroundColor: raw === '' ? undefined : raw,
                              });
                            }}
                            placeholder="vd: #F5F5F5"
                            className="min-w-0 flex-1 rounded border border-editor-border bg-editor-canvas px-2 py-1.5 text-xs text-editor-ink outline-none focus:border-vj-gold-from"
                          />
                        </div>
                      </label>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="mt-auto border-t border-editor-divider px-4 py-3 text-xs2 leading-relaxed text-editor-ink-muted">
            Bố cục chỉ điều khiển <strong className="text-editor-ink-soft">thứ tự và style</strong>{' '}
            của các section. Nội dung bên trong mỗi section vẫn là component React gốc nên không mất
            hành vi.
          </div>
        </aside>
      </div>
    </div>
  );
}

/** Ô nhập số, cho phép để trống = không đặt giá trị. */
function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs2 font-semibold text-editor-ink-soft">{label}</span>
      <input
        type="number"
        min={0}
        value={value ?? ''}
        onChange={(event) => {
          const raw = event.target.value;
          if (raw === '') {
            onChange(undefined);
            return;
          }
          const parsed = Number.parseInt(raw, 10);
          onChange(Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined);
        }}
        className="w-full rounded border border-editor-border bg-editor-canvas px-2 py-1.5 text-xs text-editor-ink outline-none focus:border-vj-gold-from"
      />
    </label>
  );
}

/** Chuyển màu bất kỳ (hex/rgb/hsl) về hex để hiển thị trong `<input type="color">`. */
function toHexColor(color: string | undefined): string {
  if (!color) return '#ffffff';

  const hex = color.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
  if (/^#[0-9a-fA-F]{3}$/.test(hex)) {
    return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  }

  const rgbMatch = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(hex);
  if (rgbMatch) {
    const toHex = (n: string) => Number.parseInt(n, 10).toString(16).padStart(2, '0');
    return `#${toHex(rgbMatch[1])}${toHex(rgbMatch[2])}${toHex(rgbMatch[3])}`;
  }

  return '#ffffff';
}
