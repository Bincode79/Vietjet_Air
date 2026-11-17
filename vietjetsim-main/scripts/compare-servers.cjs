#!/usr/bin/env node
/**
 * compare-servers.cjs — so sánh status/size của hai server đang chạy.
 *
 * Dùng để chứng minh `npm start` (standalone) phục vụ giống hệt `next start`
 * cũ, trên cùng một bản build. So sánh cả status code lẫn kích thước body:
 * status giống mà body khác kích thước thì server trả nội dung khác nhau,
 * tức là hồi quy mà chỉ nhìn status sẽ bỏ sót.
 */
'use strict';

const PATHS = [
  '/trang-chu',
  '/vi',
  '/tim-ve',
  '/dich-vu',
  '/gioi-thieu',
  '/hoi-dap',
  '/lien-he',
  '/tra-cuu',
  '/lam-thu-tuc',
  '/dang-nhap',
  '/quen-mat-khau',
  '/dat-lai-mat-khau',
  '/chuyen-bay-cua-toi',
  '/quan-tri',
  '/tai-khoan',
  '/api/csrf',
  '/api/xac-thuc/toi',
  '/api/san-bay',
  '/api/cong-khai/thong-bao',
  '/api/chuyen-bay?from=SGN&to=HAN',
  '/favicon.ico',
  '/images/hero/amy-mascot.png',
  '/khong-ton-tai-xyz',
];

async function probe(base, path) {
  try {
    const res = await fetch(base + path, { redirect: 'manual' });
    const body = await res.text();
    return { status: res.status, size: body.length, location: res.headers.get('location') || '' };
  } catch (err) {
    return { status: 'ERR', size: 0, location: String(err.message).slice(0, 60) };
  }
}

(async () => {
  const [a, b] = process.argv.slice(2);
  if (!a || !b) {
    console.error('Dùng: node compare-servers.cjs <baseA> <baseB>');
    process.exit(1);
  }

  let diffs = 0;
  for (const p of PATHS) {
    const [ra, rb] = [await probe(a, p), await probe(b, p)];
    const same = ra.status === rb.status && ra.size === rb.size;
    if (!same) diffs++;
    const mark = same ? '  ok ' : 'DIFF ';
    console.log(
      `${mark} ${p.padEnd(46)} A=${ra.status}/${ra.size}  B=${rb.status}/${rb.size}` +
        (same ? '' : `  locA=${ra.location} locB=${rb.location}`)
    );
  }
  console.log(`\n${diffs === 0 ? '✅ Không khác biệt' : `❌ ${diffs} đường dẫn khác biệt`}`);
  process.exit(diffs === 0 ? 0 : 1);
})();
