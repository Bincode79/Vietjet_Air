import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { imageHosts } from './image-hosts.config.mjs';

const projectRoot = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  compress: true,
  productionBrowserSourceMaps: false,
  distDir: process.env.DIST_DIR || '.next',

  // `pdfkit` phải nằm ngoài bundle server.
  //
  // (1) AFM: `new PDFDocument()` nạp sẵn font chuẩn `Helvetica` bằng
  //     `fs.readFileSync(__dirname + '/data/Helvetica.afm')`. Khi Next bundle
  //     `pdfkit` vào server chunk, `__dirname` trỏ tới `.next/server/chunks`
  //     — nơi không có thư mục `data/` ⇒ ENOENT ⇒ endpoint vé điện tử trả 500.
  // (2) fontkit: `fontkit` (do `pdfkit` kéo về) import `applyDecoratedDescriptor`
  //     từ `@swc/helpers`. Bản `@swc/helpers` lồng trong `fontkit` là 0.3.17
  //     (tên export cũ, không tiều tố `_`), còn bản top-level là 0.5.23 (tên
  //     mới `_apply_decorated_descriptor`). Turbopack resolve về bản top-level
  //     ⇒ "Export applyDecoratedDescriptor doesn't exist" ⇒ `next dev --turbo`
  //     crash ở mọi route import `pdfkit`.
  //
  // Để `pdfkit` nằm ngoài bundle, cả hai `require`/`import` của Node resolve
  // theo cây `node_modules` thật ⇒ `__dirname` trỏ đúng `node_modules/pdfkit/js`
  // (có `data/*.afm`) và `@swc/helpers` resolve đúng bản lồng của `fontkit`.
  // Next vẫn trace package này vào thư mục `standalone` như một dependency
  // thông thường.
  serverExternalPackages: ['pdfkit'],

  // Pin Turbopack's workspace root to this app directory. Stray lockfiles one
  // level up (the git-root package-lock.json) and in $HOME made Next infer the
  // wrong root and print "ignored/multiple lockfiles" warnings on every build.
  turbopack: {
    root: projectRoot,
  },

  // The floating dev overlay (the "N • n Issues" badge that sits on top of the
  // page) is turned off: it lands in every QA screenshot but is never part of
  // the product UI. Compile/runtime errors still print in the terminal and the
  // error overlay still appears when a route actually fails.
  devIndicators: false,

  // Next.js blocks its dev resources (HMR client, chunk reloading) for
  // cross-origin hosts. Opening the app via `http://127.0.0.1:4028` used to hit
  // that block, and the symptom was silent and very misleading: the page
  // rendered from SSR but never hydrated, so every client-side effect was
  // dead — the flight-results list stayed on its skeleton forever and showed
  // "0 chuyến bay phù hợp" even though `/api/chuyen-bay` returned rows.
  // Both loopback spellings are whitelisted so the two URLs behave the same.
  allowedDevOrigins: ['127.0.0.1', 'localhost'],

  // Type errors now FAIL the build (CI gate); previously they were ignored.
  // Lint is enforced by `npm run lint` in CI, not by the build — Next 15/16
  // removed the `eslint` config key and warns if it is still present.
  typescript: {
    ignoreBuildErrors: false,
  },

  poweredByHeader: false,

  images: {
    remotePatterns: imageHosts,
    qualities: [40, 55, 70, 80, 85, 90, 95, 100],
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains; preload',
          },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=()' },
        ],
      },
      {
        source: '/images/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' },
        ],
      },
      {
        source: '/api/sse/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-transform' },
          { key: 'Connection', value: 'keep-alive' },
          { key: 'X-Accel-Buffering', value: 'no' },
        ],
      },
    ];
  },

  async redirects() {
    return [
      {
        source: '/',
        destination: '/vi',
        permanent: false,
      },
    ];
  },
};
export default nextConfig;
