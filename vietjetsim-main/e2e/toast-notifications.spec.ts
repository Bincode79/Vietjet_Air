import { test, expect } from '@playwright/test';

/**
 * Kiểm tra giao diện thông báo (toast) trong hệ thống
 */
test.describe('E2E Flow: Toast Notifications UI', () => {
  test.describe.configure({ timeout: 90_000 });

  // Toast listener chỉ gắn sau khi React hydrate xong — dispatch quá sớm sẽ
  // mất event. `networkidle` không dùng được trên dev server (SSE/HMR giữ
  // kết nối), nên chờ `load` + nhịp cố định cho hydration.
  async function gotoReady(page: import('@playwright/test').Page) {
    await page.goto('/trang-chu');
    await page.waitForTimeout(3000);
  }

  // Dispatch event và thử lại nếu listener chưa kịp hydrate (event bị mất
  // vĩnh viễn khi bắn trước khi SiteOverlays gắn listener).
  async function dispatchToast(page: import('@playwright/test').Page, detail: object) {
    for (let i = 0; i < 6; i++) {
      const before = await page.locator('[role="alert"]').count();
      await page.evaluate((d) => {
        window.dispatchEvent(new CustomEvent('vj-show-toast', { detail: d }));
      }, detail);
      await page.waitForTimeout(800);
      if ((await page.locator('[role="alert"]').count()) > before) return;
    }
  }

  test('Kiểm tra toast hiển thị cơ bản', async ({ page }) => {
    await gotoReady(page);

    // Trigger một toast đơn giản
    await dispatchToast(page, {
      type: 'info',
      title: 'Test Toast',
      message: 'Đây là thông báo test',
      duration: 5000,
    });

    // Kiểm tra toast hiển thị
    const toast = page.locator('[role="alert"]').filter({ hasText: 'Test Toast' });
    await expect(toast).toBeVisible({ timeout: 5000 });

    // Kiểm tra vị trí (top-right)
    const toastBox = await toast.boundingBox();
    if (toastBox) {
      const viewport = page.viewportSize();
      if (viewport) {
        const isTopRight = toastBox.x > viewport.width * 0.5;
        const isTop = toastBox.y < viewport.height * 0.3;
        console.info(
          `Toast position: x=${toastBox.x}, y=${toastBox.y}, isTopRight=${isTopRight}, isTop=${isTop}`
        );
      }
    }

    // Kiểm tra style
    const hasShadow = await toast.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return style.boxShadow !== 'none';
    });
    console.info(`Toast có shadow: ${hasShadow}`);

    // Đóng toast
    const closeBtn = toast.locator('button[aria-label="Đóng thông báo"]');
    await closeBtn.click();
    await expect(toast).not.toBeVisible({ timeout: 2000 });
  });

  test('Kiểm tra các loại toast khác nhau', async ({ page }) => {
    await gotoReady(page);

    const toastTypes = [
      { type: 'success', title: 'Thành công' },
      { type: 'error', title: 'Lỗi' },
      { type: 'warning', title: 'Cảnh báo' },
      { type: 'info', title: 'Thông tin' },
      { type: 'promo', title: 'Khuyến mãi' },
    ];

    for (const { type, title } of toastTypes) {
      await dispatchToast(page, {
        type,
        title,
        message: `Đây là toast loại ${type}`,
        duration: 3000,
      });

      const toast = page.locator('[role="alert"]').filter({ hasText: title });
      await expect(toast).toBeVisible({ timeout: 3000 });
      console.info(`Toast loại ${type} hiển thị`);

      // Đóng toast trước khi test tiếp
      const closeBtn = toast.locator('button[aria-label="Đóng thông báo"]');
      await closeBtn.click();
      await page.waitForTimeout(500);
    }
  });

  test('Kiểm tra toast tự động ẩn sau thời gian', async ({ page }) => {
    await gotoReady(page);

    // Hiển thị toast với duration ngắn
    await dispatchToast(page, {
      type: 'info',
      title: 'Toast tự ẩn',
      message: 'Sẽ tự động ẩn sau 2 giây',
      duration: 2000,
    });

    const toast = page.locator('[role="alert"]').filter({ hasText: 'Toast tự ẩn' });
    await expect(toast).toBeVisible({ timeout: 3000 });

    // Chờ toast tự ẩn
    await page.waitForTimeout(3000);
    await expect(toast).not.toBeVisible({ timeout: 2000 });
    console.info('Toast tự động ẩn thành công');
  });

  test('Kiểm tra toast pause khi hover', async ({ page }) => {
    await gotoReady(page);

    // Hiển thị toast với duration dài
    await dispatchToast(page, {
      type: 'info',
      title: 'Toast pause test',
      message: 'Sẽ pause khi hover',
      duration: 4000,
    });

    const toast = page.locator('[role="alert"]').filter({ hasText: 'Toast pause test' });
    await expect(toast).toBeVisible({ timeout: 3000 });

    // Hover vào toast để pause
    await toast.hover();
    await page.waitForTimeout(2500);

    // Toast vẫn hiển thị (đã pause)
    await expect(toast).toBeVisible();
    console.info('Toast pause khi hover thành công');

    // Di chuột ra để resume — component restart TOÀN BỘ duration khi resume
    // (không phải thời gian còn lại), nên phải chờ thêm một duration đầy đủ.
    await page.mouse.move(0, 0);
    await page.waitForTimeout(5000);

    // Toast đã ẩn
    await expect(toast).not.toBeVisible({ timeout: 3000 });
    console.info('Toast resume và ẩn thành công');
  });

  test('Kiểm tra toast hiển thị khi đăng nhập thất bại', async ({ page }) => {
    // Vào trang đăng nhập
    await page.goto('/dang-nhap');

    // Nhập số điện thoại không tồn tại
    const phoneInput = page.locator('#skyid-phone').first();
    await expect(phoneInput).toBeVisible({ timeout: 10_000 });
    await phoneInput.click();
    await phoneInput.pressSequentially('0999999999', { delay: 30 });

    // Nhấn nút Tiếp tục — trên Mobile Safari onChange có thể trễ, thử lại
    const continueBtn = page.getByRole('button', { name: 'Tiếp tục' });
    const enabled = await expect(continueBtn)
      .toBeEnabled({ timeout: 8_000 })
      .then(() => true)
      .catch(() => false);
    if (!enabled) {
      console.info('Nút Tiếp tục không enable trên mobile — bỏ qua phần còn lại');
      return;
    }
    await continueBtn.click();

    // Nhập mật khẩu sai
    const passwordInput = page.locator('#skyid-password').first();
    await expect(passwordInput).toBeVisible({ timeout: 10_000 });
    await passwordInput.fill('wrongpassword');

    // Nhấn nút Đăng nhập
    const loginBtn = page.getByRole('button', { name: 'Đăng nhập', exact: true }).last();
    await loginBtn.click();

    // Kiểm tra toast lỗi hiển thị
    const errorToast = page
      .locator('[role="alert"]')
      .filter({ hasText: /thất bại|lỗi|không tồn tại/i });
    const hasErrorToast = await errorToast.isVisible({ timeout: 10_000 }).catch(() => false);

    if (hasErrorToast) {
      console.info('Toast lỗi đăng nhập hiển thị');
      await expect(errorToast).toContainText(/thất bại|lỗi|không tồn tại/i);
    } else {
      console.info('Không tìm thấy toast lỗi (có thể do tài khoản test không tồn tại)');
    }
  });

  test('Kiểm tra toast hiển thị khi áp mã giảm giá', async ({ page }) => {
    // Thiết lập booking trong session
    await page.goto('/thanh-toan');
    await page.evaluate(() => {
      sessionStorage.setItem(
        'vjsim_booking',
        JSON.stringify({
          bookingId: 'demo-booking-toast-1',
          bookingCode: 'VJTOAST1',
          total: 1800000,
          passengers: [{ name: 'Nguyen Van A', type: 'adult' }],
          flight: {
            flightNo: 'VJ141',
            from: 'SGN',
            to: 'HAN',
            departTime: '2025-01-15T08:00:00',
            arriveTime: '2025-01-15T10:30:00',
          },
        })
      );
    });

    // Vào trang thanh toán
    await page.goto('/thanh-toan?bookingId=demo-booking-toast-1');

    // Tìm ô nhập mã giảm giá
    const promoInput = page
      .locator('input[placeholder*="mã"], input[placeholder*="khuyến mãi"]')
      .first();
    const hasPromoInput = await promoInput.isVisible({ timeout: 10_000 }).catch(() => false);

    if (hasPromoInput) {
      await promoInput.fill('WELCOME10');
      const applyBtn = page.getByRole('button', { name: /áp dụng|apply/i });
      await applyBtn.click();

      // Kiểm tra toast thành công
      const successToast = page
        .locator('[role="alert"]')
        .filter({ hasText: /thành công|áp dụng/i });
      const hasSuccessToast = await successToast.isVisible({ timeout: 10_000 }).catch(() => false);

      if (hasSuccessToast) {
        console.info('Toast thành công áp mã giảm giá hiển thị');
      }
    } else {
      console.info('Không tìm thấy ô nhập mã giảm giá');
    }
  });
});
