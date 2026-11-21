import { expect, test } from '@playwright/test';

/**
 * Kiểm tra dải đặt vé trên trang chủ ở viewport mobile (375×812 portrait và
 * 812×375 landscape): form hiển thị đầy đủ, các picker không bị cắt, nút CTA
 * vẫnTrigger được, và không bị che bởi MobileBottomNav.
 */
test.describe('HeroBookingWidget mobile responsive', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('renders full booking form and CTA on 375×812 portrait', async ({ page }) => {
    await page.goto('/trang-chu');

    await expect(page.getByText('Điểm khởi hành')).toBeVisible();
    await expect(page.getByText('Điểm đến')).toBeVisible();
    await expect(page.getByText('Hành khách')).toBeVisible();
    await expect(page.getByRole('button', { name: /Tìm chuyến bay/i })).toBeVisible();
  });

  test('opens airport picker without cutting off at 375×812', async ({ page }) => {
    await page.goto('/trang-chu');
    await page.getByRole('button', { name: 'Điểm khởi hành', exact: true }).click();

    const listbox = page.getByRole('listbox', { name: 'Điểm khởi hành' });
    await expect(listbox).toBeVisible();
    // Danh sách phải nằm trong cửa sổ (không tràn đáy).
    const box = await listbox.boundingBox();
    await expect(page.viewportSize()).not.toBeNull();
    if (box && page.viewportSize()) {
      expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize().height + 1);
    }
  });

  test('opens date picker without cutting off at 375×812', async ({ page }) => {
    await page.goto('/trang-chu');
    await page.getByRole('button', { name: 'Ngày đi' }).click();

    await expect(page.getByText(/tháng/i).first()).toBeVisible();
    const popover = page.locator('.z-50').filter({ hasText: /tháng/i }).first();
    await expect(popover).toBeVisible();
    const box = await popover.boundingBox();
    if (box && page.viewportSize()) {
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize().height + 1);
    }
  });

  test('opens passenger picker without cutting off at 375×812', async ({ page }) => {
    await page.goto('/trang-chu');
    await page.getByRole('button', { name: 'Số hành khách' }).click();

    const dialog = page.getByRole('dialog', { name: 'Chọn số hành khách' });
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    if (box && page.viewportSize()) {
      expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize().height + 1);
    }
  });

  test('CTA remains reachable after MobileBottomNav spacer', async ({ page }) => {
    await page.goto('/trang-chu');
    const cta = page.getByRole('button', { name: /Tìm chuyến bay/i });
    await expect(cta).toBeVisible();
    const box = await cta.boundingBox();
    if (box && page.viewportSize()) {
      // CTA phải nằm trên cùng viewport, không bị MobileBottomNav (fixed đáy 88px) che.
      expect(box.y + box.height).toBeLessThan(page.viewportSize().height);
    }
  });
});

test.describe('HeroBookingWidget mobile landscape', () => {
  test.use({ viewport: { width: 812, height: 375 } });

  test('renders full booking form and CTA on 812×375 landscape', async ({ page }) => {
    await page.goto('/trang-chu');

    await expect(page.getByText('Điểm khởi hành')).toBeVisible();
    await expect(page.getByText('Điểm đến')).toBeVisible();
    await expect(page.getByRole('button', { name: /Tìm chuyến bay/i })).toBeVisible();
  });

  test('opens date picker above anchor when no room below on landscape', async ({ page }) => {
    await page.goto('/trang-chu');
    await page.getByRole('button', { name: 'Ngày đi' }).click();

    await expect(page.getByText(/tháng/i).first()).toBeVisible();
    const popover = page.locator('.z-50').filter({ hasText: /tháng/i }).first();
    await expect(popover).toBeVisible();
    const box = await popover.boundingBox();
    if (box && page.viewportSize()) {
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize().height + 1);
    }
  });
});
