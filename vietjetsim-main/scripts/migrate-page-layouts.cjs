#!/usr/bin/env node
/**
 * Áp migration 048: bảng `page_layouts` cho trình soạn thảo trực quan.
 *
 * Migration là idempotent (`CREATE TABLE IF NOT EXISTS`), nên chạy lại nhiều
 * lần vẫn an toàn.
 */
const fs = require('fs');
const path = require('path');
const { neon } = require('@neondatabase/serverless');
const { resolveDatabaseUrl } = require('./db-target.cjs');

async function main() {
  console.log('🚀 Running migration 048: page_layouts...\n');

  const databaseUrl = resolveDatabaseUrl(process.argv);
  const sql = neon(databaseUrl);

  const migrationPath = path.join(__dirname, '..', 'migrations', '048_page_layouts.sql');
  const sqlContent = fs.readFileSync(migrationPath, 'utf8');

  console.log('Applying SQL:');
  console.log(sqlContent);

  // `sql.query()` chạy cả khối như một prepared statement nên Postgres báo
  // lỗi cú pháp khi có nhiều câu lệnh. Tách theo dấu `;` rồi chạy từng câu.
  const statements = sqlContent
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);

  for (const statement of statements) {
    console.log('→', statement.split('\n')[0].slice(0, 80));
    await sql.query(statement);
  }

  console.log('✅ Migration 048 applied.');
}

main().catch((error) => {
  console.error('❌ Migration 048 failed:', error);
  process.exit(1);
});