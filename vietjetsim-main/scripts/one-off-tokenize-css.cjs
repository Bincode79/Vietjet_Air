#!/usr/bin/env node
/**
 * Một lần dọn: đổi class `rounded-[Npx]` / `p-[Npx]` … sang token có tên.
 *
 * Script này là công cụ MỘT LẦN, không chạy trong CI. Nó tồn tại để việc
 * dọn 148 class arbitrary thành token có tên (ratchet css-debt chặn class mới)
 * được làm bằng máy thay vì bằng tay — 148 lần sửa tay là 148 lần sai sót.
 *
 *   node scripts/one-off-tokenize-css.cjs --dry-run   # chỉ báo cáo
 *   node scripts/one-off-tokenize-css.cjs             # ghi file
 *
 * Ánh xạ được định nghĩa trong `tailwind.config.js` (`extend.borderRadius`,
 * `extend.spacing`). Script chỉ thay khi giá trị có token tương ứng — giá trị
 * không có token thì bỏ qua và báo lại, để không đoán mò.
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const DRY = process.argv.includes('--dry-run');

/**
 * Bo góc: px → tên token trong `extend.borderRadius`.
 *
 * Với giá trị trùng thang Tailwind sẵn có (2/4/6/8/12/16/24/32px) dùng luôn
 * tên của thang đó — `rounded-2xl` dễ đọc hơn `rounded-vj-16`, và đổi theme
 * `borderRadius` sau này sẽ áp dụng cho cả hai. Giá trị không có bậc chuẩn
 * thì dùng token có tên riêng.
 */
const RADIUS_TOKENS = {
  2: 'sm',
  3: '3xs',
  4: '', // DEFAULT của Tailwind — `rounded`
  5: '5xs',
  6: 'md',
  7: '7xs',
  8: 'lg',
  9: '9xs',
  10: 'vj',
  11: '11xs',
  12: 'xl',
  13: '13xs',
  14: '14xs',
  16: '2xl',
  20: 'vj-lg',
  22: 'vj-pill',
  24: 'vj-hero',
  28: 'vj-sheet',
  32: 'vj-modal',
  40: 'vj-oval',
};

/**
 * Khoảng cách: px → tên token trong `extend.spacing`.
 *
 * Thang Tailwind là 0.25rem (4px) mỗi bậc: `p-4`=16px, `p-6`=24px. Vì vậy
 * token = px/4, và các bậc lẻ (`p-2.5`=10px, `p-1.5`=6px, `p-0.75`=3px)
 * cũng có sẵn trong thang mặc định.
 *
 * Chỉ những giá trị ĐÃ có sẵn trong config — không tự sinh token mới, vì
 * token mới phải do người chọn, không phải máy. `extend.spacing` khai báo
 * lại 1/2/3/4/6/8/12/16/24 với đúng giá trị Tailwind mặc định, và thêm
 * `0.2` (2px) và `4.5` (18px).
 */
const SPACING_TOKENS = {
  2: '0.2',
  3: '0.75',
  5: '1.25',
  6: '1.5',
  8: '2',
  10: '2.5',
  11: '2.75',
  12: '3',
  13: '3.25',
  13.4: '3.35',
  15: '3.75',
  16: '4',
  17: '4.25',
  18: '4.5',
  19: '4.75',
  20: '5',
  24: '6',
  25: '6.25',
  26: '6.5',
  28: '7',
  29: '7.25',
  30: '7.5',
  32: '8',
  34: '8.5',
  36: '9',
  39: '9.75',
  40: '10',
  41: '10.25',
  42: '10.5',
  44: '11',
  46: '11.5',
  48: '12',
  51: '12.75',
  52: '13',
  56: '14',
  60: '15',
  64: '16',
  100: '25',
  105: '26.25',
  268: '67',
};

const SPACING_PROPS = 'p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|gap-x|gap-y|space-x|space-y';

/**
 * Đổ bóng: chuỗi gạch dưới (dạng `0_8px_32px_rgba(0,0,0,0.14)`) → tên token
 * trong `extend.boxShadow`.
 *
 * Tên đặt theo VAI TRÒ, không theo số: `vj-toast` rõ hơn `vj-shadow-7`, và
 * đọc trong markup thì biết ngay shadow đó dùng để làm gì. Giá trị giữ
 * nguyên — đổi tên không được đổi hình ảnh.
 *
 * Lưu ý `glow-emerald` (rgba(52,211,153)) và `glow-emerald-500` (#10b981) là
 * HAI màu khác nhau cùng họ — không gộp được.
 */
const SHADOW_TOKENS = {
  // Đổ bóng nổi lên (hướng lên trên) — thanh cố định dưới màn hình.
  '0_-4px_20px_rgba(0,0,0,0.08)': 'vj-up-sm',
  '0_-2px_12px_rgba(0,0,0,0.08)': 'vj-up-xs',
  '0_-4px_20px_rgba(0,0,0,0.12)': 'vj-up-md',
  // Đổ bóng xuống — panel, popover, thẻ nổi.
  '0_2px_10px_rgba(0,0,0,0.18)': 'vj-elev-xs',
  '0_4px_10px_rgba(245,130,32,0.45)': 'glow-orange',
  '0_4px_12px_rgba(255,221,0,0.35)': 'glow-yellow-sm',
  '0_4px_16px_rgba(0,0,0,0.06)': 'vj-soft',
  '0_4px_20px_rgba(0,0,0,0.08)': 'vj-elev-sm',
  '0_6px_14px_rgba(0,0,0,0.22)': 'vj-elev-strong',
  '0_6px_18px_rgba(0,0,0,0.16)': 'vj-elev-md',
  '0_8px_20px_rgba(255,221,0,0.45)': 'glow-yellow',
  '0_8px_24px_rgba(36,36,36,.10)': 'vj-elev-ink',
  '0_8px_32px_rgba(0,0,0,0.14)': 'vj-toast',
  '0_10px_18px_rgba(0,0,0,0.18)': 'vj-mascot',
  '0_12px_24px_rgba(0,0,0,0.1)': 'vj-elev-lg',
  '0_12px_28px_rgba(0,0,0,0.12)': 'vj-elev-xl',
  '0_12px_30px_rgba(26,41,72,0.12)': 'vj-navy',
  '0_12px_32px_rgba(0,0,0,0.28)': 'vj-overlay',
  '0_12px_32px_rgba(36,73,120,0.16)': 'vj-blue-lg',
  '0_14px_30px_rgba(36,36,36,.16)': 'vj-elev-lg-ink',
  '0_16px_40px_rgba(0,0,0,0.12)': 'vj-header',
  '0_16px_50px_rgba(0,0,0,0.22)': 'vj-modal',
  '0_18px_50px_rgba(36,73,120,0.14)': 'vj-blue-xl',
  '0_20px_40px_rgba(0,0,0,0.12)': 'vj-elev-2xl',
  '0_20px_50px_rgba(0,0,0,0.18)': 'vj-popover',
  '0_24px_48px_rgba(120,0,0,0.35)': 'vj-focus-red',
  // Quầng sáng — trạng thái (thành công/cảnh báo/lỗi) và nút thương hiệu.
  '0_0_8px_#10b981': 'glow-emerald-500',
  '0_0_8px_#f59e0b': 'glow-amber-500',
  '0_0_8px_#f43f5e': 'glow-rose-500',
  '0_0_8px_#6366f1': 'glow-indigo-500',
  '0_0_8px_rgba(16,185,129,0.6)': 'glow-emerald',
  '0_0_8px_rgba(52,211,153,0.5)': 'glow-emerald-400',
  '0_0_15px_rgba(16,185,129,0.1)': 'glow-emerald-soft',
  '0_0_15px_rgba(245,158,11,0.1)': 'glow-amber-soft',
  '0_0_15px_rgba(244,63,94,0.1)': 'glow-rose-soft',
  '0_0_20px_rgba(236,32,41,0.35)': 'glow-red',
};

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== 'test') walk(p, out);
    } else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

/**
 * Tự kiểm tra ánh xạ TRƯỚC khi ghi file.
 *
 * Bài học từ lần chạy đầu: `25px` bị map nhầm thành token `25` (=100px) và
 * `60px` map thành `15` vốn không tồn tại — cả hai đều im lặng, chỉ lộ ra
 * ở bước `check-tailwind-classes.cjs` sau đó, tức là SAU khi 40 file đã
 * bị sửa hỏng. Ở đây ta đối chiếu giá trị thật trong `tailwind.config.js`,
 * nên một map sai sẽ chết ngay trước khi chạm vào đĩa.
 */
function validateMapping() {
  const cfg = require(path.join(ROOT, 'tailwind.config.js'));
  const defaults = require('tailwindcss/defaultTheme');
  const spacing = { ...defaults.spacing, ...cfg.theme.extend.spacing };
  const radius = { ...defaults.borderRadius, ...cfg.theme.extend.borderRadius };
  const shadow = { ...defaults.boxShadow, ...cfg.theme.extend.boxShadow };
  const errors = [];

  for (const [px, token] of Object.entries(SPACING_TOKENS)) {
    const value = spacing[token];
    if (value === undefined) {
      errors.push(`spacing: token "${token}" (cho ${px}px) không tồn tại trong tailwind.config.js`);
      continue;
    }
    const actual = parseFloat(value) * 16;
    if (Math.abs(actual - Number(px)) > 0.01) {
      errors.push(`spacing: ${px}px -> "${token}" nhưng token đó = ${actual}px`);
    }
  }

  for (const [px, token] of Object.entries(RADIUS_TOKENS)) {
    if (token === '') continue; // `rounded` = DEFAULT của Tailwind
    const value = radius[token];
    if (value === undefined) {
      errors.push(`radius: token "${token}" (cho ${px}px) không tồn tại trong tailwind.config.js`);
      continue;
    }
    // Border radius: config có thể viết bằng px (`vj: '10px'`) hoặc rem
    // (Tailwind mặc định `sm: '0.125rem'`). Đọc đúng đơn vị thay vì giả
    // định rem — nếu không, `rounded-sm` (2px) sẽ bị đo thành 0.125px.
    const actual = String(value).endsWith('rem') ? parseFloat(value) * 16 : parseFloat(value);
    if (Math.abs(actual - Number(px)) > 0.01) {
      errors.push(`radius: ${px}px -> "${token}" nhưng token đó = ${actual}px`);
    }
  }

  for (const [raw, token] of Object.entries(SHADOW_TOKENS)) {
    const value = shadow[token];
    if (value === undefined) {
      errors.push(`shadow: token "${token}" (cho ${raw}) không tồn tại trong tailwind.config.js`);
      continue;
    }
    // So khớp bằng chuỗi sau khi chuẩn hoá khoảng trắng và số thập phân:
    // `rgba(36,36,36,.10)` và `rgba(36,36,36,0.1)` là CÙNG một màu — không
    // được báo sai lệch. Bỏ hết số 0 vô nghĩa ở cuối phần thập phân.
    const norm = (s) =>
      s
        .replace(/\s+/g, '')
        .replace(/,\./g, ',0.')
        .replace(/\.0+([,)])/g, '$1')
        .replace(/(\.\d*?)0+([,)])/g, '$1$2');
    if (norm(value) !== norm(raw.replace(/_/g, ' '))) {
      errors.push(`shadow: ${raw} -> "${token}" nhưng token đó = ${value}`);
    }
  }

  if (errors.length) {
    console.error('\n❌ Ánh xạ sai — KHÔNG ghi file:\n');
    for (const e of errors) console.error(`  ${e}`);
    console.error('\nSửa bảng ánh xạ trong script này cho khớp với tailwind.config.js.');
    process.exit(1);
  }
}

validateMapping();

const changed = [];
const skipped = new Map();

for (const file of walk(SRC)) {
  const src = fs.readFileSync(file, 'utf8');
  let next = src;

  // Bo góc: `rounded-[24px]` → `rounded-vj-hero`, `rounded-t-[24px]` →
  // `rounded-t-vj-hero` (biến thể theo cạnh vẫn giữ nguyên hướng).
  next = next.replace(/\brounded(-[trbl])?-\[([0-9.]+)px\]/g, (full, side, raw) => {
    const token = RADIUS_TOKENS[Number(raw)];
    if (token === undefined) {
      const key = `rounded${side || ''}-[${raw}px]`;
      skipped.set(key, (skipped.get(key) || 0) + 1);
      return full;
    }
    // `rounded` (không hậu tố) = 4px — giá trị DEFAULT của Tailwind.
    if (token === '') return `rounded${side || ''}`;
    return `rounded${side || ''}-${token}`;
  });

  // Khoảng cách: `p-[24px]` → `p-6`
  const spacingRe = new RegExp(`\\b(${SPACING_PROPS})-\\[([0-9.]+)px\\]`, 'g');
  next = next.replace(spacingRe, (full, prop, raw) => {
    const token = SPACING_TOKENS[Number(raw)];
    if (!token) {
      skipped.set(`${prop}-[${raw}px]`, (skipped.get(`${prop}-[${raw}px]`) || 0) + 1);
      return full;
    }
    return `${prop}-${token}`;
  });

  // Đổ bóng: `shadow-[0_8px_32px_rgba(0,0,0,0.14)]` → `shadow-vj-toast`
  //
  // `(?<!drop-)` là bắt buộc: `\bshadow-` khớp LUÔN phần `shadow-` trong
  // `drop-shadow-[…]`, và đổi nó thành `drop-shadow-vj-…` sẽ tạo ra class
  // không sinh CSS (dropShadow là một scale riêng, không dùng chung token
  // với boxShadow).
  next = next.replace(/(?<!drop-)\bshadow-\[([^\]]+)\]/g, (full, raw) => {
    const token = SHADOW_TOKENS[raw];
    if (!token) {
      skipped.set(`shadow-[${raw}]`, (skipped.get(`shadow-[${raw}]`) || 0) + 1);
      return full;
    }
    return `shadow-${token}`;
  });

  if (next !== src) {
    changed.push({ file: path.relative(ROOT, file), after: next });
  }
}

for (const { file, after } of changed) {
  if (DRY) {
    console.info(`would change: ${file}`);
    continue;
  }
  fs.writeFileSync(path.join(ROOT, file), after);
  console.info(`changed: ${file}`);
}

console.info(`\n${DRY ? 'Would change' : 'Changed'}: ${changed.length} file(s).`);
if (skipped.size) {
  console.info(`\nGiá trị KHÔNG có token (giữ nguyên):`);
  for (const [k, n] of [...skipped].sort((a, b) => b[1] - a[1])) {
    console.info(`  ${k} × ${n}`);
  }
}
