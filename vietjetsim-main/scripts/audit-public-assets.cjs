/* Quét `public/` để dựng danh sách asset chưa được đăng ký trong
 * `docs/design/asset-registry.md`: mỗi file, có tham chiếu thật trong
 * `src/`/`scripts/` không, dung lượng, và có phải hotlink tới domain ngoài.
 *
 * Dùng: node scripts/audit-public-assets.cjs [--json]
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const REGISTRY = path.resolve(ROOT, '..', 'docs', 'design', 'asset-registry.md');

/** Thư mục quét tìm tham chiếu (bỏ `node_modules`, `.next*`, `.git`). */
const SCAN_DIRS = ['src', 'scripts', 'e2e'];

/** Domain ngoài — tham chiếu tới chúng là hotlink, không được phép. */
const EXTERNAL_HOSTS = ['vietjetair.com', 'vj-prod-website-cms', 'amazonaws.com', 's3.'];

/**
 * Đuôi file asset — chỉ những URL kết thúc bằng một trong số này mới được
 * coi là hotlink.
 *
 * Vì sao cần lọc theo đuôi: corpus chứa rất nhiều văn bản nói về
 * `vietjetair.com` (ghi chú QA, link điều khoản, tài liệu đối chiếu giao
 * diện). Bắt mọi URL trỏ tới domain đó sẽ báo động giả hàng loạt. Chỉ tài
 * nguyên ảnh/font/tải về mới là thứ KHÔNG NÊN mượn từ site khác.
 */
const ASSET_EXTENSIONS = [
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'avif',
  'svg',
  'ico',
  'woff',
  'woff2',
];

/**
 * Tìm URL trỏ tới host ngoài mà kết thúc bằng đuôi asset.
 *
 * Trả về mảng `{ host, url, file, line }` — mỗi phát hiện một dòng.
 */
function findHotlinks(corpus) {
  const hits = [];
  // URL trong trích dẫn, `url(...)` của CSS, và chuỗi thuần đều được bắt:
  // http(s)://host/...png
  const urlRe = /https?:\/\/[^\s'"()<>]+/g;
  const extRe = new RegExp(`\\.(${ASSET_EXTENSIONS.join('|')})(?:[?#][^\\s'"()<>]*)?$`, 'i');

  for (const [file, text] of corpus) {
    const lines = text.split('\n');
    lines.forEach((line, i) => {
      for (const match of line.matchAll(urlRe)) {
        const url = match[0];
        if (!extRe.test(url)) continue;
        const host = EXTERNAL_HOSTS.find((h) => url.includes(h));
        if (!host) continue;
        hits.push({ host, url, file, line: i + 1 });
      }
    });
  }
  return hits;
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

/** Gom toàn bộ nội dung file văn bản trong `SCAN_DIRS` thành một chuỗi để
 *  tìm tham chiếu bằng `includes` — nhanh hơn nhiều so với đọc từng file.
 *
 *  Trả về mảng `[đường dẫn tương đối, nội dung]` thay vì một chuỗi lớn:
 *  `findHotlinks` cần biết URL nằm ở file nào, dòng nào để báo cáo được
 *  người đọc. Chuỗi ghép lại vẫn được dựng khi cần (`corpusText`). */
function buildCorpus() {
  const files = [];
  for (const dir of SCAN_DIRS) {
    for (const file of walk(path.join(ROOT, dir))) {
      if (!/\.(ts|tsx|js|cjs|mjs|json|css|md)$/.test(file)) continue;
      files.push([path.relative(ROOT, file), fs.readFileSync(file, 'utf8')]);
    }
  }
  return files;
}

function main() {
  const corpusFiles = buildCorpus();
  const corpus = corpusFiles.map(([, text]) => text).join('\n');
  const registry = fs.existsSync(REGISTRY) ? fs.readFileSync(REGISTRY, 'utf8') : '';

  const publicFiles = walk(PUBLIC_DIR).map((p) => path.relative(PUBLIC_DIR, p));

  const rows = publicFiles.map((rel) => {
    const base = path.basename(rel);
    const size = fs.statSync(path.join(PUBLIC_DIR, rel)).size;
    const referenced = corpus.includes(base) || corpus.includes(rel);
    const registered = registry.includes(base);
    return { rel, base, size, referenced, registered };
  });

  const unregistered = rows.filter((r) => !r.registered);
  const orphans = rows.filter((r) => !r.referenced);
  const hotlinks = findHotlinks(corpusFiles);

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ total: rows.length, unregistered, orphans, hotlinks }, null, 2));
    return;
  }

  const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
  console.log(`Tổng file trong public/: ${rows.length}`);
  console.log(`Chưa đăng ký trong registry: ${unregistered.length}`);
  console.log(`Không có tham chiếu thật (orphan): ${orphans.length}`);
  console.log(`Hotlink tới host ngoài: ${hotlinks.length}\n`);

  console.log('| File | Đường dẫn | Tham chiếu | Kích thước |');
  console.log('| --- | --- | --- | --- |');
  for (const r of unregistered) {
    console.log(
      `| \`${r.base}\` | \`public/${r.rel}\` | ${r.referenced ? '✅ có' : '⚠️ orphan'} | ${kb(r.size)} |`
    );
  }

  if (hotlinks.length) {
    console.log('\n## Hotlink (không được mượn tài nguyên từ host khác)\n');
    for (const h of hotlinks) {
      console.log(`- \`${h.url}\` — ${h.file}:${h.line}`);
    }
  }
}

main();
