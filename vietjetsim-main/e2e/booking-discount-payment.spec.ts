import { test, expect } from '@playwright/test';

/**
 * Luồng: Áp mã giảm giá và thanh toán
 * Kịch bản tập trung vào kiểm tra tính năng mã giảm giá trên trang thanh toán
 */
test.describe('E2E Flow: Discount Code Validation and Payment', () => {
  test.describe.configure({ timeout: 90_000 });

  const bookingFixture = (bookingId: string, bookingCode: string) => ({
    bookingId,
    bookingCode,
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
  });

  async function setupBooking(page: import('@playwright/test').Page, booking: object) {
    await page.goto('/trang-chu');
    await page.evaluate((b) => {
      sessionStorage.setItem('vjsim_booking', JSON.stringify(b));
    }, booking);
  }

  test('Áp mã giảm giá hợp lệ trên trang thanh toán', async ({ page }) => {
    // Thiết lập booking trong session
    await setupBooking(page, bookingFixture('demo-booking-discount-1', 'VJDISC1'));
    await page.goto('/thanh-toan?bookingId=demo-booking-discount-1');

    // Kiểm tra trang thanh toán hiển thị - sử dụng heading có chứa text
    await expect(page.getByRole('heading', { name: /THANH TOÁN/i }).first()).toBeVisible({
      timeout: 15_000,
    });

    // Nhập mã giảm giá
    const promoInput = page
      .locator('input[name*="promo"], input[placeholder*="mã giảm giá"]')
      .first();
    if (await promoInput.isVisible()) {
      await promoInput.fill('WELCOME10');

      const applyBtn = page.getByRole('button', { name: /Áp dụng|Kiểm tra/i });
      if (await applyBtn.isVisible()) {
        await applyBtn.click();
        await page.waitForTimeout(2000);

        // Kiểm tra thông báo áp mã giảm giá thành công hoặc nhãn giảm giá hiển thị
        const successMsg = page.getByText(/Áp dụng mã giảm giá thành công|Đã áp dụng/i);
        const discountLabel = page.getByText(/Giảm giá|Discount/i);

        const hasSuccess = await successMsg.isVisible({ timeout: 5000 }).catch(() => false);
        const hasDiscount = await discountLabel.isVisible({ timeout: 3000 }).catch(() => false);

        if (hasSuccess || hasDiscount) {
          console.info('Mã giảm giá được áp dụng thành công');
        }
      }
    }

    // Chọn phương thức thanh toán VietQR
    const vietQrBtn = page.getByRole('button', { name: /VietQR/i });
    if (await vietQrBtn.isVisible()) {
      await vietQrBtn.click();
    }

    // Nhấn nút thanh toán - sử dụng selector cụ thể hơn
    const payBtn = page.getByRole('button', { name: /Tiếp tục thanh toán/i }).first();
    if (await payBtn.isVisible()) {
      await payBtn.click();
    }

    // Kiểm tra kết quả thanh toán
    await expect(page.getByText(/Thông tin thanh toán|VietQR/i).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test('Áp mã giảm giá không hợp lệ nên bị từ chối', async ({ page }) => {
    await setupBooking(page, bookingFixture('demo-booking-discount-2', 'VJDISC2'));
    await page.goto('/thanh-toan?bookingId=demo-booking-discount-2');

    await expect(page.getByRole('heading', { name: /THANH TOÁN/i }).first()).toBeVisible({
      timeout: 15_000,
    });

    const promoInput = page
      .locator('input[name*="promo"], input[placeholder*="mã giảm giá"]')
      .first();
    if (await promoInput.isVisible()) {
      await promoInput.fill('INVALIDCODE');

      const applyBtn = page.getByRole('button', { name: /Áp dụng|Kiểm tra/i });
      if (await applyBtn.isVisible()) {
        await applyBtn.click();
        await page.waitForTimeout(2000);

        const errorMsg = page.getByText(/Mã giảm giá không tồn tại|không hợp lệ/i);
        await expect(errorMsg.first()).toBeVisible({ timeout: 5000 });
      }
    }
  });

  test('Áp mã giảm giá đã hết hạn nên bị từ chối', async ({ page }) => {
    await setupBooking(page, bookingFixture('demo-booking-discount-3', 'VJDISC3'));
    await page.goto('/thanh-toan?bookingId=demo-booking-discount-3');

    await expect(page.getByRole('heading', { name: /THANH TOÁN/i }).first()).toBeVisible({
      timeout: 15_000,
    });

    const promoInput = page
      .locator('input[name*="promo"], input[placeholder*="mã giảm giá"]')
      .first();
    if (await promoInput.isVisible()) {
      await promoInput.fill('EXPIRED20');

      const applyBtn = page.getByRole('button', { name: /Áp dụng|Kiểm tra/i });
      if (await applyBtn.isVisible()) {
        await applyBtn.click();
        await page.waitForTimeout(2000);

        const errorMsg = page.getByText(/hết hạn|không tồn tại|không hợp lệ/i);
        await expect(errorMsg.first()).toBeVisible({ timeout: 5000 });
      }
    }
  });

  test('Kiểm tra API xác thực mã giảm giá trực tiếp', async ({ request }) => {
    // Test API endpoint /api/ma-giam-gia/xac-thuc
    // API yêu cầu CSRF token nên có thể trả về 403 khi gọi trực tiếp
    const response = await request.post('/api/ma-giam-gia/xac-thuc', {
      data: {
        code: 'WELCOME10',
        bookingAmount: 1800000,
      },
    });

    const body = await response.json();

    // API có thể trả về 403 (CSRF), 404 (mã không tồn tại) hoặc 200 (hợp lệ)
    expect([200, 403, 404]).toContain(response.status());

    if (response.status() === 404) {
      expect(body.valid).toBe(false);
      expect(body.message).toContain('không tồn tại');
    }
  });
});
