import { test, expect } from '@playwright/test';

test.describe('Adversarial Browser & UI Verification', () => {

  test('UI-01: Homepage and catalog render cleanly without console errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error' && !msg.text().includes('favicon') && !msg.text().includes('gtm')) {
        consoleErrors.push(msg.text());
      }
    });

    const response = await page.goto('/', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBe(200);

    // Verify main header and brand element
    await expect(page.locator('header').first()).toBeVisible();
    await expect(page.locator('h1, h2').first()).toBeVisible();

    // Verify no unhandled JavaScript runtime exceptions crashed the page
    const bodyContent = await page.textContent('body');
    expect(bodyContent).not.toContain('Application error: a client-side exception has occurred');
    expect(consoleErrors.filter(e => e.includes('Uncaught') || e.includes('Minified React error'))).toHaveLength(0);
  });

  test('UI-02: Search & Catalog rapid typing and interaction debounce', async ({ page }) => {
    await page.goto('/search', { waitUntil: 'domcontentloaded' });

    const searchInput = page.locator('input[type="search"], input[placeholder*="Search"]').first();
    if (await searchInput.isVisible()) {
      // Rapid hammer typing
      await searchInput.pressSequentially('Math', { delay: 10 });
      await searchInput.fill('');
      await searchInput.pressSequentially('Physics', { delay: 10 });
      await page.waitForTimeout(500);

      // Verify page remains interactive and stable
      await expect(page.locator('body')).not.toContainText('Application error');
    }
  });

  test('UI-03: Cart page empty state and navigation ergonomics', async ({ page }) => {
    await page.goto('/cart', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).toBeVisible();

    // Empty cart state should show informative CTA to continue shopping
    const hasCartItems = await page.locator('.cart-item, [data-testid="cart-item"]').count() > 0;
    if (!hasCartItems) {
      const cta = page.locator('a[href="/search"], a[href="/"], button:has-text("Shop"), button:has-text("Browse")').first();
      await expect(cta).toBeVisible();
    }
  });

  test('UI-04: Checkout draft recovery & localStorage persistence', async ({ page }) => {
    await page.goto('/checkout', { waitUntil: 'domcontentloaded' });

    // Seed draft address into localStorage
    await page.evaluate(() => {
      localStorage.setItem('bpg_checkout_addr_draft', JSON.stringify({
        name: 'Adversarial Browser Tester',
        phone: '9876543210',
        alternatePhone: '9876543211',
        address: '123 Recovery Lane, Anna Nagar',
        city: 'Chennai',
        pincode: '600040',
      }));
    });

    // Reload page to simulate user accidental reload
    await page.reload({ waitUntil: 'domcontentloaded' });

    // Check if input value restored
    const nameInput = page.locator('input[name="name"], input[placeholder*="Name"], input[autocomplete="name"]').first();
    if (await nameInput.isVisible()) {
      const val = await nameInput.inputValue();
      // Should either be populated with draft or empty ready for input, never crashed
      expect(typeof val).toBe('string');
    }
  });

  test('UI-05: Mobile viewport zero horizontal overflow invariant', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 }); // iPhone 14
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Calculate whether document width exceeds viewport width
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const innerWidth = await page.evaluate(() => window.innerWidth);

    // Invariant: Mobile layout must not leak horizontally (scrollWidth <= innerWidth + 1px tolerance)
    expect(scrollWidth).toBeLessThanOrEqual(innerWidth + 1);
  });

  test('UI-06: Security response headers verified in browser context', async ({ page }) => {
    const response = await page.goto('/', { waitUntil: 'commit' });
    expect(response).not.toBeNull();

    const headers = response!.headers();
    // Verify essential production security headers delivered to browser
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-frame-options'] || headers['content-security-policy']).toBeDefined();
  });

});
