import { test, expect } from '@playwright/test';

test('app carrega sem tela branca', async ({ page }) => {
  const errors = [];

  page.on('pageerror', error => {
    errors.push(error.message);
  });

  const response = await page.goto('/', {
    waitUntil: 'domcontentloaded',
  });

  expect(response).not.toBeNull();
  expect(response?.ok()).toBeTruthy();

  await expect(page.locator('body')).toBeVisible();

  const bodyText = await page.locator('body').innerText();
  expect(bodyText.trim().length).toBeGreaterThan(0);

  expect(errors).toEqual([]);
});
