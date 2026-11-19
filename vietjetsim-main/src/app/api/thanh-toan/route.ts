import { NextRequest, NextResponse } from 'next/server';
import {
  createPaymentAndConfirmBooking,
  updateBookingStatus,
  getBookingByCodeOrId,
  getActiveBankAccounts,
  getUserLoyaltyWithProgram,
  spendLoyaltyPoints,
  refundLoyaltyPoints,
  awardBookingLoyaltyPoints,
  findUserById,
  getDiscountCodeById,
  getDiscountCodeByCode,
  countUserDiscountUsage,
  claimDiscountUsage,
  releaseDiscountUsage,
  getTripById,
} from '@/lib/db';
import { verifyAuthRequest } from '@/lib/auth';
import { canAccessBooking } from '@/lib/booking-access';
import { renderTransferNote } from '@/lib/transfer-note';
import { validateBankTransferInput } from '@/lib/bank-transfer';
import { computeDiscountAmount } from '@/lib/discount';
import {
  buildMoviTransferNote,
  parseLegacyMoviNote,
  validateMoviApplication,
  type MoviApplication,
} from '@/lib/movi';
import {
  sendPaymentInstructionEmail,
  sendPaymentFailedEmail,
  sendPaymentPendingReviewEmail,
} from '@/lib/mail';
import { sendAutomaticPaymentInvoiceEmail } from '@/lib/payment-invoice';
import { skypointPointsForAmount, skypointValueOfPoints } from '@/lib/skypoint';
import { rateLimit } from '@/lib/rate-limit';

/** Methods the payment page may submit. Anything else is rejected up front. */
const ALLOWED_METHODS = new Set([
  'card',
  'bank',
  'vietqr',
  'wallet',
  'e_wallet',
  'skypoint',
  'cash_plus_points',
  'movi',
]);

export async function POST(request: NextRequest) {
  try {
    const limited = rateLimit(request, { windowMs: 60_000, maxRequests: 30 });
    if (limited) return limited;

    const { user, error, response } = await verifyAuthRequest(request);
    if (error === 'CSRF validation failed') return response!;

    const body = await request.json();
    const {
      method,
      amount,
      discount_code_id,
      discount_code,
      bank_account_id,
      transfer_note,
      transfer_amount,
      receipt_image,
      points_to_redeem,
      pointsToRedeem,
    } = body;

    // The booking may be addressed by its internal UUID or by its six-character
    // PNR, so the value is normalised to a string before it is compared or
    // compared case-insensitively.
    const booking_id = typeof body.booking_id === 'string' ? body.booking_id.trim() : '';

    // `return_booking_id` is NO LONGER read from the request body.
    //
    // It used to be, and it was the one booking id on this route that skipped
    // `canAccessBooking`: the outbound leg was checked, the inbound leg was
    // not, so a caller who owned one leg could name any other booking and have
    // its status rewritten to `confirmed`. The inbound leg is now DERIVED from
    // the outbound leg's `trip_id` + `leg_role = 'inbound'` (migration 045),
    // which is the only relationship that can be trusted — and which the client
    // cannot forge.
    //
    // The field is still accepted in the body for backwards compatibility with
    // an older client, and is then checked against the derived leg: a mismatch
    // is refused rather than silently ignored, so a stale client gets a clear
    // error instead of a booking that quietly stops being confirmed.
    const requestedReturnBookingId =
      typeof body.return_booking_id === 'string' ? body.return_booking_id.trim() : null;

    // Validation
    if (!booking_id || !method || amount === undefined) {
      return NextResponse.json(
        {
          error: 'Missing required fields',
          message: 'booking_id, method, and amount are required',
        },
        { status: 400 }
      );
    }

    if (amount < 0) {
      return NextResponse.json(
        { error: 'Invalid amount', message: 'Amount cannot be negative' },
        { status: 400 }
      );
    }

    if (receipt_image) {
      if (typeof receipt_image !== 'string' || receipt_image.length > 6_000_000) {
        return NextResponse.json(
          {
            error: 'Invalid receipt image',
            message: 'Ảnh biên lai không hợp lệ hoặc vượt quá kích thước cho phép (tối đa 4MB)',
          },
          { status: 400 }
        );
      }
      if (!receipt_image.startsWith('data:image/') && !receipt_image.startsWith('/images/')) {
        return NextResponse.json(
          { error: 'Invalid receipt image format', message: 'Định dạng ảnh biên lai không hợp lệ' },
          { status: 400 }
        );
      }
    }

    if (!ALLOWED_METHODS.has(method)) {
      return NextResponse.json(
        { error: 'Invalid method', message: 'Phương thức thanh toán không hợp lệ' },
        { status: 400 }
      );
    }

    // Verify booking exists.
    //
    // The id may be the internal UUID or the six-character PNR. The PNR is
    // what the customer holds — it is printed on the ticket, quoted in
    // support chats and carried by the payment links in every email — so it
    // has to work as a payment target for a guest who is not signed in.
    const booking = await getBookingByCodeOrId(booking_id);
    if (!booking) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Không tìm thấy thông tin đặt chỗ' },
        { status: 404 }
      );
    }

    // Quyền sở hữu đặt chỗ.
    //
    // Trước đây kiểm tra này chỉ chạy khi `user` khác null, nên một caller
    // *không đăng nhập* chỉ cần biết id (UUID) là có thể thanh toán thay và
    // nhận vé điện tử của người khác. Quy tắc nay nằm ở `canAccessBooking`
    // để mọi route đọc/thanh toán dùng chung một luật: cookie guest, PNR cho
    // khách chưa đăng nhập, hoặc đúng `user_id`/admin.
    if (!canAccessBooking(request, booking, user, booking_id)) {
      return NextResponse.json(
        {
          error: 'Forbidden',
          message:
            'Bạn không có quyền thanh toán đặt chỗ này. Vui lòng đăng nhập hoặc dùng mã đặt chỗ để tra cứu.',
        },
        { status: 403 }
      );
    }

    // Prevent double-charge: a booking can only be paid once.
    if (booking.status === 'confirmed' || booking.status === 'completed') {
      return NextResponse.json(
        {
          error: 'Already paid',
          message: 'Đặt chỗ này đã được thanh toán rồi.',
        },
        { status: 409 }
      );
    }

    // ─── MOVI: hồ sơ tín dụng & lượt giữ chỗ 30 phút ─────────────────────────
    //
    // Khối kiểm tra hồ sơ MOVI nằm SAU khối kiểm tra số tiền (xem bên dưới):
    // một request sai số tiền phải được trả lời là "sai số tiền", không phải
    // "thiếu hồ sơ" — client nào cũng phải nhận đúng lý do từ chối đầu tiên.

    // ─── Chặng về: tự suy ra từ trip của chặng đi ────────────────────────────
    //
    // Một chuyến khứ hồi là HAI dòng `bookings` cùng `trip_id` (migration 045).
    // Chặng về được tìm bằng quan hệ đó, không bằng id do client gửi lên —
    // xem lý do ở chỗ `requestedReturnBookingId` được khai báo.
    //
    // `canAccessBooking` đã bảo vệ chặng đi; chặng về là của CÙNG trip và
    // CÙNG chủ, nên nó thừa hưởng cùng một quyền. Không có chặng về nào của
    // người khác nằm trong `trip_id` đó — `trip_id` là UUID sinh ở server khi
    // tạo booking, không phải thứ client kiểm soát được.
    let returnBookingId: string | null = null;
    if (booking.trip_id) {
      const trip = await getTripById(String(booking.trip_id));
      const inboundLeg = trip?.legs.find((leg) => leg.legRole === 'inbound');
      if (inboundLeg) {
        // Một client cũ gửi `return_booking_id` khác chặng về thật: đó là
        // dấu hiệu client đang cố gắn thanh toán vào một chặng khác. Từ chối
        // rõ ràng thay vì bỏ qua, để không có chuyện "thanh toán chặng đi xong
        // nhưng chặng về thì không" mà không ai biết vì sao.
        if (requestedReturnBookingId && requestedReturnBookingId !== inboundLeg.bookingId) {
          return NextResponse.json(
            {
              error: 'Forbidden',
              message: 'Chặng về không khớp với chuyến bay đã chọn.',
            },
            { status: 403 }
          );
        }
        returnBookingId = inboundLeg.bookingId;
      }
    }

    let validatedDiscountId: string | undefined;
    let validatedDiscountAmount = 0;

    if (discount_code_id || discount_code) {
      const discount =
        (discount_code_id ? await getDiscountCodeById(String(discount_code_id)) : null) ??
        (discount_code ? await getDiscountCodeByCode(String(discount_code)) : null);

      if (!discount) {
        return NextResponse.json(
          { error: 'Invalid discount', message: 'Mã giảm giá không tồn tại' },
          { status: 400 }
        );
      }

      const now = new Date();
      if (
        !discount.is_active ||
        now < new Date(discount.start_date) ||
        now > new Date(discount.end_date)
      ) {
        return NextResponse.json(
          { error: 'Invalid discount', message: 'Mã giảm giá không còn hiệu lực' },
          { status: 400 }
        );
      }

      if (discount.usage_limit !== null && discount.used_count >= discount.usage_limit) {
        return NextResponse.json(
          { error: 'Invalid discount', message: 'Mã giảm giá đã hết lượt sử dụng' },
          { status: 400 }
        );
      }

      if (discount.usage_per_user_limit !== null) {
        const usedByUser = await countUserDiscountUsage(booking.user_id, discount.id);
        if (usedByUser >= discount.usage_per_user_limit) {
          return NextResponse.json(
            { error: 'Invalid discount', message: 'Bạn đã sử dụng mã giảm giá này rồi' },
            { status: 400 }
          );
        }
      }

      if (booking.total_price < Number(discount.min_booking_amount)) {
        return NextResponse.json(
          {
            error: 'Invalid discount',
            message: `Mã giảm giá chỉ áp dụng cho đơn hàng từ ${Number(
              discount.min_booking_amount
            ).toLocaleString('vi-VN')}₫`,
          },
          { status: 400 }
        );
      }

      validatedDiscountAmount = computeDiscountAmount(discount, booking.total_price);
      validatedDiscountId = discount.id;
    }

    // ─── Claim lượt dùng mã giảm giá (atomic) ────────────────────────────────
    //
    // Trên, `usage_limit` được ĐỌC rồi so sánh; lúc tăng bộ đếm lại diễn ra ở
    // một câu lệnh khác, sau khi thanh toán. Giữa hai câu lệnh đó, một request
    // khác có thể đọc đúng cùng giá trị và cũng vượt qua — nên hai khách
    // dùng chung lượt cuối cùng của một mã.
    //
    // `claimDiscountUsage` gộp cả hai thành MỘT câu lệnh: `WHERE` là điều
    // kiện, `SET` là hành động, và Postgres xử lý chúng dưới cùng một row
    // lock. Mã hết lượt thì không khớp dòng nào ⇒ `false`.
    //
    // Lượt được trả lại nếu thanh toán thất bại — xem `.catch()` của
    // `createPaymentAndConfirmBooking` bên dưới.
    let discountUsageClaimed = false;
    if (validatedDiscountId) {
      discountUsageClaimed = await claimDiscountUsage(validatedDiscountId);
      if (!discountUsageClaimed) {
        return NextResponse.json(
          { error: 'Invalid discount', message: 'Mã giảm giá đã hết lượt sử dụng' },
          { status: 400 }
        );
      }
    }

    // Charge exactly what the booking is worth. `amount` from the browser is for
    // display only — trusting it let a client pay one đồng (or ten times the
    // fare) and have the booking marked confirmed. A discount legitimately
    // lowers the charge, so the expected amount is the discounted total.
    const discountedTotal = Math.max(0, booking.total_price - validatedDiscountAmount);

    // The fare value and the cash actually collected are two different numbers
    // once SkyPoint is involved: the points pay part of the fare, so the
    // customer hands over less cash than the fare is worth. `discountedTotal` is
    // the fare, `cashDue` is what has to arrive.
    let cashDue = discountedTotal;
    let loyaltyPointsSpent = 0;

    const requestedPointsToRedeem = Number(points_to_redeem || pointsToRedeem || 0);
    const paysWithPoints = requestedPointsToRedeem > 0 || method === 'skypoint';

    // Paying with SkyPoint or Wallet requires an authenticated user account.
    if ((method === 'wallet' || paysWithPoints) && !user) {
      return NextResponse.json(
        {
          error: 'Unauthorized',
          message: 'Vui lòng đăng nhập để thanh toán bằng điểm thưởng hoặc ví Vietjet.',
        },
        { status: 401 }
      );
    }

    if (paysWithPoints) {
      const loyaltyData = await getUserLoyaltyWithProgram(user!.userId);
      if (!loyaltyData) {
        return NextResponse.json(
          { error: 'Loyalty unavailable', message: 'Chương trình SkyJoy chưa khả dụng' },
          { status: 503 }
        );
      }

      const rate = loyaltyData.program.points_per_1000_vnd;

      // How many points this payment spends. A mixed payment uses the number the
      // customer chose; a pure SkyPoint payment spends exactly the points that
      // cover the fare, so the cash due is nothing.
      const pointsToSpend =
        requestedPointsToRedeem > 0
          ? requestedPointsToRedeem
          : skypointPointsForAmount(discountedTotal, rate);

      if (loyaltyData.loyalty.available_points < pointsToSpend) {
        return NextResponse.json(
          {
            error: 'Insufficient SkyPoint',
            message:
              requestedPointsToRedeem > 0
                ? `Số dư điểm không đủ (khả dụng: ${loyaltyData.loyalty.available_points.toLocaleString('vi-VN')} điểm)`
                : `Bạn cần ${pointsToSpend.toLocaleString('vi-VN')} SkyPoint cho giao dịch này`,
          },
          { status: 400 }
        );
      }

      const pointsValue = skypointValueOfPoints(pointsToSpend, rate);
      cashDue = Math.max(0, discountedTotal - pointsValue);

      // The amount is checked *before* the points are spent, so a customer who
      // mistypes the figure does not lose points to a request that was going to
      // be rejected anyway. The spend happens after the check passes.
      if (Number(amount) !== cashDue) {
        return NextResponse.json(
          {
            error: 'Invalid payment amount',
            message: `Số tiền phải đúng ${cashDue.toLocaleString('vi-VN')} VND`,
          },
          { status: 400 }
        );
      }

      try {
        await spendLoyaltyPoints(
          user!.userId,
          pointsToSpend,
          requestedPointsToRedeem > 0
            ? `Thanh toán Cash + Points cho đặt chỗ ${booking.booking_code ?? booking_id}`
            : `Thanh toán SkyPoint cho đặt chỗ ${booking.booking_code ?? booking_id}`,
          // Ghi liên kết đơn lên giao dịch điểm: nếu đơn bị hoàn tiền, số điểm
          // đã dùng phải được trả lại (xem `refundLoyaltyPointsForBooking`).
          //
          // `booking.id` chứ không phải `booking_id` từ request: người dùng có
          // thể gửi PNR, và cột `loyalty_transactions.booking_id` phải trỏ tới
          // UUID thật của đặt chỗ.
          booking.id
        );
        loyaltyPointsSpent = pointsToSpend;
      } catch (loyaltyError) {
        const message = loyaltyError instanceof Error ? loyaltyError.message : '';
        return NextResponse.json(
          { error: 'Loyalty spend failed', message: message || 'Không thể trừ điểm SkyJoy' },
          { status: 400 }
        );
      }
    } else if (Number(amount) !== discountedTotal) {
      return NextResponse.json(
        {
          error: 'Invalid payment amount',
          message: `Số tiền phải đúng ${discountedTotal.toLocaleString('vi-VN')} VND`,
        },
        { status: 400 }
      );
    }

    // A bank transfer (or a VietQR scan, which settles the same account) is
    // confirmed by re-typing the memo and the amount the page showed. Both are
    // checked against values derived here, never against the ones the browser
    // sent — an attacker controls those, so trusting them would make the
    // confirmation decorative. Deriving the memo from the same template the
    // page used keeps the two from drifting apart.
    if (method === 'bank' || method === 'vietqr') {
      const bankAccounts = await getActiveBankAccounts();
      const account =
        bankAccounts.find((a) => String(a.id) === String(bank_account_id)) ?? bankAccounts[0];

      if (!account) {
        return NextResponse.json(
          { error: 'Bank transfer unavailable', message: 'Chưa cấu hình tài khoản nhận tiền.' },
          { status: 503 }
        );
      }

      const expectedNote = renderTransferNote(account.transfer_note_template, {
        code: booking.booking_code ?? '',
        originalAmount: booking.total_price,
        discountAmount: validatedDiscountAmount,
        amount: cashDue,
        discountCode: discount_code || '',
      });

      // Nếu khách đã tải ảnh biên lai giao dịch ngân hàng để Admin đối chiếu,
      // hoặc đã bấm "Tôi đã thanh toán" kèm ảnh biên lai, cho phép tiếp tục ghi nhận giao dịch.
      if (!receipt_image) {
        const check = validateBankTransferInput(
          { transferNote: transfer_note, amount: transfer_amount },
          { transferNote: expectedNote, amount: cashDue }
        );

        if (!check.valid) {
          // Gửi email thông báo thanh toán thất bại kèm cảnh báo nội dung chuyển khoản {code}I98O
          let failToEmail = user?.email;
          let failRecipientName = user?.fullName;
          if (!failToEmail && booking.user_id) {
            const bookingUser = await findUserById(booking.user_id).catch(() => null);
            if (bookingUser) {
              failToEmail = bookingUser.email;
              failRecipientName = bookingUser.full_name;
            }
          }
          if (!failToEmail && Array.isArray(booking.passengers) && booking.passengers.length > 0) {
            const firstPass = booking.passengers[0] as { email?: string; name?: string };
            if (firstPass?.email) failToEmail = firstPass.email;
            if (!failRecipientName && firstPass?.name) failRecipientName = firstPass.name;
          }

          if (failToEmail && !failToEmail.includes('@khach.vietjetsim.vn')) {
            void sendPaymentFailedEmail({
              to: failToEmail,
              fullName: failRecipientName || 'Quý khách',
              bookingCode: booking.booking_code ?? null,
              bookingId: booking.id,
              amount: cashDue,
              reason: check.message,
              customNote: `Nội dung chuyển khoản hợp lệ bắt buộc có cấu trúc: ${expectedNote} (Lưu ý ký tự "O" là chữ cái O in hoa, không phải số 0). Số tiền chính xác: ${cashDue.toLocaleString('vi-VN')} VNĐ.`,
            }).catch((err) => console.error('[MAIL] sendPaymentFailedEmail error:', err));
          }

          return NextResponse.json(
            { error: 'Transfer details do not match', message: check.message, field: check.field },
            { status: 400 }
          );
        }
      }
    }

    // ─── MOVI: hồ sơ tín dụng & lượt giữ chỗ 30 phút ─────────────────────────
    //
    // Hai việc, cùng một chỗ vì cùng liên quan tới một câu hỏi: "khách này
    // có được thanh toán bằng MOVI không".
    //
    //   1. HỒ SƠ. Trước đây server nhận `method: 'movi'` và không kiểm tra
    //      gì — gọi API trực tiếp với đúng số tiền là xác nhận đơn, bỏ qua
    //      toàn bộ bước định danh. Giờ server tự kiểm tra: hồ sơ phải có họ
    //      tên, CCCD/CMND và số điện thoại hợp lệ.
    //
    //   2. LƯỢT GIỮ CHỖ. Booking có `hold_expires_at` (migration 055) được đặt
    //      khi khách chọn MOVI. Quá 30 phút thì booking phải bị hủy — sweep
    //      chạy trong `getBookingById`, nên tới đây thì `booking.status` đã
    //      là `cancelled` và ta từ chối bằng thông điệp rõ ràng.
    let moviApplication: MoviApplication | null = null;
    let moviTransferNote: string | undefined;

    if (method === 'movi') {
      if (booking.status === 'cancelled' || booking.status === 'refunded') {
        return NextResponse.json(
          {
            error: 'Reservation expired',
            message:
              'Thời gian giữ chỗ đã hết. Mã đặt chỗ đã bị hủy, vui lòng đặt vé lại để tiếp tục.',
            booking_status: booking.status,
          },
          { status: 409 }
        );
      }

      // Hồ sơ có cấu trúc (client mới) hoặc `transfer_note` theo định dạng cũ
      // (client đã cache) — xem `parseLegacyMoviNote`.
      const structuredInput = body.movi && typeof body.movi === 'object' ? body.movi : null;
      const legacyInput = structuredInput ? null : parseLegacyMoviNote(transfer_note);

      if (!structuredInput && !legacyInput) {
        return NextResponse.json(
          {
            error: 'Missing MOVI profile',
            message:
              'Thiếu thông tin hồ sơ Bay trước trả sau (họ tên, số CMND/CCCD và số điện thoại).',
          },
          { status: 400 }
        );
      }

      const validated = validateMoviApplication({
        fullName: structuredInput?.fullName ?? legacyInput?.fullName,
        birthDate: structuredInput?.birthDate ?? legacyInput?.birthDate,
        nationalId: structuredInput?.nationalId ?? legacyInput?.nationalId,
        phone: structuredInput?.phone ?? legacyInput?.phone,
        tenor: structuredInput?.tenor ?? legacyInput?.tenor,
      });

      if (!validated.valid) {
        return NextResponse.json(
          {
            error: 'Invalid MOVI profile',
            message: validated.message,
            field: validated.field,
          },
          { status: 400 }
        );
      }

      moviApplication = validated.data;
      // Client mới nhận một `transfer_note` tóm tắt do server dựng lại (có cả
      // kỳ hạn và ngày sinh); client cũ giữ nguyên chuỗi nó gửi lên.
      moviTransferNote = structuredInput
        ? buildMoviTransferNote(moviApplication)
        : transfer_note?.trim() || buildMoviTransferNote(moviApplication);
    }

    // Nếu khách hàng đính kèm ảnh biên lai để admin đối chiếu,
    // giao dịch được đưa vào trạng thái 'pending' để admin kiểm tra tài khoản và xác nhận.
    const initialStatus = receipt_image ? 'pending' : 'completed';

    // Tìm thông tin người nhận email
    let toEmail = user?.email;
    let recipientName = user?.fullName;

    if (!toEmail && booking.user_id) {
      const bookingUser = await findUserById(booking.user_id);
      if (bookingUser) {
        toEmail = bookingUser.email;
        recipientName = bookingUser.full_name;
      }
    }

    if (!toEmail && Array.isArray(booking.passengers) && booking.passengers.length > 0) {
      const firstPass = booking.passengers[0] as { email?: string; name?: string };
      if (firstPass?.email) toEmail = firstPass.email;
      if (!recipientName && firstPass?.name) recipientName = firstPass.name;
    }

    // Create payment + confirm booking atomically (single transaction)
    const paymentUserId = user?.userId || booking.user_id;
    const result = await createPaymentAndConfirmBooking({
      // The resolved UUID, not the raw request value: the request may carry the
      // six-character PNR, and `payments.booking_id` is a UUID column.
      booking_id: booking.id,
      method,
      // The payment row records the cash that was collected. When SkyPoint
      // covered part of the fare, that is less than the fare — recording the
      // fare here would make revenue and the refund path count money that
      // never moved.
      amount: cashDue,
      status: initialStatus,
      user_id: paymentUserId,
      discount_code_id: validatedDiscountId,
      discount_amount: validatedDiscountAmount,
      receipt_image,
      transfer_note:
        moviTransferNote ||
        transfer_note ||
        (booking.booking_code ? `${booking.booking_code}I98O` : undefined),
      // Hồ sơ tín dụng MOVI được ghi trong CÙNG transaction với giao dịch.
      movi: moviApplication
        ? {
            full_name: moviApplication.fullName,
            birth_date: moviApplication.birthDate || null,
            national_id: moviApplication.nationalId,
            phone: moviApplication.phone,
            tenor_months: moviApplication.tenorMonths,
          }
        : null,
    }).catch(async (paymentError) => {
      if (loyaltyPointsSpent > 0 && user) {
        try {
          await refundLoyaltyPoints(
            user.userId,
            loyaltyPointsSpent,
            `Hoàn điểm do thanh toán thất bại cho đặt chỗ ${booking.booking_code ?? booking_id}`
          );
        } catch (refundError) {
          console.error(
            '[PAYMENT][CRITICAL] SkyPoint spend occurred but payment failed and auto-refund failed.',
            { paymentError, refundError }
          );
        }
      }

      // Trả lại lượt dùng mã giảm giá: lượt đã được claim ở trên, nhưng
      // không có đồng nào nào được thu — khách không được mất lượt dùng cho
      // một giao dịch thất bại.
      if (discountUsageClaimed && validatedDiscountId) {
        try {
          await releaseDiscountUsage(validatedDiscountId);
        } catch (releaseError) {
          console.error(
            '[PAYMENT][CRITICAL] Discount use was claimed but the payment failed and the use was not released.',
            { paymentError, releaseError, discountCodeId: validatedDiscountId }
          );
        }
      }

      // Tự động gửi email thông báo thanh toán thất bại / báo lỗi cho khách hàng
      if (toEmail && !toEmail.includes('@khach.vietjetsim.vn')) {
        void sendPaymentFailedEmail({
          to: toEmail,
          fullName: recipientName || 'Quý khách',
          bookingCode: booking.booking_code ?? null,
          bookingId: booking.id,
          amount: cashDue,
          reason:
            paymentError instanceof Error
              ? paymentError.message
              : 'Giao dịch bị gián đoạn trong quá trình xử lý thanh toán',
        });
      }

      throw paymentError;
    });

    // Chặng về được xác nhận theo CHẶNG ĐÃ SUY RA ở trên, không phải theo id
    // client gửi lên — xem lý do chi tiết ở phần khai báo `requestedReturnBookingId`.
    if (returnBookingId) {
      try {
        await updateBookingStatus(
          returnBookingId,
          initialStatus === 'completed' ? 'confirmed' : 'pending'
        );
      } catch (retConfirmErr) {
        console.error('[PAYMENT] Failed to update return booking status:', retConfirmErr);
      }
    }

    if (initialStatus === 'completed') {
      // Tự động tích lũy điểm thưởng SkyJoy theo hệ số hạng thẻ: Red (x1.0), Silver (x1.2), Gold (x1.5), Diamond (x2.0)
      // Điểm được tích trên số tiền **tiền mặt** khách đã trả: dùng cả tiền và
      // điểm để thanh toán thì không thể tích thêm điểm trên phần đã trả bằng
      // điểm, nếu không khách sẽ được tích điểm hai lần cho cùng một hành trình.
      if (cashDue > 0 || loyaltyPointsSpent > 0) {
        void awardBookingLoyaltyPoints(
          booking.id,
          cashDue > 0 ? cashDue : booking.total_price,
          user?.userId || booking.user_id
        ).catch((err) => {
          console.error('Failed to auto-award loyalty points for booking:', err);
        });
      }

      // Tự động gửi email hoá đơn thanh toán & vé điện tử cho khách hàng.
      // Hoá đơn ghi giá trị vé (sau giảm giá), không phải số tiền mặt đã thu:
      // một vé trả bằng SkyPoint vẫn là một vé trị giá đó.
      const calculatedPoints = skypointPointsForAmount(cashDue > 0 ? cashDue : booking.total_price);
      await sendAutomaticPaymentInvoiceEmail(booking.id, {
        paymentMethod: method,
        customAmount: discountedTotal,
        pointsEarned: calculatedPoints,
      }).catch((err) => {
        console.error('Failed to auto-send payment invoice email:', err);
      });
    } else if (initialStatus === 'pending') {
      // Đơn hàng thanh toán chuyển khoản / VNPAY-QR đang chờ đối soát: gửi email thông báo
      if (toEmail && !toEmail.includes('@khach.vietjetsim.vn')) {
        let bankName: string | undefined;
        let accountNumber: string | undefined;
        let accountHolder: string | undefined;
        let bankBin: string | undefined;
        let template: string | undefined;
        try {
          const banks = await getActiveBankAccounts();
          if (banks && banks.length > 0) {
            const chosen = banks.find((a) => String(a.id) === String(bank_account_id)) ?? banks[0];
            bankName = chosen.bank_name;
            accountNumber = chosen.account_number;
            accountHolder = chosen.account_holder;
            bankBin = chosen.bank_bin || undefined;
            template = chosen.transfer_note_template || undefined;
          }
        } catch {
          // Không lấy được danh sách ngân hàng: dùng thông tin mặc định.
        }

        const noteForEmail =
          transfer_note ||
          renderTransferNote(template, {
            code: result.booking.booking_code ?? '',
            amount: cashDue,
          });

        if (receipt_image) {
          // Vị trí 3: Khách đã tải biên lai, gửi email xác nhận đã tiếp nhận và đang đối soát
          void sendPaymentPendingReviewEmail({
            to: toEmail,
            fullName: recipientName || 'Quý khách',
            bookingCode: result.booking.booking_code ?? null,
            bookingId: booking.id,
            amount: cashDue,
            transferNote: noteForEmail,
            bankName,
          }).catch((err) => {
            console.error('[MAIL] sendPaymentPendingReviewEmail error:', err);
          });
        } else {
          // Khách chưa tải biên lai: gửi email hướng dẫn thanh toán kèm VietQR
          void sendPaymentInstructionEmail({
            to: toEmail,
            fullName: recipientName || 'Quý khách',
            bookingCode: result.booking.booking_code ?? null,
            bookingId: booking.id,
            amount: cashDue,
            transferNote: noteForEmail,
            bankName,
            accountNumber,
            accountHolder,
            bankBin,
          }).catch((err) => {
            console.error('[MAIL] sendPaymentInstructionEmail error:', err);
          });
        }
      }
    }

    return NextResponse.json(
      {
        success: true,
        payment: {
          id: result.payment.id,
          booking_id: result.payment.booking_id,
          method: result.payment.method,
          status: result.payment.status,
          amount: result.payment.amount,
          created_at: result.payment.created_at,
        },
        booking_status: result.booking.status,
        // Thông tin chi tiết của đặt chỗ để giao diện hiển thị ngay sau khi
        // thanh toán thành công: thông tin chặng bay, thông tin vé, thông tin
        // khách hàng và mã đặt chỗ — tất cả lấy từ dữ liệu đã ghi, không
        // phải từ state của trình duyệt.
        booking: {
          id: result.booking.id,
          booking_code: result.booking.booking_code ?? booking.booking_code,
          status: result.booking.status,
          total_price: Number(result.booking.total_price ?? booking.total_price ?? 0),
          discount_amount: Number(result.booking.discount_amount ?? 0),
          flight: {
            flight_no: booking.flight?.flight_no ?? null,
            from_code: booking.flight?.from_code ?? null,
            to_code: booking.flight?.to_code ?? null,
            depart_time: booking.flight?.depart_time ?? null,
            arrive_time: booking.flight?.arrive_time ?? null,
            class: booking.flight?.class ?? null,
          },
          passengers: (booking.passengers ?? []).map((p) => ({
            name: p.name,
            seat_number: p.seat_number ?? null,
            dob: p.dob ?? null,
            phone: p.phone ?? null,
            email: p.email ?? null,
          })),
          seats: (booking.seats ?? []).map((s) => ({
            seat_number: (s as { seat_number?: string }).seat_number ?? null,
          })),
        },
        // Lượt giữ chỗ đã bị xoá khi thanh toán thành công — client dùng để
        // dừng đồng hồ đếm ngược.
        hold: null,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Payment creation error:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: 'Failed to create payment' },
      { status: 500 }
    );
  }
}
