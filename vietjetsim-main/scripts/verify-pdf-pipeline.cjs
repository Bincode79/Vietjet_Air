#!/usr/bin/env node
/**
 * Cổng kiểm chứng pipeline sinh file (PDF) — chạy SAU KHI build.
 *
 * Run: node scripts/verify-pdf-pipeline.cjs
 *
 * Vì sao cần một script riêng thay vì unit test:
 *
 * Unit test chạy trên *source*, nên nó không bao giờ thấy lỗi "package bị
 * bundle sai chỗ". Lỗi đã xảy ra ở đây là:
 *
 *   `pdfkit` nạp sẵn font chuẩn `Helvetica` bằng
 *   `fs.readFileSync(__dirname + '/data/Helvetica.afm')`.
 *
 * Khi Next bundle `pdfkit` vào `.next/server/chunks/`, `__dirname` trỏ tới
 * thư mục chunk — nơi không có `data/` ⇒ ENOENT ⇒ endpoint vé điện tử trả 500
 * và toàn bộ email hoá đơn kèm PDF không gửi được. Test nào chạy trên source
 * cũng vẫn xanh, vì ở đó `require('pdfkit')` lấy đúng thư mục thật.
 *
 * Script này kiểm chứng đúng *artifact* mà production chạy:
 *   1. `pdfkit` KHÔNG nằm trong `.next/server/chunks/` (không có chuỗi
 *      `Helvetica.afm` trong chunk nào).
 *   2. `pdfkit` ĐƯỢC trace vào `.next/standalone/node_modules/pdfkit/` kèm đủ
 *      file `.afm`.
 *   3. Font KoHo được copy vào `.next/standalone/public/fonts/`.
 *   4. `require('pdfkit')` từ đúng thư mục standalone thực sự sinh ra file
 *      PDF hợp lệ (`%PDF-`) — tức là đường đi runtime đúng, không chỉ đúng
 *      trên lý thuyết.
 *   5. `next.config.mjs` vẫn khai báo `serverExternalPackages: ['pdfkit']`.
 *
 * Mọi bước đều là assertion không phụ thuộc mạng hay database ⇒ chạy được
 * trong CI. Thoát khác 0 nếu có bước nào fail, để CI đỏ rõ ràng.
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = process.cwd();
const NEXT_DIR = process.env.DIST_DIR || '.next';
const SERVER_DIR = path.join(ROOT, NEXT_DIR, 'server');
const CHUNKS_DIR = path.join(SERVER_DIR, 'chunks');
const STANDALONE_DIR = path.join(ROOT, NEXT_DIR, 'standalone');
const STANDALONE_PDFKIT = path.join(STANDALONE_DIR, 'node_modules', 'pdfkit');

let failures = 0;

function check(label, condition, detail) {
  if (condition) {
    console.info(`  ok    ${label}`);
    return true;
  }
  failures += 1;
  console.error(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  return false;
}

/**
 * Mọi chunk server: file `.js` trong `.next/server/chunks/`.
 *
 * Chỉ server chunk mới quan trọng — `pdfkit` chỉ chạy server-side, nên một
 * bản sao trong client bundle vô hại (và không tồn tại, vì route này
 * `runtime = 'nodejs'`).
 */
function serverChunks() {
  if (!fs.existsSync(CHUNKS_DIR)) return [];
  return fs
    .readdirSync(CHUNKS_DIR)
    .filter((name) => name.endsWith('.js'))
    .map((name) => path.join(CHUNKS_DIR, name));
}

async function main() {
  console.info(`Kiểm chứng pipeline sinh file (PDF) — ${NEXT_DIR}\n`);

  if (!fs.existsSync(SERVER_DIR)) {
    console.error(`  FAIL  không tìm thấy ${NEXT_DIR}/server — hãy chạy "npm run build" trước.`);
    process.exit(1);
  }

  // ── 1. `pdfkit` không được nằm trong bundle server ─────────────────────
  console.info('Bundle server');
  const offenders = serverChunks().filter((file) => {
    const text = fs.readFileSync(file, 'utf8');
    // `pdfkit` ghi đường dẫn font tương đối tới `__dirname`; khi bị bundle,
    // chuỗi `Helvetica.afm` nằm ngay trong chunk.
    return text.includes('Helvetica.afm') || text.includes('data/Helvetica');
  });

  check(
    'pdfkit KHÔNG được bundle vào .next/server/chunks/',
    offenders.length === 0,
    offenders.length
      ? `tìm thấy trong: ${offenders.map((f) => path.basename(f)).join(', ')}`
      : undefined
  );

  // ── 2. Config phải khai báo external ─────────────────────────────────
  console.info('\nCấu hình build');
  const configSource = fs.readFileSync(path.join(ROOT, 'next.config.mjs'), 'utf8');
  check(
    "next.config.mjs khai báo serverExternalPackages: ['pdfkit']",
    /serverExternalPackages\s*:\s*\[[^\]]*['"]pdfkit['"]/.test(configSource)
  );

  // ── 3. `pdfkit` phải được trace vào standalone ─────────────────────────
  console.info('\nArtifact standalone');
  check(
    'node_modules/pdfkit có trong .next/standalone/',
    fs.existsSync(STANDALONE_PDFKIT),
    STANDALONE_PDFKIT
  );

  const afmFiles = ['Helvetica.afm', 'Helvetica-Bold.afm', 'Times-Roman.afm', 'Courier.afm'];
  for (const afm of afmFiles) {
    const p = path.join(STANDALONE_PDFKIT, 'js', 'data', afm);
    check(`font chuẩn ${afm} được trace vào standalone`, fs.existsSync(p), p);
  }

  // ── 4. Font KoHo phải có trong standalone ─────────────────────────────
  console.info('\nFont nhúng');
  for (const font of ['KoHo-Regular.ttf', 'KoHo-Medium.ttf', 'KoHo-Bold.ttf']) {
    const p = path.join(STANDALONE_DIR, 'public', 'fonts', font);
    check(`font ${font} có trong standalone/public/fonts/`, fs.existsSync(p), p);
  }

  // ── 5. Runtime thật: sinh PDF từ đúng thư mục standalone ────────────
  console.info('\nSinh PDF từ artifact standalone');
  const pdfKit = require(path.join(STANDALONE_PDFKIT, 'js', 'pdfkit.js'));
  const PDFDocument = pdfKit.default || pdfKit;

  const pdf = await new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 36 });
      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      doc.text('Vietjet Air — Kiểm chứng pipeline PDF');
      doc.end();
    } catch (error) {
      reject(error);
    }
  });

  check('pdfkit sinh được file PDF', pdf.length > 500, `${pdf.length} bytes`);
  check(
    'file bắt đầu bằng magic bytes %PDF-',
    pdf.subarray(0, 5).toString() === '%PDF-',
    pdf.subarray(0, 5).toString()
  );
  check('file kết thúc bằng EOF', pdf.subarray(-6).toString().includes('EOF'));

  console.info('');
  if (failures > 0) {
    console.error(`Kiểm chứng pipeline PDF thất bại: ${failures} assertion(s).`);
    process.exit(1);
  }
  console.info('Kiểm chứng pipeline PDF đạt.');
}

main().catch((error) => {
  console.error('Kiểm chứng pipeline PDF lỗi:', error);
  process.exit(1);
});
