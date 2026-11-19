#!/usr/bin/env node
const { neon } = require('@neondatabase/serverless');
const { resolveDatabaseUrl } = require('./db-target.cjs');

const DATABASE_URL = resolveDatabaseUrl(['--allow-remote', '--yes']);
const sql = neon(DATABASE_URL);

async function main() {
  console.log('Applying 055_movi_credit_hold.sql to Neon Database...');

  // Neon HTTP driver executes multiple statements when sent as raw query
  // Let's execute the statements
  try {
    // 1. Add hold_expires_at
    console.log('1. Adding hold_expires_at...');
    await sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS hold_expires_at TIMESTAMPTZ;`;

    // 2. Add hold_method
    console.log('2. Adding hold_method...');
    await sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS hold_method VARCHAR(20);`;

    // 3. Index
    console.log('3. Creating index idx_bookings_hold_expires...');
    await sql`CREATE INDEX IF NOT EXISTS idx_bookings_hold_expires ON bookings (hold_expires_at) WHERE hold_expires_at IS NOT NULL;`;

    // 4. Constraint check
    console.log('4. Adding bookings_hold_method_check...');
    await sql`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'bookings_hold_method_check'
            AND conrelid = 'bookings'::regclass
        ) THEN
          ALTER TABLE bookings
            ADD CONSTRAINT bookings_hold_method_check
            CHECK (hold_method IS NULL OR hold_method IN ('movi'));
        END IF;
      END $$;
    `;

    // 5. Table movi_credit_applications
    console.log('5. Creating table movi_credit_applications...');
    await sql`
      CREATE TABLE IF NOT EXISTS movi_credit_applications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
        user_id TEXT REFERENCES user_profiles(id),
        full_name VARCHAR(255) NOT NULL,
        birth_date DATE,
        national_id VARCHAR(20) NOT NULL,
        phone VARCHAR(20) NOT NULL,
        tenor_months INTEGER NOT NULL DEFAULT 3,
        amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
        status VARCHAR(20) NOT NULL DEFAULT 'submitted',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `;

    // 6. Constraint check on movi_credit_applications
    console.log('6. Adding status check constraint...');
    await sql`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'movi_credit_applications_status_check'
            AND conrelid = 'movi_credit_applications'::regclass
        ) THEN
          ALTER TABLE movi_credit_applications
            ADD CONSTRAINT movi_credit_applications_status_check
            CHECK (status IN ('submitted', 'approved', 'rejected'));
        END IF;
      END $$;
    `;

    // 7. Unique index
    console.log('7. Creating unique index on booking_id...');
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_movi_credit_applications_booking_unique
        ON movi_credit_applications (booking_id);
    `;

    console.log('✓ Migration 055 successfully applied to database!');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

main().catch(console.error);
