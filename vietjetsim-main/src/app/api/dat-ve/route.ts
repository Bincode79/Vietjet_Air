import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { verifyAuthRequest, hashPassword } from '@/lib/auth';
import {
  getBookingsByUserId,
  createBooking,
  getFlightById,
  createUser,
  findUserByEmail,
  getSeatLocksForSeats,
} from '@/lib/db';
import { parsePaginationParams, getPaginationMeta } from '@/lib/pagination';
import {
  ANCILLARY_OPTIONS,
  BAGGAGE_PACKAGES,
  FARE_CLASSES,
  FARE_RATE_BY_TYPE,
  OVERSIZED_BAGGAGE,
  PRIORITY_BAGGAGE_FEE,
  TAX_AND_FEE_RATE,
  TRAVEL_SAFE_INSURANCE_PRICE,
  getFareForClass,
  getMealPrice,
  getSeatCharge,
  type AncillaryId,
  type FareClassId,
} from '@/features/bookings/pricing';
import type { PassengerType } from '@/features/bookings/types/booking-flow';
import { rateLimit } from '@/lib/rate-limit';
import { setGuestBookingCookie } from '@/lib/guest-booking';
import { getSystemConfigValue } from '@/lib/system-config';
import { classifySeatLocks, partitionSeatLocks, SeatLockConflictError } from '@/lib/seat-lock';
import { deriveOwnerToken, readSeatSession } from '@/lib/seat-session';

export async function GET(request: NextRequest) {
  try {
    const { user, error, response } = await verifyAuthRequest(request);
    if (error || !user) return response!;

    const payload = user;

    const { searchParams } = new URL(request.url);
    const { page, limit } = parsePaginationParams(searchParams);
    const statusParam = searchParams.get('status');
    const requestedStatuses = statusParam
      ? statusParam
          .split(',')
          .map((item) => item.trim())
          .filter((item) => !!item)
      : [];
    const allowedStatuses = new Set(['pending', 'confirmed', 'completed', 'cancelled', 'refunded']);
    const filteredStatuses = requestedStatuses.filter((status) => allowedStatuses.has(status));
    const status = filteredStatuses.length > 0 ? filteredStatuses : undefined;

    const result = await getBookingsByUserId(payload.userId, { page, limit, status });
    const { bookings, total } = result;

    return NextResponse.json({
      bookings,
      pagination: getPaginationMeta(page, limit, total),
    });
  } catch (error) {
    console.error('Error fetching bookings:', error);
    return NextResponse.json({ error: 'Failed to fetch bookings' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const limited = rateLimit(request, { windowMs: 60_000, maxRequests: 30 });
    if (limited) return limited;

    const { user, error, response: authResponse } = await verifyAuthRequest(request);
    if (error === 'CSRF validation failed') return authResponse!;

    // `seats` are numbers the client picked from the map, `ancillaries` the
    // service ids it ticked, and `fareClass` the fare card it tapped. All three
    // are re-priced below, so the client says what it chose, never what it costs.
    const {
      flight_id,
      return_flight_id,
      total_price: clientTotalPrice,
      passengers,
      seats,
      return_seats,
      fareClass: requestedFareClass,
      returnFareClass: requestedReturnFareClass,
      ancillaries,
      baggage,
      meals,
      consents,
    } = (await request.json()) as {
      flight_id?: string;
      return_flight_id?: string;
      total_price?: number;
      passengers?: Record<string, unknown>[];
      seats?: string[];
      return_seats?: string[];
      fareClass?: FareClassId;
      returnFareClass?: FareClassId;
      ancillaries?: AncillaryId[];
      baggage?: {
        outbound_package_id?: string | null;
        outbound_priority?: boolean;
        return_package_id?: string | null;
        return_priority?: boolean;
      };
      meals?: Record<string, number>;
      consents?: {
        marketing?: boolean;
        survey?: boolean;
        retainForFutureBooking?: boolean;
        policyAccepted?: boolean;
      };
    };

    // An unrecognised card is rejected rather than silently downgraded: it
    // meant to buy a fare this flight does not sell, and quietly charging the
    // cheapest one would under-quote the booking instead of failing it.
    if (requestedFareClass !== undefined && !FARE_CLASSES.includes(requestedFareClass)) {
      return NextResponse.json({ error: 'Unknown fare class' }, { status: 400 });
    }
    if (
      requestedReturnFareClass !== undefined &&
      !FARE_CLASSES.includes(requestedReturnFareClass)
    ) {
      return NextResponse.json({ error: 'Unknown return fare class' }, { status: 400 });
    }

    if (!flight_id || !passengers || !Array.isArray(passengers) || passengers.length === 0) {
      return NextResponse.json({ error: 'flight_id and passengers are required' }, { status: 400 });
    }

    // Giới hạn số khách/đơn do admin cấu hình trong `system_config`
    // (`max_passengers_per_booking`). UI đã chặn sẵn nhưng API phải chặn lại:
    // nếu không, client có thể gửi vượt giới hạn và chèn hàng loạt khách vào
    // `passengers` (mỗi khách là một hàng DB).
    const maxPassengers = await getSystemConfigValue('max_passengers_per_booking');
    if (passengers.length > maxPassengers) {
      return NextResponse.json(
        {
          error: `A booking can include at most ${maxPassengers} passenger(s)`,
          maxPassengers,
        },
        { status: 400 }
      );
    }

    if (!consents || typeof consents !== 'object' || consents.policyAccepted !== true) {
      return NextResponse.json({ error: 'Policy acceptance is required' }, { status: 400 });
    }

    const PASSENGER_TYPES = ['adult', 'child', 'infant'] as const;
    const rawPassengers = passengers as Record<string, unknown>[];

    // A child (2-11) and an infant (under 2) are identified by name and date of
    // birth only — the booking form asks them for nothing more, and the columns
    // hold NULL for them (migration 018). Requiring contact details here made
    // every booking that included a minor impossible to submit. The travelling
    // adult is the one reachable during the flight, so their details are the
    // ones worth collecting.
    const invalidPassenger = rawPassengers.some((passenger) => {
      const type = passenger.type ?? 'adult';
      if (!PASSENGER_TYPES.includes(type as (typeof PASSENGER_TYPES)[number])) return true;
      if (!passenger.name || !passenger.dob) return true;
      if (type === 'adult' && (!passenger.phone || !passenger.email)) return true;
      // An infant has no passport of their own; everyone else needs one.
      if (type !== 'infant' && !passenger.idNumber) return true;
      return false;
    });
    if (invalidPassenger) {
      return NextResponse.json(
        {
          error:
            'Each passenger requires name and date of birth; adults also need contact details and everyone except infants needs an ID document',
        },
        { status: 400 }
      );
    }

    const normalizedPassengers = rawPassengers.map((passenger) => ({
      name: String(passenger.name),
      dob: String(passenger.dob),
      id_number: passenger.idNumber ? String(passenger.idNumber) : null,
      gender: passenger.gender ? String(passenger.gender) : 'male',
      country_code: passenger.countryCode ? String(passenger.countryCode) : 'VN',
      phone: passenger.phone ? String(passenger.phone) : null,
      email: passenger.email ? String(passenger.email) : null,
      residence: passenger.residence ? String(passenger.residence) : null,
      skyjoy_member_id: passenger.skyJoyMemberId ? String(passenger.skyJoyMemberId) : null,
      passenger_type: String(passenger.type ?? 'adult'),
    }));

    // Infants travel on a lap, so a seat is required for every other passenger
    // only if seats are selected. Pre-selecting seats is optional — if none are
    // selected (empty array), seats are assigned later at check-in.
    const seatedPassengers = normalizedPassengers.filter((p) => p.passenger_type !== 'infant');
    const sanitizedSeats = Array.isArray(seats)
      ? seats.filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
      : [];
    if (sanitizedSeats.length > 0 && sanitizedSeats.length !== seatedPassengers.length) {
      return NextResponse.json(
        { error: 'Number of seats must match number of seated passengers' },
        { status: 400 }
      );
    }

    // Price the whole booking here rather than trusting anything the browser
    // sent: the fare, the seats and the services are all priced from
    // `features/bookings/pricing`, the same module the UI sums with, so the two
    // cannot drift. A client posting `total_price: 1` would otherwise buy a
    // real seat for one đồng.
    const flight = await getFlightById(flight_id);
    if (!flight) {
      return NextResponse.json({ error: 'Flight not found' }, { status: 404 });
    }

    const counts = { adult: 0, child: 0, infant: 0 };
    for (const passenger of normalizedPassengers) {
      counts[passenger.passenger_type as PassengerType] += 1;
    }

    // `fareClass` says which card the traveller tapped; the price for it comes
    // from `flights` (migration 030) through the same ladder the results page
    // drew it with, never from the browser. Defaulting to the cheapest card
    // keeps a booking that arrives without one working.
    const fareClass = FARE_CLASSES.includes(requestedFareClass as FareClassId)
      ? (requestedFareClass as FareClassId)
      : 'eco';
    const farePerPassenger = getFareForClass(fareClass, {
      economyPrice: flight.economy_price,
      businessPrice: flight.business_price,
    });
    const taxableFare = farePerPassenger * (counts.adult + counts.child * FARE_RATE_BY_TYPE.child);

    // Seats are sold per passenger, so each carries its own price and its own
    // tax/fee. An unknown seat number prices at 0 rather than being rejected —
    // the adjacency rule is a UX guard, not a money guarantee.
    const seatRows = sanitizedSeats.map((seat) => ({
      seat_number: seat,
      price: getSeatCharge(seat),
    }));
    const seatFee = seatRows.reduce((sum, seat) => sum + seat.price, 0);

    // Services are priced from the catalogues, never from the request. The
    // client says WHICH package it picked and HOW MANY of each meal — never
    // what they cost. An id the catalogue does not know is a 400, not a
    // silent 0₫: a made-up id means the request is not describing something
    // this flight sells. A body carrying only the legacy flat ids (no package
    // ids, no meals map) keeps working through the `ANCILLARY_OPTIONS`
    // fallback.
    const seatedCount = counts.adult + counts.child;
    const BAGGAGE_CATALOG = [...BAGGAGE_PACKAGES, ...OVERSIZED_BAGGAGE];
    const requestedAncillaryIds = new Set(
      (ancillaries || []).filter((id): id is AncillaryId =>
        ANCILLARY_OPTIONS.some((option) => option.id === id)
      )
    );
    const ancillaryRows: { option_id: string; unit_price: number; quantity: number }[] = [];

    // ─── Hành lý: giá gói + phụ phí ưu tiên, từng chặng ──────────────────────
    const hasBaggageSelection = Boolean(
      baggage &&
      (baggage.outbound_package_id ||
        baggage.return_package_id ||
        baggage.outbound_priority ||
        baggage.return_priority)
    );
    let baggageFee = 0;
    if (hasBaggageSelection && baggage) {
      const lookupPackage = (packageId?: string | null): { found: boolean; price: number } => {
        if (!packageId) return { found: true, price: 0 };
        const pkg = BAGGAGE_CATALOG.find((item) => item.id === packageId);
        return pkg ? { found: true, price: pkg.price } : { found: false, price: 0 };
      };
      const outboundPkg = lookupPackage(baggage.outbound_package_id);
      const returnPkg = lookupPackage(baggage.return_package_id);
      if (!outboundPkg.found || !returnPkg.found) {
        return NextResponse.json(
          { error: 'Invalid baggage package', message: 'Gói hành lý không tồn tại.' },
          { status: 400 }
        );
      }
      baggageFee =
        outboundPkg.price +
        returnPkg.price +
        (baggage.outbound_priority ? PRIORITY_BAGGAGE_FEE : 0) +
        (baggage.return_priority ? PRIORITY_BAGGAGE_FEE : 0);
      if (baggageFee > 0) {
        ancillaryRows.push({ option_id: 'baggage', unit_price: baggageFee, quantity: 1 });
      }
    } else if (requestedAncillaryIds.has('baggage')) {
      const legacy = ANCILLARY_OPTIONS.find((option) => option.id === 'baggage')!;
      baggageFee = legacy.price * seatedCount;
      ancillaryRows.push({ option_id: 'baggage', unit_price: legacy.price, quantity: seatedCount });
    }

    // ─── Suất ăn: giá từng món × số lượng ────────────────────────────────────
    let mealFee = 0;
    const mealEntries = Object.entries(meals ?? {}).filter(([, qty]) => Math.round(qty) > 0);
    if (mealEntries.length > 0) {
      for (const [mealId, rawQty] of mealEntries) {
        const price = getMealPrice(mealId);
        if (price === null) {
          return NextResponse.json(
            { error: 'Invalid meal', message: 'Món ăn không tồn tại trong danh mục.' },
            { status: 400 }
          );
        }
        const quantity = Math.round(rawQty);
        mealFee += price * quantity;
        ancillaryRows.push({ option_id: mealId, unit_price: price, quantity });
      }
    } else if (requestedAncillaryIds.has('meal')) {
      const legacy = ANCILLARY_OPTIONS.find((option) => option.id === 'meal')!;
      mealFee = legacy.price * seatedCount;
      ancillaryRows.push({ option_id: 'meal', unit_price: legacy.price, quantity: seatedCount });
    }

    // ─── Bảo hiểm Travel Safe: một lần mỗi booking, giá catalogue ────────────
    let insuranceFee = 0;
    if (requestedAncillaryIds.has('insurance')) {
      insuranceFee = TRAVEL_SAFE_INSURANCE_PRICE;
      ancillaryRows.push({
        option_id: 'insurance',
        unit_price: TRAVEL_SAFE_INSURANCE_PRICE,
        quantity: 1,
      });
    }

    const ancillaryFee = baggageFee + mealFee + insuranceFee;

    // Return flight validation & pricing for round-trip bookings
    let returnFlight = null;
    let returnTaxableFare = 0;
    let returnFarePerPassenger = 0;
    let returnSeatFee = 0;
    let sanitizedReturnSeats: string[] = [];
    let returnSeatRows: { seat_number: string; price: number }[] = [];

    if (return_flight_id) {
      returnFlight = await getFlightById(return_flight_id);
      if (!returnFlight) {
        return NextResponse.json({ error: 'Return flight not found' }, { status: 404 });
      }
      if (returnFlight.available < seatedCount) {
        return NextResponse.json(
          { error: 'Return flight fully booked', message: 'Chuyến bay chiều về đã hết ghế trống.' },
          { status: 409 }
        );
      }
      // The return leg must actually be a return: the reverse route, departing
      // no earlier than the outbound lands. The search page constrains both
      // through its URL, but the API trusts `return_flight_id` — a hand-written
      // request could otherwise weld two one-way flights into a "trip" that
      // flies the customer in circles.
      if (returnFlight.from_code !== flight.to_code || returnFlight.to_code !== flight.from_code) {
        return NextResponse.json(
          {
            error: 'Return flight route mismatch',
            message: 'Chuyến bay về phải bay tuyến ngược với chuyến bay đi.',
          },
          { status: 400 }
        );
      }
      const outboundArriveAt = new Date(flight.arrive_time).getTime();
      const returnDepartAt = new Date(returnFlight.depart_time).getTime();
      if (
        Number.isFinite(outboundArriveAt) &&
        Number.isFinite(returnDepartAt) &&
        returnDepartAt < outboundArriveAt
      ) {
        return NextResponse.json(
          {
            error: 'Return flight departs before the outbound lands',
            message: 'Chuyến bay về phải khởi hành sau khi chuyến bay đi hạ cánh.',
          },
          { status: 400 }
        );
      }
      const returnFareClass = FARE_CLASSES.includes(requestedReturnFareClass as FareClassId)
        ? (requestedReturnFareClass as FareClassId)
        : 'eco';
      returnFarePerPassenger = getFareForClass(returnFareClass, {
        economyPrice: returnFlight.economy_price,
        businessPrice: returnFlight.business_price,
      });
      returnTaxableFare =
        returnFarePerPassenger * (counts.adult + counts.child * FARE_RATE_BY_TYPE.child);

      sanitizedReturnSeats = Array.isArray(return_seats)
        ? return_seats.filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
        : [];
      // The outbound leg enforces this above; the return leg must too, or a
      // client could attach seats nobody occupies (each one charged through
      // `getSeatCharge`) or drop a seated passenger's seat silently.
      if (
        sanitizedReturnSeats.length > 0 &&
        sanitizedReturnSeats.length !== seatedPassengers.length
      ) {
        return NextResponse.json(
          { error: 'Number of return seats must match number of seated passengers' },
          { status: 400 }
        );
      }
      returnSeatRows = sanitizedReturnSeats.map((seat) => ({
        seat_number: seat,
        price: getSeatCharge(seat),
      }));
      returnSeatFee = returnSeatRows.reduce((sum, seat) => sum + seat.price, 0);
    }

    const outboundCalculated = Math.round(
      taxableFare +
        farePerPassenger * counts.infant * FARE_RATE_BY_TYPE.infant +
        taxableFare * TAX_AND_FEE_RATE +
        seatFee +
        ancillaryFee
    );

    const returnCalculated = returnFlight
      ? Math.round(
          returnTaxableFare +
            returnFarePerPassenger * counts.infant * FARE_RATE_BY_TYPE.infant +
            returnTaxableFare * TAX_AND_FEE_RATE +
            returnSeatFee
        )
      : 0;

    const serverCalculated = outboundCalculated + returnCalculated;

    const _clientTotal =
      typeof clientTotalPrice === 'number' && Number.isFinite(clientTotalPrice)
        ? Math.round(clientTotalPrice)
        : 0;

    // The booked total is the server's number.
    const totalPrice = serverCalculated;

    // `owner_token` của phiên giữ ghế — SHA-256 của cookie `vj_seat_session`
    // do server cấp (xem `src/lib/seat-session.ts`). `null` khi request không
    // có cookie: tức là KHÔNG chứng minh được sở hữu lock nào.
    const seatSession = readSeatSession(request);
    const seatOwnerToken = seatSession ? deriveOwnerToken(seatSession) : null;

    // ─── Quyền sở hữu khoá ghế ───────────────────────────────────────────────
    //
    // `seat_locks` từng CHỈ mang tính thông báo: không nơi nào trong luồng
    // tạo booking đọc lại bảng này, nên một ghế đang được khách A giữ vẫn bị
    // khách B đặt mất — và A chỉ biết khi đến bước cuối, lúc index duy nhất
    // trên `seats` từ chối. Ở đây luật được ràng buộc đúng chỗ:
    //
    //   * ghế đang có lock của phiên KHÁC  → từ chối (409);
    //   * ghế có lock của chính phiên này   → được đặt (giữ ghế rồi đặt vé);
    //   * ghế không có lock nào             → được đặt (khách không chọn ghế,
    //                                         hoặc chọn ghế rồi lock hết hạn).
    //
    // Xem `src/lib/seat-lock.ts` cho luật và lý do fail-closed.
    //
    // Lưu ý: đây là lớp kiểm tra THỨ NHẤT, để trả lời nhanh và đúng thông
    // điệp. Lớp thứ hai nằm trong `createBooking` (ràng buộc nguyên tử trong
    // SQL) — lớp đó mới là lớp quyết định, vì giữa hai lớp này có cửa sổ
    // TOCTOU: khách B kiểm tra ở đây (thấy trống), khách A giữ ghế, khách B
    // tạo booking.
    if (sanitizedSeats.length > 0) {
      const lockRows = await getSeatLocksForSeats(flight_id, sanitizedSeats);
      const verdicts = classifySeatLocks(lockRows, sanitizedSeats, seatOwnerToken);
      const { blocked } = partitionSeatLocks(verdicts);

      if (blocked.length > 0) {
        return NextResponse.json(
          {
            error: 'Seat held by another customer',
            message: 'Một hoặc nhiều ghế đang được khách khác giữ. Vui lòng chọn ghế khác.',
            seats: blocked,
          },
          { status: 409 }
        );
      }
    }

    // Prevent overbooking: refuse the booking when the flight has no seats left
    // for every seated passenger. This check must happen before createBooking so
    // we never accept money for a seat that does not exist.
    if (flight.available < seatedCount) {
      return NextResponse.json(
        { error: 'Flight fully booked', message: 'Chuyến bay đã hết ghế trống.' },
        { status: 409 }
      );
    }

    let bookingUserId: string;

    if (user) {
      bookingUserId = user.userId;
    } else {
      // A guest booking is attached to a dedicated guest account. The account
      // is identified by the passenger's own email address when they gave
      // one, otherwise by a synthetic address derived from the phone number.
      //
      // It is deliberately NOT looked up by phone number: `user_profiles.phone`
      // is UNIQUE (migration 007) and a registered customer already owns that
      // number, so matching on it would attach the stranger's booking to the
      // customer's account — their bookings, their wallet, their PII. The
      // lookup below is by *email*, which the guest had to type in themselves,
      // and a fresh account is created when there is no match.
      const primaryAdult =
        normalizedPassengers.find(
          (p) => p.passenger_type === 'adult' && p.email && p.email.includes('@')
        ) || normalizedPassengers[0];

      const rawEmail = primaryAdult?.email?.trim().toLowerCase();
      const rawPhone = primaryAdult?.phone
        ? String(primaryAdult.phone).replace(/[^0-9]/g, '')
        : null;
      const passengerName = primaryAdult?.name?.trim() || 'Khách vãng lai';

      const guestEmail =
        rawEmail && rawEmail !== 'null' && rawEmail !== 'undefined'
          ? rawEmail
          : `${rawPhone || Date.now()}@khach.vietjetsim.vn`;

      let userRecord = await findUserByEmail(guestEmail);

      if (!userRecord) {
        const passwordHash = await hashPassword(randomUUID());
        // `phone` is not stored for a guest account created from a phone-only
        // booking: the number may already belong to a registered customer, and
        // `user_profiles_phone_key` is UNIQUE.
        userRecord = await createUser(
          guestEmail,
          passwordHash,
          passengerName,
          'user',
          rawPhone && rawPhone.length >= 9 && rawEmail ? rawPhone : null
        );
      }

      bookingUserId = userRecord.id;
    }

    // A round trip is one "trip" in the database (migration 045): both legs
    // share one `trip_id`, so a single PNR resolves to the whole journey.
    // Each leg still keeps its own PNR of its own `bookings` row — the plan
    // kept them separate — but the trip id is what links them.
    const tripId = randomUUID();

    const booking = await createBooking(
      {
        user_id: bookingUserId,
        flight_id,
        total_price: totalPrice,
        seatedCount,
        trip_id: tripId,
        leg_role: 'outbound',
        // Ràng buộc lock NGUYÊN TỬ (xem `createBooking`): ghế đang bị phiên
        // khác giữ thì đơn này phải thất bại, kể cả khi lớp kiểm tra ở trên
        // đã qua. Đây là lớp quyết định.
        seat_owner_token: seatOwnerToken,
      },
      normalizedPassengers,
      seatRows,
      ancillaryRows,
      {
        marketing: consents?.marketing ?? false,
        survey: consents?.survey ?? false,
        retainForFutureBooking: consents?.retainForFutureBooking ?? false,
        policyAccepted: consents?.policyAccepted ?? false,
      }
    );

    if (!booking) {
      return NextResponse.json(
        { error: 'Flight fully booked', message: 'Chuyến bay đã hết ghế trống.' },
        { status: 409 }
      );
    }

    let returnBooking = null;
    if (return_flight_id) {
      returnBooking = await createBooking(
        {
          user_id: bookingUserId,
          flight_id: return_flight_id,
          total_price: 0,
          seatedCount,
          trip_id: tripId,
          leg_role: 'inbound',
          // Chặng về giữ ghế trên chuyến bay KHÁC, nên lock của nó là của
          // chính phiên này (nếu khách đã giữ ghế về) — cùng luật với chặng đi.
          seat_owner_token: seatOwnerToken,
        },
        normalizedPassengers,
        returnSeatRows,
        [],
        {
          marketing: consents?.marketing ?? false,
          survey: consents?.survey ?? false,
          retainForFutureBooking: consents?.retainForFutureBooking ?? false,
          policyAccepted: consents?.policyAccepted ?? false,
        }
      );
    }

    // Không gửi email ở bước đặt vé: mã đặt chỗ (PNR) chỉ được gửi khi
    // thanh toán thành công (xem `POST /api/thanh-toan` +
    // `sendAutomaticPaymentInvoiceEmail`). Email hướng dẫn chuyển khoản ở đây
    // in PNR to đùng — gửi lúc đơn còn `pending` là lộ mã trước khi thu tiền.
    // Khách vẫn thấy PNR + hướng dẫn thanh toán ngay trên UI trang kết quả
    // đặt vé, và nhận lại email hướng dẫn ở nhánh `pending` của thanh-toán
    // nếu bấm "thanh toán sau".

    const bookingPayload = {
      ...booking,
      trip_id: tripId,
      leg_role: 'outbound' as const,
      return_booking_id: returnBooking?.id,
      return_booking_code: returnBooking?.booking_code,
      return_trip_id: returnBooking ? tripId : undefined,
      return_leg_role: returnBooking ? ('inbound' as const) : undefined,
    };

    const response = NextResponse.json({ booking: bookingPayload }, { status: 201 });

    // Remember that this browser created the booking, so the payment endpoint
    // can tell "the guest who booked it" from "someone who guessed the id".
    if (!user) {
      setGuestBookingCookie(response, request, booking.id);
      if (returnBooking?.id) {
        setGuestBookingCookie(response, request, returnBooking.id);
      }
    }

    return response;
  } catch (error) {
    // Ghế bị phiên khác giữ, phát hiện bởi ràng buộc NGUYÊN TỬ trong
    // `createBooking` — tức là lớp kiểm tra ở đầu route đã qua, nhưng giữa
    // hai lớp đó có người khác giành ghế. Đây là câu trả lời đúng, và nó
    // khác "ghế vừa được người khác đặt" (index duy nhất `23505` bên dưới):
    // ở đây ghế VẪN CÒN TRỐNG, chỉ là đang có người giữ.
    if (error instanceof SeatLockConflictError) {
      return NextResponse.json(
        {
          error: 'Seat held by another customer',
          message: 'Một hoặc nhiều ghế đang được khách khác giữ. Vui lòng chọn ghế khác.',
          seats: error.seats,
        },
        { status: 409 }
      );
    }

    const dbError = error as { code?: unknown; constraint?: unknown; message?: unknown };
    if (
      dbError.code === '23505' &&
      (dbError.constraint === 'idx_seats_flight_seat_unique' ||
        String(dbError.message).includes('idx_seats_flight_seat_unique'))
    ) {
      return NextResponse.json(
        {
          error: 'Seat no longer available',
          message: 'Ghế bạn chọn vừa được người khác đặt. Vui lòng chọn ghế khác.',
        },
        { status: 409 }
      );
    }
    console.error('Error creating booking:', error);
    return NextResponse.json({ error: 'Failed to create booking' }, { status: 500 });
  }
}
