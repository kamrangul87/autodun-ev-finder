import { test, expect } from '@playwright/test';

test('map renders, popup stable, search fetches results', async ({ page }) => {
  await page.goto('/model1-heatmap', { waitUntil: 'networkidle' });

  const chip = page.getByText(/stations:\s*\d+/i);
  await expect(chip).toBeVisible();
  const n1 = parseInt((await chip.textContent())!.replace(/\D+/g, ''), 10);
  expect(n1).toBeGreaterThan(0);

  const marker = page.locator('path[stroke="#ffffff"]').first();
  await marker.click();
  await expect(page.locator('.leaflet-popup')).toBeVisible();

  const box = page.getByPlaceholder(/postcode or area/i);
  await box.fill('IG4 5HR');
  await page.getByRole('button', { name: /search/i }).click();

  await page.waitForTimeout(1800);
  const chip2 = page.getByText(/stations:\s*\d+/i);
  await expect(chip2).toBeVisible();
  const n2 = parseInt((await chip2.textContent())!.replace(/\D+/g, ''), 10);
  expect(n2).toBeGreaterThan(0);
});
