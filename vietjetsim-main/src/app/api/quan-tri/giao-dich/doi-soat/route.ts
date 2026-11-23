import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/admin-auth';
import {
  confirmVietQrPayment,
  writeAuditLog,
  awardBookingLoyaltyPoints,
  getBookingByCodeOrId,
} from '@/lib/db';
import { sendAutomaticPaymentInvoiceEmail } from '@/lib/payment-invoice';

export interface BankStatementRowInput {
  refId?: string;
  date?: string;
  amount: number;
  description: string;
}

export interface ReconciliationResultItem {
  id: string;
  refId: string;
  date: string;
  amount: number;
  description: string;
  extractedPnr: string | null;
  bookingId?: string;
  bookingStatus?: string;
  expectedAmount?: number;
  difference?: number;
  passengerName?: string;
  flightNo?: string;
  status: 'matched' | 'mismatch' | 'already_settled' | 'unmatched' | 'invalid_booking';
  settled?: boolean;
}

const COMMON_EXCLUDE_WORDS = new Set([
  'NGAY',
  'THANG',
  'CHUYEN',
  'KHOAN',
  'TIEN',
  'THANH',
  'TOAN',
  'VIETIN',
  'VIETCOM',
  'TECHCOM',
  'MBBANK',
  'AGRI',
  'CONG',
  'TY',
  'KHACH',
  'HANG',
  'ONLINE',
  'BANKING',
  'INTERNET',
  'MOBILE',
  'NAPAS',
  'VIETQR',
  'TRANSFER',
  'PAYMENT',
  'VND',
  'USD',
]);

/**
 * Trích xuất mã PNR (6-8 ký tự) từ nội dung chuyển khoản ngân hàng.
 * Ưu tiên các mã bắt đầu bằng VJ (như VJ644052, VJ123456) hoặc mã PNR 6 ký tự chuẩn.
 */
export function extractPnrFromDescription(desc: string): string | null {
  if (!desc) return null;
  const clean = desc.toUpperCase().replace(/[.,;:\-_/\\#()]/g, ' ');

  // 1. Tìm mẫu bắt đầu bằng VJ + 4-8 ký tự số/chữ (VD: VJ644052, VJSMOKE, VJ1234, VJSETTLE99)
  const vjMatch = clean.match(/\b(VJ[A-Z0-9]{4,8})\b/);
  if (vjMatch) return vjMatch[1];

  // 2. Tìm mẫu 6 ký tự gồm chữ và số
  const tokens = clean.split(/\s+/).filter(Boolean);
  for (const token of tokens) {
    if (token.length === 6 && /^[A-Z0-9]{6}$/.test(token)) {
      if (!COMMON_EXCLUDE_WORDS.has(token) && !/^\d{6}$/.test(token) && !/^[A-Z]{6}$/.test(token)) {
        return token;
      }
    }
  }

  // 3. Fallback: mã 6 ký tự bất kỳ không nằm trong từ loại trừ
  for (const token of tokens) {
    if (token.length === 6 && /^[A-Z0-9]{6}$/.test(token) && !COMMON_EXCLUDE_WORDS.has(token)) {
      return token;
    }
  }

  return null;
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyAdminRequest(request, 'payment:process');
    if (authResult.error || authResult.response) return authResult.response!;

    const body = await request.json();
    const action = body.action === 'settle' ? 'settle' : 'preview';
    const rawItems: BankStatementRowInput[] = Array.isArray(body.items) ? body.items : [];
    const settleBookingCodes: Set<string> = new Set(
      Array.isArray(body.settleBookingCodes)
        ? body.settleBookingCodes.map((c: string) => String(c).trim().toUpperCase())
        : []
    );

    if (rawItems.length === 0) {
      return NextResponse.json(
        {
          error: 'Bad Request',
          message: 'Vui lòng cung cấp ít nhất một dòng giao dịch sao kê để đối soát.',
        },
        { status: 400 }
      );
    }

    const results: ReconciliationResultItem[] = [];
    let matchedCount = 0;
    let mismatchCount = 0;
    let alreadySettledCount = 0;
    let unmatchedCount = 0;
    let invalidCount = 0;
    let matchedAmount = 0;
    let settledCount = 0;
    const settledCodes: string[] = [];

    for (let i = 0; i < rawItems.length; i++) {
      const item = rawItems[i];
      const refId = item.refId?.trim() || `TXN-${i + 1}`;
      const date = item.date?.trim() || new Date().toISOString().slice(0, 10);
      const amount = Math.max(0, Number(item.amount) || 0);
      const description = item.description?.trim() || '';

      const pnr = extractPnrFromDescription(description);

      if (!pnr) {
        unmatchedCount++;
        results.push({
          id: `rec-${i}`,
          refId,
          date,
          amount,
          description,
          extractedPnr: null,
          status: 'unmatched',
        });
        continue;
      }

      // Tra cứu booking trong cơ sở dữ liệu
      const booking = await getBookingByCodeOrId(pnr);

      if (!booking) {
        unmatchedCount++;
        results.push({
          id: `rec-${i}`,
          refId,
          date,
          amount,
          description,
          extractedPnr: pnr,
          status: 'unmatched',
        });
        continue;
      }

      const expectedAmount = Math.max(
        0,
        Number(booking.total_price || 0) - Number(booking.discount_amount || 0)
      );
      const difference = amount - expectedAmount;
      const passengerName = booking.passengers?.[0]?.name || 'Hành khách';
      const flightNo = booking.flight?.flight_no || '—';

      // Phân loại trạng thái
      if (booking.status === 'cancelled' || booking.status === 'refunded') {
        invalidCount++;
        results.push({
          id: `rec-${i}`,
          refId,
          date,
          amount,
          description,
          extractedPnr: pnr,
          bookingId: booking.id,
          bookingStatus: booking.status,
          expectedAmount,
          difference,
          passengerName,
          flightNo,
          status: 'invalid_booking',
        });
        continue;
      }

      if (booking.status === 'confirmed' || booking.status === 'completed') {
        alreadySettledCount++;
        results.push({
          id: `rec-${i}`,
          refId,
          date,
          amount,
          description,
          extractedPnr: pnr,
          bookingId: booking.id,
          bookingStatus: booking.status,
          expectedAmount,
          difference,
          passengerName,
          flightNo,
          status: 'already_settled',
        });
        continue;
      }

      // Đơn vé đang chờ duyệt (pending)
      const isExactMatch = Math.round(amount) === Math.round(expectedAmount);

      if (isExactMatch) {
        matchedCount++;
        matchedAmount += amount;

        let isSettled = false;
        // Nếu là lệnh Settle và đơn vé được chọn duyệt hoặc duyệt toàn bộ matched
        if (
          action === 'settle' &&
          (settleBookingCodes.size === 0 || settleBookingCodes.has(pnr.toUpperCase()))
        ) {
          const settleRes = await confirmVietQrPayment({
            bookingCode: pnr,
            amount,
            transferNote: `${refId} - ${description}`,
          });

          if (settleRes.ok) {
            isSettled = true;
            settledCount++;
            settledCodes.push(pnr);

            // Gửi email vé điện tử tự động và thưởng điểm SkyJoy
            try {
              await sendAutomaticPaymentInvoiceEmail(booking.id, {
                paymentMethod: 'vietqr',
                customAmount: amount,
              });
            } catch {
              // Bỏ qua lỗi gửi mail để không gián đoạn đối soát
            }

            try {
              await awardBookingLoyaltyPoints(booking.id, amount);
            } catch {
              // Bỏ qua lỗi cộng điểm
            }
          }
        }

        results.push({
          id: `rec-${i}`,
          refId,
          date,
          amount,
          description,
          extractedPnr: pnr,
          bookingId: booking.id,
          bookingStatus: isSettled ? 'confirmed' : booking.status,
          expectedAmount,
          difference: 0,
          passengerName,
          flightNo,
          status: 'matched',
          settled: isSettled,
        });
      } else {
        mismatchCount++;
        results.push({
          id: `rec-${i}`,
          refId,
          date,
          amount,
          description,
          extractedPnr: pnr,
          bookingId: booking.id,
          bookingStatus: booking.status,
          expectedAmount,
          difference,
          passengerName,
          flightNo,
          status: 'mismatch',
        });
      }
    }

    const summary = {
      totalRecords: rawItems.length,
      matchedCount,
      mismatchCount,
      alreadySettledCount,
      unmatchedCount,
      invalidCount,
      totalAmount: rawItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0),
      matchedAmount,
      settledCount,
    };

    if (action === 'settle' && settledCount > 0) {
      await writeAuditLog({
        adminId: authResult.payload.userId,
        adminEmail: authResult.payload.email,
        action: 'payment:batch_reconcile',
        targetType: 'reconciliation',
        detailsJson: JSON.stringify({
          settledCount,
          totalRecords: rawItems.length,
          settledCodes,
          totalSettledAmount: matchedAmount,
        }),
        status: 'success',
      });
    }

    return NextResponse.json({
      success: true,
      action,
      summary,
      results,
      message:
        action === 'settle'
          ? `Đã đối soát và xác nhận thanh toán thành công cho ${settledCount} đơn vé!`
          : `Đối soát hoàn tất: ${matchedCount} đơn khớp hoàn hảo, ${mismatchCount} đơn lệch tiền, ${alreadySettledCount} đơn đã thanh toán.`,
    });
  } catch (error) {
    console.error('Error during bank reconciliation:', error);
    return NextResponse.json(
      {
        error: 'Internal Server Error',
        message: 'Không thể thực hiện đối soát giao dịch ngân hàng.',
      },
      { status: 500 }
    );
  }
}
