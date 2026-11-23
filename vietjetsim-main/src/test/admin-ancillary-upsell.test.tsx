import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AncillaryUpsellModal from '@/features/admin/components/AncillaryUpsellModal';
import * as adminServices from '@/features/admin/services';
import { POST as ancillaryRoute } from '@/app/api/quan-tri/dat-ve/[id]/dich-vu/route';
import { NextRequest } from 'next/server';
import * as db from '@/lib/db';

vi.mock('@/lib/role-permissions', () => ({
  getRolePermissionsFromDb: vi.fn(async () => new Set<never>([])),
  bypassesPermissionTable: () => true,
}));

vi.mock('@/lib/csrf', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/csrf')>();
  return { ...actual, validateCsrfOrReject: vi.fn(async () => null) };
});

vi.mock('@/lib/neon', async () => {
  const tagged = vi.fn((_strings: TemplateStringsArray, ..._values: unknown[]) => {
    return Promise.resolve([]);
  });
  return { sql: tagged };
});

vi.mock('@/lib/admin-auth', () => ({
  verifyAdminRequest: vi.fn(async () => ({
    payload: { userId: 'admin-01', email: 'admin@vietjetsim.vn', role: 'admin' },
  })),
}));

describe('AncillaryUpsellModal & POST /api/quan-tri/dat-ve/[id]/dich-vu', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('API route POST /api/quan-tri/dat-ve/[id]/dich-vu tính đúng giá catalogue từ server và cập nhật dịch vụ', async () => {
    const mockBooking = {
      id: 'b-ancillary-01',
      booking_code: 'VJADDON1',
      flight_id: 'flight-01',
      status: 'confirmed',
      total_price: 1500000,
      operator_notes: 'Vé book trực tuyến',
      flight: {
        flight_no: 'VJ 120',
        from_code: 'SGN',
        to_code: 'HAN',
        price: 1500000,
        class: 'economy',
      },
    };

    vi.spyOn(db, 'getBookingById').mockResolvedValue(mockBooking as never);
    vi.spyOn(db, 'addBookingBaggage').mockResolvedValue({} as never);
    vi.spyOn(db, 'markBookingBaggagePaid').mockResolvedValue(1);
    vi.spyOn(db, 'upsertBookingAncillary').mockResolvedValue({} as never);
    vi.spyOn(db, 'markBookingAncillariesPaid').mockResolvedValue(1);
    const extraChargeSpy = vi.spyOn(db, 'addBookingExtraCharge').mockResolvedValue();
    const writeAuditLogSpy = vi.spyOn(db, 'writeAuditLog').mockResolvedValue({} as never);

    const req = new NextRequest(
      'http://localhost:4028/api/quan-tri/dat-ve/b-ancillary-01/dich-vu',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baggagePackageId: 'bg-20',
          mealId: 'meal-my-y',
          hasInsurance: true,
          hasTaxi: false,
          isPaidNow: true,
          notes: 'Khách thanh toán thẻ tại quầy',
        }),
      }
    );

    const res = await ancillaryRoute(req, {
      params: Promise.resolve({ id: 'b-ancillary-01' }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    // bg-20 (200,000) + meal-my-y (119,000) + insurance (72,000) = 391,000
    expect(data.extraTotal).toBe(391000);
    expect(data.addedItems).toHaveLength(3);
    expect(extraChargeSpy).toHaveBeenCalledWith('b-ancillary-01', 391000);
    expect(writeAuditLogSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        targetId: 'b-ancillary-01',
        targetType: 'booking',
      })
    );
  });

  it('API route trả về lỗi 400 nếu đơn vé đã bị huỷ (cancelled)', async () => {
    const cancelledBooking = {
      id: 'b-cancelled-01',
      booking_code: 'VJCANC01',
      status: 'cancelled',
      total_price: 1500000,
    };

    vi.spyOn(db, 'getBookingById').mockResolvedValue(cancelledBooking as never);

    const req = new NextRequest(
      'http://localhost:4028/api/quan-tri/dat-ve/b-cancelled-01/dich-vu',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baggagePackageId: 'bg-20',
        }),
      }
    );

    const res = await ancillaryRoute(req, {
      params: Promise.resolve({ id: 'b-cancelled-01' }),
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.message).toContain('Không thể thêm dịch vụ cho đơn đặt chỗ đã huỷ hoặc hoàn tiền');
  });

  it('AncillaryUpsellModal render danh sách gói hành lý, combo suất ăn, bảo hiểm và tính toán tổng tiền chính xác', async () => {
    const mockTarget = {
      id: 'VJ999ABC',
      realId: 'b-test-999',
      userName: 'NGUYEN HOANG NAM',
      flightNo: 'VJ 150',
      route: 'SGN → DAD',
      date: '25/11/2026',
      amount: 1200000,
      status: 'confirmed',
    };

    const addServicesSpy = vi.spyOn(adminServices, 'addAdminBookingAncillaries').mockResolvedValue({
      success: true,
      message: 'Bổ sung dịch vụ thành công!',
      extraTotal: 272000,
      isPaidNow: true,
      addedItems: [
        { type: 'baggage', id: 'bg-20', price: 200000 },
        { type: 'insurance', id: 'insurance', price: 72000 },
      ],
    });

    const handleClose = vi.fn();
    const handleSuccess = vi.fn();

    render(
      <AncillaryUpsellModal
        isOpen={true}
        onClose={handleClose}
        booking={mockTarget}
        onSuccess={handleSuccess}
      />
    );

    // Verify modal header and booking info
    expect(screen.getByText('Mua Bổ Sung Dịch Vụ & Hành Lý')).toBeInTheDocument();
    expect(screen.getByText('VJ999ABC')).toBeInTheDocument();
    expect(screen.getByText('NGUYEN HOANG NAM')).toBeInTheDocument();

    // Select 20kg baggage package
    const baggage20Btn = screen.getByText('Gói 20kg').closest('button');
    expect(baggage20Btn).not.toBeNull();
    fireEvent.click(baggage20Btn!);

    // Select Travel Safe Insurance
    const insuranceBtn = screen.getByText('Bảo hiểm Travel Safe').closest('button');
    expect(insuranceBtn).not.toBeNull();
    fireEvent.click(insuranceBtn!);

    // Check financial breakdown: +272.000₫
    expect(screen.getByText('+272.000₫')).toBeInTheDocument();

    // Submit form
    const submitBtn = screen.getByText('Xác nhận thêm dịch vụ').closest('button');
    expect(submitBtn).not.toBeNull();
    fireEvent.click(submitBtn!);

    await waitFor(() => {
      expect(addServicesSpy).toHaveBeenCalledWith('b-test-999', {
        baggagePackageId: 'bg-20',
        mealId: undefined,
        hasInsurance: true,
        hasTaxi: undefined,
        isPaidNow: true,
        notes: undefined,
      });
      expect(handleSuccess).toHaveBeenCalledWith('Bổ sung dịch vụ thành công!');
      expect(handleClose).toHaveBeenCalled();
    });
  });
});
