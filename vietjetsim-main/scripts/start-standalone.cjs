#!/usr/bin/env node
/**
 * start-standalone.cjs — chạy production server theo cách Next.js khuyến nghị
 * cho `output: 'standalone'`.
 *
 * VÌ SAO CẦN FILE NÀY (chứ không sửa `start` thành `node .next/standalone/server.js` thẳng)
 * ------------------------------------------------------------------------------------
 * `next start` KHÔNG chết khi cấu hình `output: 'standalone'` — Next chỉ in cảnh báo:
 *
 *     "next start" does not work with "output: standalone" configuration.
 *     Use "node .next/standalone/server.js" instead.
 *
 * (xem `node_modules/next/dist/server/next.js`: nhánh `conf.output === 'standalone'`
 * chỉ gọi `log.warn`, không throw — nên `next start` vẫn chạy và phục vụ đủ).
 *
 * Nhưng `node .next/standalone/server.js` thì KHÔNG tự làm ba việc mà `next start`
 * làm, nên chạy nó "trần" sẽ hỏng:
 *
 *  1. **Nạp biến môi trường.** `server.js` gọi `process.chdir(__dirname)` ⇒ thư mục
 *     làm việc là `.next/standalone`, và `NextServer.loadEnvConfig()` sẽ tìm
 *     `.env.local` ở *đó* — không phải ở gốc app. Hậu quả: `src/instrumentation.ts`
 *     ném "JWT_SECRET and/or JWT_REFRESH_SECRET ... are not set" và mọi request
 *     trả 500. File này nạp `.env.*` từ gốc app trước khi spawn server.
 *
 *  2. **Copy `.next/static`.** Standalone KHÔNG chứa static assets — Next cố ý bỏ
 *     chúng ra khỏi gói `standalone` để giữ image nhỏ. Dockerfile và Render đều
 *     phải copy thủ công (`COPY --from=builder /app/.next/static ./.next/static`).
 *     Không copy ⇒ mọi `/_next/static/*` trả 404 ⇒ trang trắng (không style, không JS).
 *
 *  3. **Copy `public/`.** Cùng lý do: `public/` không nằm trong gói standalone
 *     (chỉ `public/fonts` được trace vào vì server-side đọc nó).
 *
 * `HOSTNAME` cũng được đặt mặc định `0.0.0.0` cho khớp Dockerfile — xem
 * `render.yaml`: "`HOSTNAME` is deliberately NOT set here ... the Dockerfile pins
 * HOSTNAME=0.0.0.0 so the server binds all interfaces". Nếu `HOSTNAME` kế thừa từ
 * máy host (VD `srv1520932.hstgr.cloud` trên VPS), server chỉ bind một interface
 * và `localhost:4028` có thể không kết nối được.
 *
 * CÁCH DÙNG
 * ---------
 *   node scripts/start-standalone.cjs [--port <port>]
 *
 * Thứ tự ưu tiên cổng: `--port` > biến môi trường `PORT` > 3000.
 * (`--port` thắng `PORT` để giữ đúng hành vi của `next start -p 4028` trước đây;
 *  Docker/Render không dùng script này nên không bị ảnh hưởng.)
 *
 * Biến môi trường:
 *   DIST_DIR  thư mục build (mặc định `.next`) — khớp `next.config.mjs`.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const APP_ROOT = path.resolve(__dirname, '..');
const BUILD_DIR = path.join(APP_ROOT, process.env.DIST_DIR || '.next');
const STANDALONE_DIR = path.join(BUILD_DIR, 'standalone');
const SERVER_FILE = path.join(STANDALONE_DIR, 'server.js');
const STATIC_SRC = path.join(BUILD_DIR, 'static');
const STATIC_DEST = path.join(STANDALONE_DIR, '.next', 'static');
const PUBLIC_SRC = path.join(APP_ROOT, 'public');
const PUBLIC_DEST = path.join(STANDALONE_DIR, 'public');

/** Thứ tự ưu tiên file env giống hệt `@next/env` ở chế độ production. */
const ENV_FILES = ['.env.production.local', '.env.local', '.env.production', '.env'];

function fail(message) {
  console.error(`\n❌ ${message}\n`);
  process.exit(1);
}

function parsePort() {
  const flagIndex = process.argv.indexOf('--port');
  if (flagIndex !== -1 && process.argv[flagIndex + 1]) {
    const parsed = Number.parseInt(process.argv[flagIndex + 1], 10);
    if (!Number.isNaN(parsed)) return parsed;
  }
  const fromEnv = Number.parseInt(process.env.PORT || '', 10);
  if (!Number.isNaN(fromEnv)) return fromEnv;
  return 3000;
}

/**
 * Nạp `.env.*` vào `process.env` mà KHÔNG ghi đè biến đã có sẵn.
 *
 * `dotenv.config()` mặc định không ghi đè (`populate` chỉ set khi key chưa tồn
 * tại), nên biến truyền từ shell — VD `DATABASE_URL=...` trong
 * `scripts/run-smoke-real-db.sh` — vẫn thắng. Thứ tự file ở trên bảo đảm file
 * ưu tiên cao được nạp trước và "thắng" (first-wins), giống Next.
 */
function loadEnvFiles() {
  let dotenv;
  try {
    dotenv = require('dotenv');
  } catch {
    console.warn('⚠️  Không tìm thấy `dotenv` — bỏ qua việc nạp .env, server sẽ dùng process.env.');
    return;
  }

  for (const file of ENV_FILES) {
    const fullPath = path.join(APP_ROOT, file);
    if (!fs.existsSync(fullPath)) continue;
    dotenv.config({ path: fullPath, quiet: true });
  }
}

/** Copy `src` → `dest`, xoá dest trước để không giữ lại file của build cũ. */
function syncDir(src, dest, label) {
  if (!fs.existsSync(src)) {
    console.warn(`⚠️  Không thấy ${label} (${path.relative(APP_ROOT, src)}) — bỏ qua.`);
    return;
  }
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
  console.log(`  ✓ ${label}`);
}

function main() {
  if (!fs.existsSync(SERVER_FILE)) {
    fail(
      `Không tìm thấy bản build standalone tại:\n   ${path.relative(APP_ROOT, SERVER_FILE)}\n\n` +
        `Chạy \`npm run build\` trước, rồi thử lại.`
    );
  }

  console.log('▸ Đang chuẩn bị production server (standalone)…');
  loadEnvFiles();

  // (2) và (3): static assets + public/.
  syncDir(STATIC_SRC, STATIC_DEST, 'static assets (.next/static)');
  syncDir(PUBLIC_SRC, PUBLIC_DEST, 'public/');

  const port = parsePort();
  const env = {
    ...process.env,
    NODE_ENV: 'production',
    PORT: String(port),
    // `server.js` đọc `process.env.HOSTNAME || '0.0.0.0'`. Docker đặt tường minh
    // `HOSTNAME=0.0.0.0`; ở đây đặt mặc định tương tự để server bind mọi
    // interface (nếu kế thừa hostname của máy host thì `localhost` có thể
    // không kết nối được).
    HOSTNAME: process.env.HOSTNAME || '0.0.0.0',
  };

  console.log(`▸ Đang khởi động server trên cổng ${port}…\n`);

  const child = spawn(process.execPath, [SERVER_FILE], {
    cwd: STANDALONE_DIR,
    env,
    stdio: 'inherit',
  });

  // Chuyển tiếp tín hiệu dừng xuống child để `pm2 restart` / Ctrl-C dừng sạch,
  // không để lại process mồ côi giữ port.
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      if (!child.killed) child.kill(signal);
    });
  }

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
}

main();
