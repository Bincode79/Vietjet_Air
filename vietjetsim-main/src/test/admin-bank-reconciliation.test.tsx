import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import BankReconciliationModal from '@/features/admin/components/BankReconciliationModal';
import * as adminServices from '@/features/admin/services';
import {
  POST as reconcileRoute,
  extractPnrFromDescription,
} from '@/app/api/quan-tri/giao-dich/doi-soat/route';
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

vi.mock('@/lib/payment-invoice', () => ({
  sendAutomaticPaymentInvoiceEmail: vi.fn(async () => {}),
}));

vi.mock('@/lib/admin-auth', () => ({
  verifyAdminRequest: vi.fn(async () => ({
    payload: { userId: 'admin-01', email: 'admin@vietjetsim.vn', role: 'admin' },
  })),
}));

describe('BankReconciliation & extractPnrFromDescription', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('extractPnrFromDescription regex helper', () => {
    it('trích xuất chính xác mã PNR dạng VJxxxx từ nội dung chuyển khoản', () => {
      expect(extractPnrFromDescription('FT2411 VJ644052 NGUYEN VAN A')).toBe('VJ644052');
      expect(extractPnrFromDescription('CHUYEN KHOAN VE VJSMOKE')).toBe('VJSMOKE');
      expect(extractPnrFromDescription('VJ1234 VE DI HAN NOI')).toBe('VJ1234');
    });

    it('trích xuất mã PNR 6 ký tự chuẩn và loại trừ các từ thông dụng tiếng Việt', () => {
      expect(extractPnrFromDescription('NGUYEN VAN B CHUYEN KHOAN VE ABC123')).toBe('ABC123');
      // Không nhầm lẫn các từ khóa thông dụng thành mã PNR
      expect(extractPnrFromDescription('CHUYEN KHOAN TIEN VE MAY BAY VIETIN')).toBeNull();
      expect(extractPnrFromDescription('')).toBeNull();
    });
  });

  describe('API Route POST /api/quan-tri/giao-dich/doi-soat', () => {
    it('phân loại chính xác 4 trạng thái đối soát: matched, mismatch, already_settled và unmatched', async () => {
      const mockMatchedBooking = {
        id: 'b-matched-01',
        booking_code: 'VJMATCH1',
        total_price: 899000,
        discount_amount: 0,
        status: 'pending',
        flight: { flight_no: 'VJ 120' },
        passengers: [{ name: 'NGUYEN VAN A' }],
      };

      const mockMismatchBooking = {
        id: 'b-mismatch-02',
        booking_code: 'VJMIS02',
        total_price: 1500000,
        discount_amount: 0,
        status: 'pending',
        flight: { flight_no: 'VJ 152' },
        passengers: [{ name: 'TRAN VAN B' }],
      };

      const mockSettledBooking = {
        id: 'b-settled-03',
        booking_code: 'VJSETT03',
        total_price: 1200000,
        discount_amount: 0,
        status: 'confirmed',
        flight: { flight_no: 'VJ 180' },
        passengers: [{ name: 'LE THI C' }],
      };

      vi.spyOn(db, 'getBookingByCodeOrId').mockImplementation(async (code: string) => {
        const upper = code.toUpperCase();
        if (upper === 'VJMATCH1') return mockMatchedBooking as never;
        if (upper === 'VJMIS02') return mockMismatchBooking as never;
        if (upper === 'VJSETT03') return mockSettledBooking as never;
        return null as never;
      });

      const req = new NextRequest('http://localhost:4028/api/quan-tri/giao-dich/doi-soat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'preview',
          items: [
            { refId: 'TXN-01', amount: 899000, description: 'VJMATCH1 DUNG SO TIEN' },
            { refId: 'TXN-02', amount: 1000000, description: 'VJMIS02 THIEU 500K' },
            { refId: 'TXN-03', amount: 1200000, description: 'VJSETT03 DA THANH TOAN' },
            { refId: 'TXN-04', amount: 500000, description: 'CHUYEN TIEN KHONG MA PNR' },
          ],
        }),
      });

      const res = await reconcileRoute(req);
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.summary.totalRecords).toBe(4);
      expect(data.summary.matchedCount).toBe(1);
      expect(data.summary.mismatchCount).toBe(1);
      expect(data.summary.alreadySettledCount).toBe(1);
      expect(data.summary.unmatchedCount).toBe(1);

      expect(data.results[0].status).toBe('matched');
      expect(data.results[1].status).toBe('mismatch');
      expect(data.results[2].status).toBe('already_settled');
      expect(data.results[3].status).toBe('unmatched');
    });

    it('thao tác duyệt hàng loạt action: "settle" kích hoạt confirmVietQrPayment và lưu audit log', async () => {
      const mockBooking = {
        id: 'b-matched-99',
        booking_code: 'VJSETTLE99',
        total_price: 950000,
        discount_amount: 0,
        status: 'pending',
        flight: { flight_no: 'VJ 200' },
        passengers: [{ name: 'HOANG ANH' }],
      };

      vi.spyOn(db, 'getBookingByCodeOrId').mockResolvedValue(mockBooking as never);
      const confirmSpy = vi.spyOn(db, 'confirmVietQrPayment').mockResolvedValue({
        ok: true,
        booking: { ...mockBooking, status: 'confirmed' } as never,
        payment: {} as never,
        alreadyPaid: false,
      });
      const writeAuditLogSpy = vi.spyOn(db, 'writeAuditLog').mockResolvedValue({} as never);

      const req = new NextRequest('http://localhost:4028/api/quan-tri/giao-dich/doi-soat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'settle',
          items: [{ refId: 'TXN-SETTLE-1', amount: 950000, description: 'VJSETTLE99 THANH TOAN' }],
          settleBookingCodes: ['VJSETTLE99'],
        }),
      });

      const res = await reconcileRoute(req);
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.summary.settledCount).toBe(1);
      expect(confirmSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          bookingCode: 'VJSETTLE99',
          amount: 950000,
        })
      );
      expect(writeAuditLogSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'payment:batch_reconcile',
          targetType: 'reconciliation',
        })
      );
    });
  });

  describe('Component BankReconciliationModal UI', () => {
    it('cho phép nạp dữ liệu mẫu, phân tích đối soát và hiển thị kết quả trực quan', async () => {
      const mockReconcileResponse: adminServices.BankReconciliationResponse = {
        success: true,
        action: 'preview',
        message: 'Đối soát hoàn tất',
        summary: {
          totalRecords: 2,
          matchedCount: 1,
          mismatchCount: 1,
          alreadySettledCount: 0,
          unmatchedCount: 0,
          invalidCount: 0,
          totalAmount: 2000000,
          matchedAmount: 899000,
          settledCount: 0,
        },
        results: [
          {
            id: 'rec-0',
            refId: 'FT001',
            date: '2026-11-24',
            amount: 899000,
            description: 'VJ644052 NGUYEN VAN A',
            extractedPnr: 'VJ644052',
            bookingId: 'b-01',
            bookingStatus: 'pending',
            expectedAmount: 899000,
            difference: 0,
            passengerName: 'Nguyen Van A',
            flightNo: 'VJ 120',
            status: 'matched',
            settled: false,
          },
          {
            id: 'rec-1',
            refId: 'FT002',
            date: '2026-11-24',
            amount: 1101000,
            description: 'VJMIS02 LE THI B',
            extractedPnr: 'VJMIS02',
            bookingId: 'b-02',
            bookingStatus: 'pending',
            expectedAmount: 1500000,
            difference: -399000,
            passengerName: 'Le Thi B',
            flightNo: 'VJ 150',
            status: 'mismatch',
            settled: false,
          },
        ],
      };

      const reconcileSpy = vi
        .spyOn(adminServices, 'reconcileBankTransactions')
        .mockResolvedValue(mockReconcileResponse);

      const handleClose = vi.fn();
      const handleSuccess = vi.fn();

      render(
        <BankReconciliationModal isOpen={true} onClose={handleClose} onSuccess={handleSuccess} />
      );

      // Verify header
      expect(
        screen.getByText('Công cụ Đối Soát VietQR & Sao Kê Ngân Hàng Tự Động')
      ).toBeInTheDocument();

      // Click "Nạp dữ liệu mẫu thử nghiệm"
      const sampleBtn = screen.getByText('Nạp dữ liệu mẫu thử nghiệm');
      fireEvent.click(sampleBtn);

      // Click "Bắt đầu đối soát"
      const startBtn = screen.getByText('Bắt đầu đối soát');
      fireEvent.click(startBtn);

      await waitFor(() => {
        expect(reconcileSpy).toHaveBeenCalledWith(expect.objectContaining({ action: 'preview' }));
      });

      // Verify KPI rendered
      expect(screen.getByText('Khớp hoàn hảo (Ready)')).toBeInTheDocument();
      expect(screen.getAllByText('899.000₫').length).toBeGreaterThan(0);
      expect(screen.getByText('VJ644052')).toBeInTheDocument();

      // Settle test
      const settleResponse: adminServices.BankReconciliationResponse = {
        ...mockReconcileResponse,
        action: 'settle',
        message: 'Đã duyệt thành công 1 đơn!',
        summary: { ...mockReconcileResponse.summary, settledCount: 1 },
        results: [
          { ...mockReconcileResponse.results[0], settled: true },
          mockReconcileResponse.results[1],
        ],
      };
      reconcileSpy.mockResolvedValueOnce(settleResponse);

      const settleBtn = screen.getByText(/Duyệt 1 đơn đã chọn/);
      fireEvent.click(settleBtn);

      await waitFor(() => {
        expect(reconcileSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'settle',
            settleBookingCodes: ['VJ644052'],
          })
        );
        expect(handleSuccess).toHaveBeenCalledWith('Đã duyệt thành công 1 đơn!');
      });
    });
  });
});
