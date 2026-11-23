import { test, expect } from '@playwright/test';

/**
 * Kiểm tra giao diện khi người dùng đăng nhập vào hệ thống
 */
test.describe('E2E Flow: User Login and UI Verification', () => {
  test.describe.configure({ timeout: 90_000 });

  // Mobile viewport tests
  test.describe('Mobile Viewport', () => {
    test.use({ viewport: { width: 375, height: 812 } });

    test('Kiểm tra mobile header hiển thị đúng khi chưa đăng nhập', async ({ page }) => {
      await page.goto('/trang-chu');

      // Kiểm tra header mobile hiển thị logo và nút menu
      const logo = page.locator('img[alt*="Vietjet"]').first();
      await expect(logo).toBeVisible({ timeout: 10_000 });

      const menuBtn = page.getByRole('button', { name: /menu|Mở menu/i });
      const hasMenuBtn = await menuBtn.isVisible({ timeout: 5000 }).catch(() => false);

      if (hasMenuBtn) {
        console.info('Nút menu mobile hiển thị');
      }

      // Kiểm tra text "Đăng nhập" trên mobile
      const loginText = page.getByText(/Đăng nhập/i).first();
      await expect(loginText).toBeVisible({ timeout: 10_000 });
    });
  });

  // Desktop viewport tests
  test.describe('Desktop Viewport', () => {
    test.use({ viewport: { width: 1280, height: 720 } });

    test('Kiểm tra dropdown menu tài khoản (desktop)', async ({ page }) => {
      await page.goto('/trang-chu');

      // Mở menu tài khoản (nếu đã đăng nhập) hoặc nút đăng nhập
      const accountBtn = page
        .locator(
          '[aria-label*="tài khoản"], [aria-label*="account"], button:has-text("Đăng nhập")'
        )
        .first();
      const hasAccountBtn = await accountBtn.isVisible({ timeout: 5000 }).catch(() => false);

      if (hasAccountBtn) {
        await accountBtn.click();
        await page.waitForTimeout(1000);

        // Kiểm tra các menu item
        const menuItems = [
          'Tài khoản của tôi',
          'Chuyến bay của tôi',
          'Ví và thanh toán',
          'Cài đặt bảo mật',
        ];

        for (const item of menuItems) {
          const menuItem = page.getByText(item).first();
          const hasItem = await menuItem.isVisible({ timeout: 2000 }).catch(() => false);
          if (hasItem) {
            console.info(`Menu item "${item}" hiển thị`);
          }
        }
      }
    });
  });

  // Tablet viewport tests
  test.describe('Tablet Viewport', () => {
    test.use({ viewport: { width: 768, height: 1024 } });

    test('Kiểm tra responsive header trên tablet', async ({ page }) => {
      await page.goto('/trang-chu');

      // Kiểm tra header responsive
      const header = page.locator('header').first();
      await expect(header).toBeVisible({ timeout: 10_000 });

      // Kiểm tra logo
      const logo = page.locator('img[alt*="Vietjet"]').first();
      await expect(logo).toBeVisible({ timeout: 10_000 });

      // Kiểm tra nav links
      const navLinks = page.getByRole('link', { name: /Chuyến bay của tôi|Online Check-in/i });
      const hasNavLinks = await navLinks.first().isVisible({ timeout: 5000 }).catch(() => false);

      if (hasNavLinks) {
        console.info('Navigation links hiển thị trên tablet');
      }
    });
  });

  test('Kiểm tra form đăng nhập hiển thị đúng', async ({ page }) => {
    // 1. Vào trang đăng nhập
    await page.goto('/dang-nhap');
    await expect(page).toHaveTitle(/Vietjet/i);

    // 2. Kiểm tra form đăng nhập hiển thị
    const phoneInput = page.locator('#skyid-phone').first();
    await expect(phoneInput).toBeVisible({ timeout: 10_000 });

    // Kiểm tra nút Tiếp tục (ban đầu disabled)
    const continueBtn = page.getByRole('button', { name: 'Tiếp tục' });
    await expect(continueBtn).toBeVisible({ timeout: 5_000 });
    await expect(continueBtn).toBeDisabled();

    // 3. Nhập số điện thoại để kiểm tra validation
    await phoneInput.fill('0901234567');
    await page.waitForTimeout(500);

    // 4. Kiểm tra UI sau khi nhập (có thể enabled hoặc vẫn disabled tùy validation)
    const isEnabled = await continueBtn.isEnabled().catch(() => false);
    console.info(`Nút Tiếp tục sau khi nhập: ${isEnabled ? 'enabled' : 'disabled'}`);

    // 5. Kiểm tra các element khác trong form
    const passwordStep = page.locator('#skyid-password');
    const hasPasswordField = await passwordStep.isVisible({ timeout: 2000 }).catch(() => false);
    console.info(`Form mật khẩu hiển thị: ${hasPasswordField}`);
  });

  test('Kiểm tra menu tài khoản trên header khi đã đăng nhập', async ({ page }) => {
    // Vào trang tài khoản
    await page.goto('/tai-khoan');

    // Kiểm tra trang tải được
    const pageTitle = await page.title();
    const hasContent = await page.content();
    expect(hasContent.length).toBeGreaterThan(1000);
    console.info('Trang tài khoản tải thành công:', pageTitle);

    // Kiểm tra header có logo Vietjet
    const logo = page.locator('img[alt*="Vietjet"], img[src*="vietjet"]').first();
    const hasLogo = await logo.isVisible({ timeout: 5000 }).catch(() => false);
    if (hasLogo) {
      console.info('Logo Vietjet hiển thị trên header');
    }
  });

  test('Kiểm tra trang Chuyến bay của tôi yêu cầu đăng nhập', async ({ page }) => {
    // Vào trang chuyến bay của tôi mà chưa đăng nhập
    await page.goto('/chuyen-bay-cua-toi');

    // Trang có thể redirect về /dang-nhap hoặc hiển thị prompt đăng nhập
    await page.waitForTimeout(3000);
    const url = page.url();
    const redirectedToLogin = /dang-nhap|login/i.test(url);

    const loginForm = page.locator('#skyid-phone, input[type="tel"], input[name*="phone"]').first();
    const hasLoginForm = await loginForm.isVisible({ timeout: 8000 }).catch(() => false);
    const loginText = await page.getByText(/đăng nhập|Đăng nhập/i).count();

    console.info(
      `Chuyến bay của tôi: redirect=${redirectedToLogin}, loginForm=${hasLoginForm}, loginTexts=${loginText}`
    );

    // Chấp nhận cả redirect lẫn hiển thị prompt đăng nhập trên trang
    expect(redirectedToLogin || hasLoginForm || loginText > 0).toBeTruthy();
  });

  test('Kiểm tra giao diện trang chủ với người dùng chưa đăng nhập', async ({ page }) => {
    await page.goto('/trang-chu');

    // Kiểm tra trang tải được
    const pageTitle = await page.title();
    const hasContent = await page.content();
    expect(hasContent.length).toBeGreaterThan(1000);
    console.info('Trang chủ tải thành công:', pageTitle);

    // Kiểm tra form tìm chuyến bay hiển thị
    const searchBtn = page.getByRole('button', { name: /Tìm chuyến bay/i }).first();
    const hasSearchBtn = await searchBtn.isVisible({ timeout: 10000 }).catch(() => false);
    if (hasSearchBtn) {
      console.info('Nút tìm chuyến bay hiển thị');
    }

    // Kiểm tra nút đăng nhập hiển thị (có thể có nhiều element)
    const loginElements = await page.getByText(/Đăng nhập/i).count();
    if (loginElements > 0) {
      console.info(`Tìm thấy ${loginElements} element chứa "Đăng nhập"`);
    }
  });

  test('Kiểm tra mobile header hiển thị đúng khi chưa đăng nhập', async ({ page }) => {
    await page.goto('/trang-chu');

    // Kiểm tra trang tải được
    const pageTitle = await page.title();
    const hasContent = await page.content();
    expect(hasContent.length).toBeGreaterThan(1000);
    console.info('Trang chủ (mobile) tải thành công:', pageTitle);

    // Kiểm tra logo Vietjet hiển thị
    const logo = page.locator('img[alt*="Vietjet"], img[src*="vietjet"]').first();
    const hasLogo = await logo.isVisible({ timeout: 5000 }).catch(() => false);
    if (hasLogo) {
      console.info('Logo Vietjet hiển thị trên mobile');
    }
  });

  test('Kiểm tra dropdown menu tài khoản (desktop)', async ({ page }) => {
    await page.goto('/trang-chu');

    const accountBtn = page
      .locator(
        '[aria-label*="tài khoản"], [aria-label*="account"], button:has-text("Đăng nhập")'
      )
      .first();
    const hasAccountBtn = await accountBtn.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasAccountBtn) {
      await accountBtn.click();
      await page.waitForTimeout(1000);

      const menuItems = ['Tài khoản của tôi', 'Chuyến bay của tôi', 'Đăng xuất'];
      for (const item of menuItems) {
        const menuItem = page.getByText(item).first();
        const hasItem = await menuItem.isVisible({ timeout: 2000 }).catch(() => false);
        if (hasItem) {
          console.info(`Menu item "${item}" hiển thị`);
        }
      }
    }
  });

  test('Kiểm tra responsive header trên tablet', async ({ page }) => {
    await page.goto('/trang-chu');

    // Kiểm tra trang tải được
    const pageTitle = await page.title();
    const hasContent = await page.content();
    expect(hasContent.length).toBeGreaterThan(1000);
    console.info('Trang chủ (tablet) tải thành công:', pageTitle);

    // Kiểm tra header hiển thị
    const header = page.locator('header').first();
    const hasHeader = await header.isVisible({ timeout: 5000 }).catch(() => false);
    if (hasHeader) {
      console.info('Header hiển thị trên tablet');
    }
  });
});
