#!/usr/bin/env node
/**
 * Sửa hàng loạt: `chromePath()` bỏ qua qua biến môi trường `CHROME_PATH`.
 *
 * Vấn đề: 38 script trong `scripts/` khai báo
 *
 *     const CHROME = process.env.CHROME_PATH || '<default>';
 *
 * rồi lại viết `chromePath()` với danh sách đường dẫn hardcode — và hàm đó
 * KHÔNG đọc `CHROME_PATH`. Hệ quả: đặt `CHROME_PATH=/path/to/chrome` không
 * có tác dụng với những script đó, và ESLint báo `CHROME is assigned a value
 * but never used` cho tất cả.
 *
 * Sửa: cho `chromePath()` ưu tiên `CHROME_PATH` (nếu có và file tồn tại), rồi
 * mới fallback sang danh sách ứng viên; đồng thời bỏ hẳn hằng số `CHROME`
 * đã thành dead code.
 *
 * Script này là MỘT LẦN, không chạy trong CI. Có `--dry-run` để xem trước.
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SCRIPTS = path.join(ROOT, 'scripts');
const DRY = process.argv.includes('--dry-run');

/** Hằng số `CHROME` cũ — khớp cả hai cách xuống dòng. */
const CHROME_CONST = /const CHROME =\n?\s*process\.env\.CHROME_PATH \|\| '[^']*';\n/;

/**
 * `chromePath()` hiện tại: danh sách ứng viên hardcode, không đọc env.
 *
 * Bản thay thế ưu tiên `CHROME_PATH` — nếu người chạy đặt biến này thì phải
 * được tôn trọng, kể cả khi đường dẫn không phải mặc định của macOS (CI trên
 * Linux, Chromium portable…).
 */
const CHROME_FN = /function chromePath\(\) \{\n(?:.*\n)*?\}\n/;

function replacement() {
  return `function chromePath() {
  // CHROME_PATH do nguoi chay dat — uu tien hon mac dinh, de chay duoc tren
  // may khong cai Google Chrome mac dinh (CI, Chromium portable).
  const fromEnv = process.env.CHROME_PATH;
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ];
  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) throw new Error('Không tìm thấy Chrome/Chromium');
  return found;
}
`;
}

const changed = [];

for (const entry of fs.readdirSync(SCRIPTS)) {
  if (!entry.endsWith('.cjs')) continue;
  const file = path.join(SCRIPTS, entry);
  const src = fs.readFileSync(file, 'utf8');

  if (!CHROME_CONST.test(src)) continue;
  const fnMatch = src.match(CHROME_FN);
  if (!fnMatch) {
    console.warn(`BỎ QUA (không tìm thấy chromePath): ${entry}`);
    continue;
  }
  // Nếu chromePath() đã đọc CHROME_PATH thì không cần sửa gì.
  if (/CHROME_PATH/.test(fnMatch[0])) {
    console.warn(`BỎ QUA (đã đọc CHROME_PATH): ${entry}`);
    continue;
  }

  let next = src.replace(CHROME_CONST, '');
  next = next.replace(CHROME_FN, replacement());
  // Dòng trống thừa do hằng số bị xoá.
  next = next.replace(/\n\n\n+/g, '\n\n');

  changed.push({ file, next });
}

for (const { file, next } of changed) {
  const rel = path.relative(ROOT, file);
  if (DRY) {
    console.info(`would change: ${rel}`);
    continue;
  }
  fs.writeFileSync(file, next);
  console.info(`changed: ${rel}`);
}

console.info(`\n${DRY ? 'Would change' : 'Changed'}: ${changed.length} file(s).`);
