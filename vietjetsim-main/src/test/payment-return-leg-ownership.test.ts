/**
 * Regression tests for the `return_booking_id` IDOR on `POST /api/thanh-toan`.
 *
 * The defect:
 *
 *   `POST /api/thanh-toan` protects the OUTBOUND leg with `canAccessBooking` —
 *   the guest cookie, the PNR, or `user_id`/admin. The INBOUND leg of a
 *   round trip was addressed by `body.return_booking_id`, taken straight from
 *   the request and never checked. So a caller who owned one leg could name any
 *   other booking in the system and have its status rewritten to `confirmed`:
 *
 *     POST /api/thanh-toan
 *     { booking_id: <leg I own>, return_booking_id: <someone else's booking> }
 *
 *   The write went through `updateBookingStatus`, the same function that
 *   releases seats and re-adds `flights.available` for a cancellation — so the
 *   unchecked id was one write away from inventing flight inventory.
 *
 * The fix derives the inbound leg from the outbound leg's `trip_id` +
 * `leg_role = 'inbound'` (migration 045), which the client cannot forge, and
 * refuses a `return_booking_id` that disagrees with it.
 *
 * These tests pin the fixed behaviour. The one that matters most is the first:
 * it must fail against the old code, which would have called
 * `updateBookingStatus` with the attacker-supplied id.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const OUTBOUND_ID = 'bk-out-001';
const INBOUND_ID = 'bk-in-001';
const VICTIM_ID = 'bk-victim-999';

const OUTBOUND_BOOKING = {
  id: OUTBOUND_ID,
  user_id: 'user-attacker',
  flight_id: 'flight-out',
  booking_code: 'ATT001',
  trip_id: 'trip-attacker',
  leg_role: 'outbound',
  status: 'pending',
  total_price: 2_000_000,
  passengers: [{ name: 'NGUYEN VAN A', email: 'attacker@example.com' }],
};

const INBOUND_LEG = {
  bookingId: INBOUND_ID,
  bookingCode: 'ATT002',
  legRole: 'inbound',
  status: 'pending',
  totalPrice: 2_000_000,
  flightId: 'flight-in',
  flightNo: 'VJ302',
  fromCode: 'SGN',
  toCode: 'HAN',
  fromCity: 'TP HCM',
  toCity: 'Ha Noi',
  departTime: '2026-03-27T06:00:00Z',
  arriveTime: '2026-03-27T08:25:00Z',
  flightStatus: 'active',
  gate: null,
  terminal: null,
  passengers: [],
  checkIns: [],
};

const mocks = vi.hoisted(() => ({
  getBookingByCodeOrId: vi.fn(),
  getTripById: vi.fn(),
  updateBookingStatus: vi.fn(),
  createPaymentAndConfirmBooking: vi.fn(),
  getActiveBankAccounts: vi.fn(),
  getUserLoyaltyWithProgram: vi.fn(),
  spendLoyaltyPoints: vi.fn(),
  refundLoyaltyPoints: vi.fn(),
  awardBookingLoyaltyPoints: vi.fn(),
  findUserById: vi.fn(),
  getDiscountCodeById: vi.fn(),
  getDiscountCodeByCode: vi.fn(),
  countUserDiscountUsage: vi.fn(),
  claimDiscountUsage: vi.fn(),
  releaseDiscountUsage: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  ...mocks,
  // The payment route imports a handful of helpers that only matter for the
  // methods this test does not exercise.
  getBookingById: vi.fn(),
  getUserLoyaltyWithProgram: mocks.getUserLoyaltyWithProgram,
}));

vi.mock('@/lib/auth', () => ({
  verifyAuthRequest: vi.fn().mockResolvedValue({
    user: { userId: 'user-attacker', email: 'attacker@example.com', role: 'user' },
    error: null,
    response: null,
  }),
}));

vi.mock('@/lib/mail', () => ({
  sendPaymentInstructionEmail: vi.fn().mockResolvedValue(true),
  sendPaymentFailedEmail: vi.fn().mockResolvedValue(true),
  sendPaymentPendingReviewEmail: vi.fn().mockResolvedValue(true),
}));

vi.mock('@/lib/payment-invoice', () => ({
  sendAutomaticPaymentInvoiceEmail: vi.fn().mockResolvedValue(true),
}));

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockReturnValue(null),
}));

import { POST as createPayment } from '@/app/api/thanh-toan/route';

const req = (body: unknown) =>
  new NextRequest('http://localhost:4028/api/thanh-toan', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('POST /api/thanh-toan — inbound leg ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.getBookingByCodeOrId.mockResolvedValue(OUTBOUND_BOOKING);
    // The trip the server derives from `trip_id`. It holds exactly one
    // inbound leg, and it is NOT the victim's booking.
    mocks.getTripById.mockResolvedValue({
      tripId: 'trip-attacker',
      legs: [
        {
          ...INBOUND_LEG,
          legRole: 'outbound',
          bookingId: OUTBOUND_ID,
        },
        INBOUND_LEG,
      ],
    });
    mocks.getActiveBankAccounts.mockResolvedValue([]);
    mocks.getUserLoyaltyWithProgram.mockResolvedValue(null);
    mocks.findUserById.mockResolvedValue(null);
    mocks.countUserDiscountUsage.mockResolvedValue(0);
    mocks.claimDiscountUsage.mockResolvedValue(true);
    mocks.updateBookingStatus.mockResolvedValue({ id: INBOUND_ID, status: 'confirmed' });
    mocks.awardBookingLoyaltyPoints.mockResolvedValue(true);
    mocks.createPaymentAndConfirmBooking.mockImplementation(async (p: { amount: number }) => ({
      payment: {
        id: 'pay-1',
        booking_id: OUTBOUND_ID,
        method: 'card',
        status: 'completed',
        amount: p.amount,
        created_at: new Date().toISOString(),
      },
      booking: { ...OUTBOUND_BOOKING, status: 'confirmed' },
    }));
  });

  it('never writes a status to a booking id the client supplied for the return leg', async () => {
    const res = await createPayment(
      req({
        booking_id: OUTBOUND_ID,
        return_booking_id: VICTIM_ID,
        method: 'card',
        amount: 2_000_000,
      })
    );

    // The client named a booking that is not the inbound leg of this trip.
    // Either the request is refused outright, or the inbound leg is derived
    // from the trip — but the victim's id must never be written to.
    const writtenIds = mocks.updateBookingStatus.mock.calls.map((call) => call[0]);
    expect(writtenIds).not.toContain(VICTIM_ID);

    if (res.status === 403) {
      // Refused: the correct outcome, and nothing was written at all.
      expect(mocks.updateBookingStatus).not.toHaveBeenCalled();
    } else {
      // Accepted: the leg that WAS written is the derived inbound leg.
      expect(res.status).toBe(201);
      expect(writtenIds).toEqual([INBOUND_ID]);
    }
  });

  it('confirms the inbound leg the server derived from the trip, not the one the client named', async () => {
    const res = await createPayment(
      req({
        booking_id: OUTBOUND_ID,
        // The correct inbound leg — the client is allowed to send it, and it
        // must agree with what the server derives.
        return_booking_id: INBOUND_ID,
        method: 'card',
        amount: 2_000_000,
      })
    );

    expect(res.status).toBe(201);
    expect(mocks.updateBookingStatus).toHaveBeenCalledWith(INBOUND_ID, 'confirmed');
  });

  it('refuses a return leg that belongs to a different trip', async () => {
    const res = await createPayment(
      req({
        booking_id: OUTBOUND_ID,
        return_booking_id: VICTIM_ID,
        method: 'card',
        amount: 2_000_000,
      })
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('Forbidden');
    expect(mocks.updateBookingStatus).not.toHaveBeenCalled();
  });

  it('does not touch any inbound leg when the trip has none (a one-way booking)', async () => {
    mocks.getTripById.mockResolvedValue({
      tripId: 'trip-attacker',
      legs: [
        {
          ...INBOUND_LEG,
          legRole: 'outbound',
          bookingId: OUTBOUND_ID,
        },
      ],
    });

    const res = await createPayment(
      req({
        booking_id: OUTBOUND_ID,
        return_booking_id: VICTIM_ID,
        method: 'card',
        amount: 2_000_000,
      })
    );

    // A one-way trip has no inbound leg, so there is nothing to confirm —
    // and still nothing to write to the id the client named.
    const writtenIds = mocks.updateBookingStatus.mock.calls.map((call) => call[0]);
    expect(writtenIds).not.toContain(VICTIM_ID);
  });
});
