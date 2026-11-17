module.exports = {
  apps: [
    {
      name: 'vietjet',
      cwd: '/var/www/vietjet/vietjetsim-main',
      // `next start` KHÔNG dùng được với `output: 'standalone'` — Next in cảnh báo
      // "next start does not work with output: standalone" (và bản build trên
      // VPS là standalone vì `next.config.mjs` đặt `output: 'standalone'`).
      //
      // `scripts/start-standalone.cjs` chạy đúng bản standalone mà Docker/Render
      // dùng, đồng thời lo phần chuẩn bị mà `next start` tự làm: nạp `.env.local`
      // từ gốc app và copy `.next/static` + `public/` vào gói standalone (bản
      // standalone cố ý không chứa chúng ⇒ không copy thì mọi asset trả 404).
      // Xem file đó để biết chi tiết.
      script: 'scripts/start-standalone.cjs',
      args: '--port 4028',
      instances: 1,
      autorestart: true,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: '4028',
        // Standalone server đọc `process.env.HOSTNAME || '0.0.0.0'`. Đặt tường
        // minh `0.0.0.0` để server bind mọi interface — nginx trên VPS kết nối
        // qua `127.0.0.1:4028`, nên chỉ bind một interface có thể hỏng.
        HOSTNAME: '0.0.0.0',
      },
    },
  ],
};
