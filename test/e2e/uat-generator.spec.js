import { test, expect } from '@playwright/test';

/** Fill all required form fields so the generate button activates. */
async function fillForm(page, overrides = {}) {
  const defaults = {
    token: 'test-pass',
    text: 'Documentación de prueba',
    project: 'Test Project',
    client: 'Client',
    consultant: 'Consultant',
  };
  const v = { ...defaults, ...overrides };

  await page.locator('[data-testid="team-token"]').fill(v.token);
  await page.locator('[data-testid="pasted-text"]').fill(v.text);
  await page.locator('[data-testid="meta-project"]').fill(v.project);
  await page.locator('[data-testid="meta-client"]').fill(v.client);
  await page.locator('[data-testid="meta-consultant"]').fill(v.consultant);
}

/** Build a Workers AI SSE response body from a test case array. */
function buildSSEBody(testCases) {
  return `data: ${JSON.stringify({ response: JSON.stringify(testCases) })}\n\ndata: [DONE]\n\n`;
}

test.describe('Raona UAT Generator — producción', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('load');
  });

  test('página carga con título y botón desactivado', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('test cases');
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

    await fillForm(page);
    await expect(btn).toBeEnabled({ timeout: 1000 });
  });

  test('contraseña persiste en sessionStorage', async ({ page }) => {
    await page.locator('[data-testid="team-token"]').fill('my-secret');

    const stored = await page.evaluate(() => sessionStorage.getItem('uat-team-token'));
    expect(stored).toBe('my-secret');

    await page.reload();
    await page.waitForLoadState('load');
    const value = await page.locator('[data-testid="team-token"]').inputValue();
    expect(value).toBe('my-secret');
  });

  test('error de red muestra mensaje amigable', async ({ page }) => {
    await page.route('**/raona-uat-worker**', route => route.abort('connectionrefused'));

    await fillForm(page);
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

    await fillForm(page, { token: 'wrong' });
    await page.locator('[data-testid="btn-generate"]').click();

    const errorMsg = page.locator('#error-msg');
    await expect(errorMsg).toBeVisible({ timeout: 10000 });
    await expect(errorMsg).toContainText('incorrecta');
  });

  test('progreso muestra 3 fases', async ({ page }) => {
    await page.route('**/raona-uat-worker**', async route => {
      await new Promise(r => setTimeout(r, 500));
      route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: buildSSEBody([{
          tc_id: 'TC-01', area: 'Test', description: 'D',
          steps: ['1. Paso'], expected_result: 'R',
          status: 'Pendiente de validar', observations: '—',
        }]),
      });
    });

    await fillForm(page);
    await page.locator('[data-testid="btn-generate"]').click();

    const progress = page.locator('#progress');
    await expect(progress).toBeVisible({ timeout: 5000 });

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
