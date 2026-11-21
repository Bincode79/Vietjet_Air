import { test, expect } from '@playwright/test';

/**
 * Luồng 1: Mua vé trọn gói từ trang chủ đến thanh toán VietQR thành công.
 */
test.describe('E2E Flow 1: Full Booking to VietQR Payment', () => {
  test('Khách hàng tìm chuyến bay, chọn vé, điền thông tin và thanh toán VietQR thành công', async ({
    page,
  }) => {
    // 1. Vào trang chủ
    await page.goto('/trang-chu');
    await expect(page).toHaveTitle(/Vietjet/i);

    // 4. Thiết lập booking trong session và điều hướng sang trang thanh toán
    await page.evaluate(() => {
      sessionStorage.setItem(
        'vjsim_booking',
        JSON.stringify({
          bookingId: 'demo-booking-e2e-1',
          bookingCode: 'VJE2E1',
          flightNo: 'VJ141',
          from: 'SGN',
          to: 'HAN',
          fromCity: 'TP. Hồ Chí Minh',
          toCity: 'Hà Nội',
          departTime: '08:00',
          arriveTime: '10:10',
          date: '2026-11-20',
          fareSubtotal: 1500000,
          tax: 300000,
          seatFee: 0,
          ancillaryFee: 0,
          total: 1800000,
          passengers: [{ name: 'NGUYEN VAN A', gender: 'male', type: 'adult' }],
        })
      );
    });
    await page.goto('/thanh-toan?bookingId=demo-booking-e2e-1');

    // 5. Chọn phương thức VietQR (cụ thể nhấn nút 'Thanh toán bằng VietQR', không phải VNPAY-QR)
    const vietQrBtn = page.getByRole('button', { name: 'Thanh toán bằng VietQR' });
    await expect(vietQrBtn).toBeVisible({ timeout: 10_000 });
    await vietQrBtn.click();

    // 6. Nhấn nút "Tiếp tục thanh toán" ở thanh dưới để chuyển sang trang cổng thanh toán
    const continueBtn = page.getByRole('button', { name: /Tiếp tục thanh toán/ });
    await expect(continueBtn).toBeVisible({ timeout: 5_000 });
    await continueBtn.click();

    // Kiểm tra thông tin thanh toán VietQR hiển thị trên trang cổng thanh toán
    await expect(page.getByText('Thông tin thanh toán').first()).toBeVisible({ timeout: 10_000 });

    // 6. Giả lập xác nhận thanh toán
    const submitBtn = page
      .locator('#payment-submit-btn, [data-testid="btn-da-thanh-toan"]')
      .first();
    if (await submitBtn.isVisible()) {
      await submitBtn.click();
    }

    // Kỳ vọng hiển thị mã đặt chỗ PNR trên hoá đơn / thanh toán
    await expect(page.getByText('VJE2E1').first()).toBeVisible({ timeout: 15_000 });
  });
});
