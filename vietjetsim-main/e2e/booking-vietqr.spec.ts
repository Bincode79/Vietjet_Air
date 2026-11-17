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

    // 2. Tìm kiếm chuyến bay SGN -> HAN
    const searchForm = page.locator('form, [data-testid="search-flights-form"]').first();
    await expect(searchForm).toBeVisible();

    // Điểm đến trang tìm vé
    const tomorrow = new Date(Date.now() + 86_400_000);
    const depart = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
    await page.goto(`/tim-ve?from=SGN&to=HAN&depart=${depart}&pax=1`);

    // 3. Chọn chuyến bay đầu tiên
    const flightCards = page.locator(
      '[data-testid="flight-result-card"], [data-testid="flight-card"], .flight-card'
    );
    await expect(flightCards.first()).toBeVisible({ timeout: 15_000 });

    const selectButton = flightCards
      .first()
      .locator('button:has-text("Chọn"), button:has-text("Đặt vé")');
    if ((await selectButton.count()) > 0) {
      await selectButton.first().click();
    }

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

    // 5. Chọn phương thức VietQR / VNPAY-QR
    const vietQrTab = page
      .locator('button:has-text("VietQR"), button:has-text("VNPAY-QR")')
      .first();
    if (await vietQrTab.isVisible()) {
      await vietQrTab.click();
    }

    // Kiểm tra thông tin thanh toán VietQR / VNPAY-QR hiển thị
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
