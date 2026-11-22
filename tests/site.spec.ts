import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const selectTarget = (page: import('@playwright/test').Page) => page.getByRole('combobox', { name: 'Target / Language' });

test('target changes in place and persists without moving or hiding the prototype', async ({ page }) => {
  await page.goto('/reference/fclose/');
  const select = selectTarget(page);
  expect(await select.locator('option').allTextContents()).toEqual(['68k', 'ARM', 'x32', 'GFA BASIC']);
  await expect(select).toHaveValue('68k');
  const prototype = page.locator('.prm-prototype');
  const rect = await prototype.boundingBox();
  const text = await prototype.textContent();
  await expect(page.getByRole('caption').filter({ hasText: 'Caller stack at GEMDOS trap entry' })).toBeVisible();
  for (const [value, expected] of [['arm', 'svc #1'], ['x32', 'syscall'], ['gfa', 'ErrCode%=Gemdos(&H3E,W:handle%)']]) {
    await select.selectOption(value);
    await expect(page.locator(`[data-target-panel="${value}"]`)).toContainText(expected);
    await expect(page.locator(`[data-target-panel="${value}"]`)).toBeVisible();
    await expect(page.locator('[data-target-panel]:visible')).toHaveCount(1);
    await expect(prototype).toBeVisible();
    await expect(prototype).toHaveText(text!);
    expect(await prototype.boundingBox()).toEqual(rect);
    await expect(page.getByText('All GEMDOS versions.')).toBeVisible();
    await expect(page).toHaveURL('/reference/fclose/');
  }
  await page.reload();
  await expect(select).toHaveValue('gfa');
  await page.getByRole('link', { name: 'Pexec', exact: true }).click();
  await expect(select).toHaveValue('gfa');
  await expect(page.getByText('Address%=Gemdos', { exact: false })).toBeVisible();
  await page.goBack();
  await expect(select).toHaveValue('gfa');
});

test('unsupported, planned and unverified scopes remain distinct from absent language bindings', async ({ page }) => {
  await page.goto('/abi/cuis/');
  const select = selectTarget(page);
  await select.selectOption('arm');
  await expect(page.getByText('The CUIS class is compiled only', { exact: false }).filter({ visible: true })).toBeVisible();
  await expect(page.getByRole('table')).toHaveCount(0);
  await select.selectOption('x32');
  await expect(page.getByText('0x00000103_00000001', { exact: false })).toBeVisible();
  await page.getByRole('link', { name: 'appl_init', exact: true }).click();
  await expect(select).toHaveValue('x32');
  await expect(page.getByText('Planned follow-ups', { exact: false })).toBeVisible();
  await expect(page.getByText('ParaTOS appl_init coverage is unverified', { exact: false })).toBeVisible();
  await select.selectOption('gfa');
  await expect(page.getByText('No documented GFA BASIC binding.')).toBeVisible();
  await expect(page.getByText('All AES versions.')).toBeVisible();
  await expect(page.locator('.prm-prototype')).toBeVisible();
});

test('keyboard selection and unavailable storage work', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new Error('disabled'); } });
  });
  await page.goto('/reference/pexec/');
  const select = selectTarget(page);
  await expect(select).toHaveValue('68k');
  await select.focus();
  await expect(select).toBeFocused();
  await select.press('ArrowDown');
  await select.press('Enter');
  await expect(select).toHaveValue('arm');
  await expect(page.getByText('SVC #1 enters', { exact: false })).toBeVisible();
});

test('invalid stored selection defaults to 68k', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ptos.docs.target', 'invalid'));
  await page.goto('/reference/fclose/');
  await expect(selectTarget(page)).toHaveValue('68k');
});

test('no-script reference retains the 68k baseline', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/reference/fclose/');
  await expect(selectTarget(page)).toBeDisabled();
  await expect(page.locator('.prm-prototype')).toBeVisible();
  await expect(page.getByText('All GEMDOS versions.')).toBeVisible();
  await expect(page.locator('[data-target-panel="68k"]')).toBeVisible();
  await context.close();
});

test('search filters the static index by symbol, subsystem and operation', async ({ page }) => {
  await page.goto('/search/');
  const search = page.getByRole('searchbox');
  await search.fill('fclose');
  await expect(page.getByRole('status')).toContainText('entr');
  await expect(page.getByRole('link', { name: 'Fclose', exact: true })).toBeVisible();
  await search.fill('no such symbol');
  await expect(page.getByRole('status')).toHaveText('0 entries');
});

test('mobile x32 diagram scrolls independently and exposes field definitions', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/abi/cuis/');
  await selectTarget(page).selectOption('x32');
  const diagram = page.getByRole('region', { name: 'Syscall selector in RAX, most significant bit at left' });
  await diagram.focus();
  await expect(diagram).toBeFocused();
  expect(await diagram.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await expect(page.getByRole('rowheader', { name: 'Trap class' })).toBeVisible();
  await page.emulateMedia({ media: 'print' });
  await expect(selectTarget(page)).toBeHidden();
  await expect(diagram).toBeVisible();
  expect(await diagram.evaluate(el => el.scrollWidth === el.clientWidth)).toBe(true);
});

for (const path of ['/reference/fclose/', '/reference/pexec/', '/reference/appl_init/', '/reference/ssystem/', '/abi/cuis/', '/abi/elf-entry/', '/search/']) {
  test(`WCAG A/AA smoke audit at ${path}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(path);
    if (path === '/abi/cuis/') await selectTarget(page).selectOption('x32');
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(results.violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  });
}

test('historical entries retain their availability, source and switchable bindings', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/historical/en/fopen/');
  await expect(page.getByRole('heading', { name: 'Fopen', exact: true })).toBeVisible();
  await expect(page.locator('.prm-prototype')).toContainText('Fopen');
  await expect(page.getByText('All GEMDOS versions.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'gemdos/file/fopen.ui' })).toHaveAttribute('href', /freemint\/tos.hyp\/blob\/20a9cfb4/);
  const select = selectTarget(page);
  await select.selectOption('arm');
  await expect(page.getByText('pTOS ARM support for this entry has not been verified.')).toBeVisible();
  await select.selectOption('gfa');
  await expect(page.getByText('Handle%=Gemdos(&H3D,L:fname%,W:mode%)')).toBeVisible();
  await expect(page.locator('.prm-prototype')).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(results.violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('original German content and UDO aliases remain navigable', async ({ page }) => {
  await page.goto('/historical/de/beispiel-binding-fur-aes-funktionen/#Beispiel-Binding_20AES');
  await expect(page.locator('[id="Beispiel-Binding_20AES"]')).toBeAttached();
  await expect(page.locator('article')).toHaveAttribute('lang', 'de');
  await page.goto('/historical/de/fopen/');
  await expect(page.getByRole('heading', { name: 'C-Deklaration' })).toBeVisible();
  await expect(page.getByText('Verfügbar', { exact: true })).toBeVisible();
});

test('the PR #903 notes distinguish native staged execution, fork and PROCESS services', async ({ page }) => {
  await page.goto('/reference/pexec/');
  const select = selectTarget(page);
  await select.selectOption('arm');
  await expect(page.getByText('On MMU ARM, modes 3, 4, 5, 6, 7, 104 and 106 are unsupported.', { exact: false })).toBeVisible();
  await expect(page.getByRole('row', { name: /200 .*same PROCESS/ })).toBeVisible();
  await page.goto('/reference/pclone/');
  await expect(page.getByRole('link', { name: 'pTOS PR #903' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'ParaTOS PR #27' })).toBeVisible();
  await expect(page.getByRole('row', { name: /child_pid/ })).toContainText('+28');
  await expect(page.getByText(/pTOS 1\.4/)).toHaveCount(0);
  await page.goto('/reference/s-procexec/');
  await select.selectOption('x32');
  await expect(page.getByRole('row', { name: /completion.*SNAPSHOT/ })).toContainText('+32');
  await expect(page.locator('.prm-prototype')).toBeVisible();
});

test('search covers historical sections outside the function index', async ({ page }) => {
  await page.goto('/search/');
  await page.getByRole('searchbox').fill('argv procedure');
  await expect(page.getByRole('link', { name: 'ARGV procedure', exact: true })).toBeVisible();
});
