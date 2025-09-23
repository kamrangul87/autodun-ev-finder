import { test, expect } from '@playwright/test';

test('Map flow: search, fetch, and render', async ({ page }) => {
  await page.goto('/');
  // Find the search input by placeholder
  const input = await page.getByPlaceholder(/postcode|area/i);
  await input.fill('EC1A');
  await input.press('Enter');
  // Wait for API response and heatmap or marker
  await page.waitForResponse((resp) => resp.url().includes('/api/stations') && resp.status() === 200);
  // Wait for either heatmap or marker to appear
  const heatmap = page.locator('.leaflet-heatmap-layer');
  const marker = page.locator('.leaflet-marker-icon');
  await expect(heatmap.or(marker)).toBeVisible({ timeout: 10000 });
  // Zoom in and expect marker
  await page.keyboard.press(']'); // or use map controls if available
  await expect(marker).toBeVisible({ timeout: 10000 });
});
