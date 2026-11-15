import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Three admin tabs cast their API rows with `as unknown as X[]`.
 *
 * The cast is a hole in the type system: it silences the compiler between
 * two independent declarations of the same row. When the server renamed an
 * alias, the tab's copy kept the old name, the cast hid the disagreement,
 * and the field reached the screen as `undefined` — an empty cell in a
 * column the operator was reading.
 *
 *   `TransactionsTab` — the endpoint projects `paymentId`, `bookingStatus`,
 *   `receiptImage` and `transferNote`; the shared `AdminTransaction` type
 *   declared none of them, so the tab's own interface had to, and the
 *   arrays had to be cast to match.
 *
 *   `AuditLogsTab` — `AdminAuditLog` declared the raw `audit_logs` columns
 *   (`actor_email`, `target_type`, `target_id`), but the endpoint returns the
 *   aliases `resource`, `resource_id`, `user_email`, `user_name`,
 *   `user_role`. Every declared name was a name the query never returns.
 *
 *   `ChatTab` — re-declared the conversation and message rows instead of
 *   using the service's `ChatConversation` / `ChatMessage`.
 *
 * These pin that the tab and the shared type agree, by construction: the
 * tab now derives its row type from the shared one, so there is no second
 * declaration left to drift.
 */
const TRANSACTIONS_TAB = 'src/features/admin/components/TransactionsTab.tsx';
const AUDIT_TAB = 'src/features/admin/components/AuditLogsTab.tsx';
const CHAT_TAB = 'src/features/admin/components/ChatTab.tsx';
const TYPES = 'src/features/admin/types/index.ts';

function read(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

/**
 * The source without its comments.
 *
 * The comments in these files explain the defects that were fixed — and they
 * quote the old code, so a naive grep finds the very patterns the test is
 * asserting are gone.
 */
function readCode(path: string) {
  return read(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

describe('các bảng quản trị không ép kiểu để giấu lệch kiểu dữ liệu', () => {
  it('bảng giao dịch không ép mảng về kiểu riêng của nó', () => {
    const tab = readCode(TRANSACTIONS_TAB);
    expect(tab).not.toMatch(/as unknown as Transaction\[\]/);
    // The row type is derived from the shared one, not re-declared.
    expect(tab).toMatch(/type Transaction = Omit<\s*AdminTransaction/);
  });

  it('bảng nhật ký không ép mảng về kiểu riêng của nó', () => {
    const tab = readCode(AUDIT_TAB);
    expect(tab).not.toMatch(/as unknown as AuditLog\[\]/);
    expect(tab).toMatch(/type AuditLog = AdminAuditLog/);
  });

  it('bảng chat không ép mảng về kiểu riêng của nó', () => {
    const tab = readCode(CHAT_TAB);
    expect(tab).not.toMatch(/as unknown as Conversation\[\]/);
    expect(tab).not.toMatch(/as unknown as Message\[\]/);
    expect(tab).toMatch(/type Message = ChatMessage/);
  });

  it('AdminTransaction khai báo đủ các bí danh mà endpoint trả về', () => {
    const types = readCode(TYPES);
    const decl = /export interface AdminTransaction \{([\s\S]*?)\n\}/.exec(types);
    expect(decl).not.toBeNull();
    const body = decl![1];

    // These are the query's aliases in `/api/quan-tri/giao-dich`.
    for (const field of [
      'paymentId',
      'bookingStatus',
      'receiptImage',
      'transferNote',
      'bookingCode',
      'userEmail',
      'userName',
    ]) {
      expect(body).toContain(field);
    }
  });

  it('AdminAuditLog dùng đúng bí danh của endpoint nhật ký', () => {
    const types = readCode(TYPES);
    const decl = /export interface AdminAuditLog \{([\s\S]*?)\n\}/.exec(types);
    expect(decl).not.toBeNull();
    const body = decl![1];

    // The endpoint renames the raw columns; the tab reads the aliases.
    for (const field of [
      'resource',
      'resource_id',
      'details',
      'ip_address',
      'user_agent',
      'user_email',
      'user_name',
      'user_role',
    ]) {
      expect(body).toContain(field);
    }

    // The names the endpoint never returns must be gone.
    expect(body).not.toMatch(/actor_email/);
    expect(body).not.toMatch(/actor_name/);
    expect(body).not.toMatch(/target_type/);
    expect(body).not.toMatch(/target_id/);
  });
});
