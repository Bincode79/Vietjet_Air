import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/neon';
import { lookupBankBin } from '@/lib/vietqr';

/** Hàng tài khoản ngân hàng mà trang công khai đọc. */
type BankAccountRow = {
  id: string;
  admin_bank_name: string | null;
  admin_bank_account_number: string | null;
  admin_bank_account_holder: string | null;
  bank_bin: string | null;
  branch: string | null;
  logo_url: string | null;
  is_default: boolean;
  transfer_note_template: string | null;
};

export async function GET(_request: NextRequest) {
  try {
    const rawAccounts = await sql<BankAccountRow>`
      SELECT id, bank_name as admin_bank_name, account_number as admin_bank_account_number,
             account_holder as admin_bank_account_holder, bank_bin, branch, logo_url, is_default,
             transfer_note_template
      FROM bank_accounts
      WHERE is_active = true
      ORDER BY is_default DESC, created_at DESC
    `;

    const accounts = (rawAccounts || []).map((acc) => ({
      ...acc,
      bank_bin: lookupBankBin(acc.admin_bank_name, acc.bank_bin),
    }));

    return NextResponse.json({
      bankConfig: accounts[0] || {}, // For backward compatibility
      accounts: accounts,
    });
  } catch (error) {
    console.error('Error fetching bank config:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
