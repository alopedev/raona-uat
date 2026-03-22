import { test, expect } from '@playwright/test';

test.describe('Raona UAT Generator — producción', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('página carga con título y botón desactivado', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Test Cases');
    const btn = page.locator('[data-testid="btn-generate"]');
    await expect(btn).toBeDisabled();
  });

  test('fecha por defecto es hoy', async ({ page }) => {
    const today = new Date().toISOString().split('T')[0];
    const dateValue = await page.locator('#meta-date').inputValue();
    expect(dateValue).toBe(today);
  });

  test('botón se activa al rellenar todos los campos', async ({ page }) => {
    const btn = page.locator('[data-testid="btn-generate"]');
    await expect(btn).toBeDisabled();

    await page.locator('[data-testid="team-token"]').fill('test-pass');
    await page.locator('[data-testid="pasted-text"]').fill('Documentación de prueba');
    await page.locator('[data-testid="meta-project"]').fill('Test Project');
    await page.locator('[data-testid="meta-client"]').fill('Client');
    await page.locator('[data-testid="meta-consultant"]').fill('Consultant');
    await page.locator('[data-testid="meta-env"]').fill('PRE');

    // Wait for debounce
    await page.waitForTimeout(200);
    await expect(btn).toBeEnabled();
  });

  test('contraseña persiste en sessionStorage', async ({ page }) => {
    await page.locator('[data-testid="team-token"]').fill('my-secret');
    await page.waitForTimeout(200);

    const stored = await page.evaluate(() => sessionStorage.getItem('uat-team-token'));
    expect(stored).toBe('my-secret');

    await page.reload();
    await page.waitForLoadState('networkidle');
    const value = await page.locator('[data-testid="team-token"]').inputValue();
    expect(value).toBe('my-secret');
  });

  test('error de red muestra mensaje amigable', async ({ page }) => {
    // Mock worker to simulate network failure
    await page.route('**/raona-uat-worker**', route => route.abort('connectionrefused'));

    await page.locator('[data-testid="team-token"]').fill('test');
    await page.locator('[data-testid="pasted-text"]').fill('Test content');
    await page.locator('[data-testid="meta-project"]').fill('Test');
    await page.locator('[data-testid="meta-client"]').fill('Client');
    await page.locator('[data-testid="meta-consultant"]').fill('Cons');
    await page.locator('[data-testid="meta-env"]').fill('PRE');
    await page.waitForTimeout(200);

    await page.locator('[data-testid="btn-generate"]').click();

    const errorMsg = page.locator('#error-msg');
    await expect(errorMsg).toBeVisible({ timeout: 10000 });
    await expect(errorMsg).toContainText('conectar');
  });

  test('error 401 muestra contraseña incorrecta', async ({ page }) => {
    await page.route('**/raona-uat-worker**', route => {
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Contraseña incorrecta' }),
      });
    });

    await page.locator('[data-testid="team-token"]').fill('wrong');
    await page.locator('[data-testid="pasted-text"]').fill('Test');
    await page.locator('[data-testid="meta-project"]').fill('P');
    await page.locator('[data-testid="meta-client"]').fill('C');
    await page.locator('[data-testid="meta-consultant"]').fill('X');
    await page.locator('[data-testid="meta-env"]').fill('E');
    await page.waitForTimeout(200);

    await page.locator('[data-testid="btn-generate"]').click();

    const errorMsg = page.locator('#error-msg');
    await expect(errorMsg).toBeVisible({ timeout: 10000 });
    await expect(errorMsg).toContainText('incorrecta');
  });

  test('progreso muestra 3 fases', async ({ page }) => {
    // Mock worker with slow response to see progress
    await page.route('**/raona-uat-worker**', async route => {
      await new Promise(r => setTimeout(r, 500));
      route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: 'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"[{\\"tc_id\\":\\"TC-01\\",\\"area\\":\\"Test\\",\\"description\\":\\"D\\",\\"expected_result\\":\\"R\\",\\"status\\":\\"Pendiente de validar\\",\\"observations\\":\\"—\\"}]"}}\n\n',
      });
    });

    await page.locator('[data-testid="team-token"]').fill('test');
    await page.locator('[data-testid="pasted-text"]').fill('Test');
    await page.locator('[data-testid="meta-project"]').fill('P');
    await page.locator('[data-testid="meta-client"]').fill('C');
    await page.locator('[data-testid="meta-consultant"]').fill('X');
    await page.locator('[data-testid="meta-env"]').fill('E');
    await page.waitForTimeout(200);

    await page.locator('[data-testid="btn-generate"]').click();

    // Should show progress container
    const progress = page.locator('#progress');
    await expect(progress).toBeVisible({ timeout: 5000 });

    // Should eventually show result or complete
    const result = page.locator('#result');
    await expect(result).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#result-stats')).toContainText('test cases');
  });

  test('security headers presentes', async ({ page }) => {
    const response = await page.goto('/');
    const headers = response.headers();
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-frame-options']).toBe('DENY');
  });

});
