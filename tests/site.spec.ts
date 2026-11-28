import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const selectTarget = (page: import('@playwright/test').Page) => page.getByRole('combobox', { name: 'Target / Language' });
const revisions = JSON.parse(readFileSync(new URL('../src/data/sources.json', import.meta.url), 'utf8'));
const ptosSourceTree = `https://github.com/${revisions.ptos.repo}/tree/${revisions.ptos.revision}`;
const cuisOverview = '/subsystems/cuis/';
const cuisExample = '/reference/cuis-session-query/';

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

test('the calling convention tabs switch the same persisted target as the header menu', async ({ page }) => {
  await page.goto('/reference/fclose/');
  const select = selectTarget(page);
  const tabs = page.getByRole('tablist', { name: 'Calling Convention' });
  await expect(tabs.getByRole('tab')).toHaveText(['68k', 'ARM', 'x32', 'GFA BASIC']);
  await expect(tabs.getByRole('tab', { selected: true })).toHaveText('68k');
  await tabs.getByRole('tab', { name: 'x32' }).click();
  await expect(select).toHaveValue('x32');
  await expect(page.getByRole('tabpanel', { name: 'x32' })).toBeVisible();
  await expect(tabs.getByRole('tab', { selected: true })).toHaveText('x32');
  await page.keyboard.press('ArrowRight');
  await expect(tabs.getByRole('tab', { name: 'GFA BASIC' })).toBeFocused();
  await expect(select).toHaveValue('gfa');
  await expect(page).toHaveURL('/reference/fclose/');
  await page.reload();
  await expect(tabs.getByRole('tab', { selected: true })).toHaveText('GFA BASIC');
  await select.selectOption('arm');
  await expect(tabs.getByRole('tab', { selected: true })).toHaveText('ARM');
  await expect(tabs.getByRole('tab', { name: '68k' })).toHaveAttribute('tabindex', '-1');
  await expect(page.getByRole('tabpanel', { name: 'ARM' })).toBeVisible();
  await expect(page.locator('.prm-prototype')).toBeVisible();
  await page.emulateMedia({ media: 'print' });
  await expect(tabs).toBeHidden();
  await expect(page.locator('[data-target-caption]')).toHaveText('ARM');
});

test('unsupported, planned and unverified scopes remain distinct from absent language bindings', async ({ page }) => {
  await page.goto(cuisOverview);
  const select = selectTarget(page);
  const m68k = page.getByRole('tabpanel', { name: '68k' });
  await expect(m68k).toContainText('Planned');
  await expect(m68k).toContainText('TRAP #2');
  await expect(m68k.getByRole('rowheader')).toHaveText(['D0', 'D1']);
  await select.selectOption('arm');
  const arm = page.getByRole('tabpanel', { name: 'ARM' });
  await expect(arm).toContainText('CUIS is currently implemented only on x32');
  await expect(arm).toContainText('SVC #21');
  await expect(arm.getByRole('rowheader')).toHaveText('R0');
  await expect(arm.getByRole('link', { name: /pTOS #898/ })).toHaveAttribute('href', /\/pTOS\/issues\/898/);
  await select.selectOption('x32');
  const selector = page.locator('.prm-bit-fields');
  await expect(selector.locator('code')).toHaveText(['0x103', '0x1']);
  await page.getByRole('link', { name: 'appl_init', exact: true }).click();
  await expect(select).toHaveValue('x32');
  await expect(page.getByText('Planned follow-ups', { exact: false })).toBeVisible();
  await expect(page.getByText('ParaTOS appl_init coverage is unverified', { exact: false })).toBeVisible();
  await select.selectOption('gfa');
  await expect(page.locator('[data-target-panel="gfa"] code').filter({ hasText: /^APPL_INIT\(\)$/ })).toBeVisible();
  await expect(page.getByText('All AES versions.')).toBeVisible();
  await page.goto(cuisOverview);
  await expect(page.getByText('No documented GFA BASIC binding.')).toBeVisible();
  await page.goto('/reference/appl_init/');
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
  await expect(page.getByRole('tabpanel', { name: 'ARM' })).toContainText('The raw trap returns EINVFN');
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
  await search.fill('cuis_session_query');
  await expect(page.getByRole('link', { name: 'CUIS_SESSION_QUERY', exact: true })).toHaveAttribute('href', cuisExample);
  await search.fill('no such symbol');
  await expect(page.getByRole('status')).toHaveText('0 entries');
});

test('mobile x32 diagram shows both selector words and their bit boundaries', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(cuisExample);
  await selectTarget(page).selectOption('x32');
  const diagram = page.getByRole('region', { name: 'Syscall selector in RAX, most significant bit at left' });
  await diagram.focus();
  await expect(diagram).toBeFocused();
  const markers = diagram.locator('.prm-bit-endpoints > span > span');
  await expect(markers).toHaveText(['63', '32', '0']);
  expect(await diagram.evaluate(el => el.scrollWidth === el.clientWidth)).toBe(true);
  const middle = (await markers.nth(1).boundingBox())!;
  const rightField = (await diagram.locator('.prm-bit-field').nth(1).boundingBox())!;
  expect(Math.abs(middle.x + middle.width / 2 - rightField.x)).toBeLessThan(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await expect(page.getByRole('rowheader', { name: 'Trap class' })).toBeVisible();
  await page.emulateMedia({ media: 'print' });
  await expect(selectTarget(page)).toBeHidden();
  await expect(diagram).toBeVisible();
  expect(await diagram.evaluate(el => el.scrollWidth === el.clientWidth)).toBe(true);
});

for (const path of ['/', '/reference/fclose/', '/reference/pexec/', '/reference/pexecve/', '/reference/fpoll-time64/', '/reference/appl_init/', '/reference/ssystem/', cuisOverview, '/reference/cuis-endpoint-barrier/', '/os-variants/ptos/elf-entry/', '/os-variants/ptos/desktop-and-console/', '/subsystems/gemdos/', '/subsystems/gemdos/legacy-extensions/', '/conventions/protocols/argv-procedure/', '/search/', '/gfa-basic/']) {
  test(`WCAG A/AA smoke audit at ${path}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(path);
    if (path === cuisOverview || path.startsWith('/reference/cuis-')) await selectTarget(page).selectOption('x32');
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(results.violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  });
}

test('imported entries retain their availability and switchable bindings', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/historical/en/fopen/');
  await expect(page.getByRole('heading', { name: 'Fopen', exact: true })).toBeVisible();
  await expect(page.locator('.prm-prototype')).toContainText('Fopen');
  await expect(page.getByText('All GEMDOS versions.')).toBeVisible();
  await expect(page.locator('.ptos-availability')).toHaveCount(0);
  await expect(page.getByRole('contentinfo').getByRole('link', { name: 'Sources and licensing' })).toHaveAttribute('href', '/sources/');
  const select = selectTarget(page);
  await select.selectOption('arm');
  await expect(page.locator('[data-target-panel="arm"]')).toContainText('SVC #1');
  await expect(page.locator('[data-target-panel="arm"]')).toContainText('0x3D');
  await select.selectOption('x32');
  await expect(page.locator('[data-target-panel="x32"] .prm-bit-fields code')).toHaveText(['0x1', '0x3D']);
  await select.selectOption('gfa');
  await expect(page.getByText('Handle%=Gemdos(&H3D,L:fname%,W:mode%)')).toBeVisible();
  await expect(page.locator('.prm-prototype')).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(results.violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('historical availability reports pTOS exceptions and build requirements across targets', async ({ page }) => {
  const availability = page.locator('.prm-fact-row').filter({ has: page.locator('dt').getByText(/^(Availability|Verfügbar)$/) });
  await page.goto('/historical/en/supexec/');
  await expect(availability).toContainText('All TOS versions.');
  await expect(availability.getByRole('listitem').filter({ hasText: '68k' })).toContainText('Requires a single address space.');
  await expect(availability.getByRole('listitem').filter({ hasText: 'ARM, x32' })).toContainText('Not implemented');
  await selectTarget(page).selectOption('gfa');
  await expect(availability).toBeVisible();
  await expect(availability.getByRole('link', { name: 'master snapshot' })).toHaveAttribute('href', ptosSourceTree);

  const expected = [
    ['/historical/en/dgetcwd/', '68k, ARM, x32', 'Implemented', 'CONF_WITH_KPROC'],
    ['/historical/en/fpipe/', '68k, ARM, x32', 'Not implemented'],
    ['/historical/de/getbpb/', '68k, ARM', 'Implementiert', 'Nur ohne getrennte Adressräume'],
    ['/historical/en/graf-mouse/', 'x32', 'Experimental', 'CONF_WITH_LIBAES'],
    ['/historical/en/v-opnvwk/', 'x32', 'Implemented', 'CONF_WITH_X32_VDI'],
    ['/historical/en/seedfill/', '68k', 'Implemented', 'CONF_WITH_LINEA'],
    ['/historical/en/xhreserve/', '68k', 'Not implemented', 'A chained XHDI driver'],
    ['/historical/de/pmem-size/', '68k', 'Ungeprüft', 'externen PMMU-Funktionshandler'],
  ] as const;
  for (const [path, targets, status, limitation] of expected) {
    await page.goto(path);
    const row = availability.locator('.availability-targets li').filter({ has: page.getByText(targets, { exact: true }) });
    await expect(row).toContainText(status);
    if (limitation) await expect(row).toContainText(limitation);
  }
});

test('Pfork and Pvfork combine the historical and native reference', async ({ page }) => {
  for (const [name, decimal, hex] of [['Pfork', '283', '11B'], ['Pvfork', '275', '113']]) {
    const slug = name.toLowerCase();
    for (const language of ['en', 'de']) {
      await page.goto(`/historical/${language}/${slug}/#${name}`, { waitUntil: 'commit' });
      await expect(page).toHaveURL(`/reference/${slug}/#${name}`);
      await expect(page.locator(`#${name}`)).toBeAttached();
    }
    const availability = page.locator('.prm-fact-row').filter({ has: page.getByText('Availability', { exact: true }) });
    await expect(availability).toContainText('MultiTOS integrated MiNT version 1.04.');
    await expect(availability).toContainText('CONF_WITH_FORK');
    await expect(availability).toContainText('eager allocation or demand paging');
    await expect(availability).toContainText('ROM-window');
    await expect(availability).toContainText('ParaTOS');
    const history = page.getByRole('region', { name: 'Historical MiNT reference' });
    await expect(history).toContainText(`The function ${name} creates a copy of the current process.`);
    await expect(history).toContainText(/Not enough memory available to create (the|a) new process/);
    await expect(page.getByText('Original tos.hyp availability and bindings')).toHaveCount(0);
    await selectTarget(page).selectOption('68k');
    await expect(page.locator('[data-target-panel="68k"]')).toContainText(`#${decimal},-(sp)`);
    await selectTarget(page).selectOption('x32');
    await expect(page.locator('[data-target-panel="x32"] .prm-bit-fields code')).toHaveText(['0x1', `0x${hex}`]);
    await selectTarget(page).selectOption('gfa');
    await expect(page.locator('[data-target-panel="gfa"]')).toContainText(`Result%=GEMDOS(&H${hex})`);
    await expect(page.locator('.prm-prototype')).toBeVisible();
  }
});

test('GEMDOS format and launch topics document ELF and render the TPA layout as a table', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const format = '/subsystems/gemdos/the-program-format/';
  const launch = '/subsystems/gemdos/program-launch-and-tpa/';
  const main = page.getByRole('main');
  await page.goto(format);
  await expect(main.locator('p').first()).toContainText('On m68k, pTOS supports ELF executables and legacy GEMDOS PRG programs');
  await expect(main.locator('p').first()).toContainText('ARM and x32, pTOS can run compatible 68k PRG binaries through ParaTOS');
  const formats = main.getByRole('navigation', { name: 'Program formats' });
  await formats.getByRole('link', { name: 'ELF executables' }).click();
  await expect(page).toHaveURL(`${format}#elf-executables`);
  await expect(main.getByRole('heading', { name: 'ELF executables in pTOS' })).toBeInViewport();
  await formats.getByRole('link', { name: 'Classic GEMDOS PRG format' }).click();
  await expect(page).toHaveURL(`${format}#prg-format`);
  await expect(main.getByRole('heading', { name: 'Classic GEMDOS PRG format' })).toBeInViewport();
  const machines = page.getByRole('table', { name: 'ELF32 class and machine by target' });
  for (const [cpu, machine] of [['68k', 'EM_68K'], ['ARM', 'EM_ARM'], ['x32', 'EM_X86_64']]) {
    await expect(machines.getByRole('row').filter({ hasText: cpu })).toContainText(machine);
  }
  await expect(page.getByRole('rowheader', { name: 'PT_INTERP' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'pTOS startup note' })).toHaveAttribute('href', '/os-variants/ptos/elf-entry/#entry-note');
  await expect(page.getByRole('table', { name: 'Digital Research symbol types' }).getByRole('columnheader', { name: 'Value' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.getByRole('link', { name: 'Program launch and TPA', exact: true }).click();
  await expect(page).toHaveURL(`${launch}#elf-startup`);
  await expect(main.locator('p').first()).toContainText('Use Pexecve for native vector-based launch');
  await expect(main.locator('p').first()).toContainText('ARM and x32, pTOS can launch compatible 68k PRG binaries through ParaTOS');
  const startup = main.getByRole('navigation', { name: 'Program startup' });
  await startup.getByRole('link', { name: 'Classic GEMDOS PRG startup' }).click();
  await expect(page).toHaveURL(`${launch}#prg-startup`);
  await expect(main.getByRole('heading', { name: 'Classic GEMDOS PRG startup' })).toBeInViewport();
  await startup.getByRole('link', { name: 'ELF startup and memory' }).click();
  await expect(page).toHaveURL(`${launch}#elf-startup`);
  await expect(main.getByRole('heading', { name: 'ELF startup and memory in pTOS' })).toBeInViewport();
  await expect(page.getByRole('row', { name: /Static ELF, single address space/ })).toContainText('256 KiB');
  await expect(page.getByRole('row', { name: /Static ELF, single address space/ })).toContainText('CONF_WITH_M68K_SHARED_EXEC');
  await expect(page.getByRole('row', { name: /Static ELF, private address space/ })).toContainText('private pages');
  await expect(page.getByRole('row', { name: /ELF with PT_INTERP/ })).toContainText('auxiliary vector');
  const tpa = page.getByRole('table', { name: 'Classic PRG TPA after Mshrink' });
  expect(await tpa.getByRole('rowheader').allTextContents()).toEqual([
    'Stack', 'Uninitialized data (BSS)', 'Initialized data (DATA)', 'Program code (TEXT)', 'Basepage',
  ]);
  await expect(tpa.getByRole('row', { name: /Basepage/ })).toContainText('p_lowtpa');
  await expect(page.locator('img[src*="tpa"]')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(results.violations).toEqual([]);
});

test('Syield combines pTOS and historical documentation under GEMDOS system functions', async ({ page }) => {
  for (const language of ['en', 'de']) {
    await page.goto(`/historical/${language}/syield/#Syield`, { waitUntil: 'commit' });
    await expect(page).toHaveURL('/reference/syield/#Syield');
    await expect(page.locator('#Syield')).toBeAttached();
  }
  const availability = page.locator('.prm-fact-row').filter({ has: page.getByText('Availability', { exact: true }) });
  await expect(availability).toContainText('In MagiC as of Version 3.0, and when the MiNT cookie is present.');
  await expect(availability).toContainText('CONF_WITH_MULTITHREADING');
  await expect(page.getByText(/CONF_WITH_PREEMPTION defaults on/)).toBeVisible();
  await expect(availability).toContainText('The POSIX backend leaves Syield unimplemented.');
  await expect(page.locator('.prm-prototype')).toHaveText('int Syield(void);');

  const history = page.getByRole('region', { name: 'Historical MiNT reference' });
  await expect(history).toContainText('void Syield ( void );');
  await expect(history).toContainText('will be ignored in the Auto folder');
  await expect(history).toContainText('The function does not return a result.');
  await expect(page.getByText('Original tos.hyp availability and bindings')).toHaveCount(0);
  await expect(page.locator('[data-target-panel="68k"]')).toContainText('#255,-(sp)');
  await page.getByRole('tab', { name: 'x32' }).click();
  await expect(page.locator('[data-target-panel="x32"] .prm-bit-fields code')).toHaveText(['0x1', '0xFF']);
  await page.getByRole('tab', { name: 'GFA BASIC' }).click();
  await expect(page.locator('[data-target-panel="gfa"]')).toContainText('Result%=GEMDOS(&HFF)');
  await expect(page.getByRole('link', { name: 'Pause', exact: true })).toHaveAttribute('href', '/historical/en/pause/');
  await expect(page.getByRole('link', { name: 'Fselect', exact: true })).toHaveAttribute('href', '/historical/en/fselect/');
  await expect(page.getByRole('link', { name: 'Native yield implementation' })).toHaveAttribute('href', /bdos\/native_sched\.c$/);

  await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'System functions' }).click();
  await expect(page).toHaveURL('/subsystems/gemdos/system-functions/');
  await expect(page.getByRole('link', { name: 'Syield', exact: true })).toHaveAttribute('href', '/reference/syield/');
});

test('Ssystem keeps the MiNT modes and pTOS differences in one table', async ({ page }) => {
  await page.goto('/reference/ssystem/');
  const table = page.getByRole('table', { name: 'Ssystem mode reference' });
  const mode = (name: string) => table.locator(`:scope > tbody > tr[id="${name}"]`);
  const ptos = (name: string) => mode(name).locator(':scope > td').last();
  await expect(table.locator(':scope > thead').getByRole('columnheader')).toHaveText(['Mode', 'MiNT (historical)', 'pTOS']);
  const historicalTables = page.locator('table.ssystem-mode-table table').filter({ has: page.locator('thead') });
  expect(await historicalTables.count()).toBeGreaterThanOrEqual(6);
  for (const nested of await historicalTables.all()) {
    await expect(nested.locator(':scope > tbody > tr').first()).not.toHaveText(/^\s*$/);
  }
  await expect(table.locator(':scope > tbody').first().locator(':scope > tr[id]')).toHaveCount(41);
  await expect(table.locator(':scope > tbody').last().locator(':scope > tr[id]')).toHaveCount(8);
  await expect(table.locator('span[id^="native-S_"]')).toHaveCount(26);
  await expect(mode('S_INQUIRE')).toContainText('-1 (0xFFFF)');
  await expect(mode('S_OSNAME').locator(':scope > td').first()).toContainText("0x4d694e54 ('MiNT')");
  await expect(ptos('S_OSNAME')).toContainText('0x70544F53');
  await expect(ptos('S_OSHEADER')).toHaveText('Unimplemented. Returns EINVFN.');
  await expect(ptos('S_CLOCKUTC')).toHaveText('Planned. Returns EINVFN.');
  await expect(ptos('S_GETCOOKIE')).toContainText('one-based slot');
  await expect(ptos('S_SETLVAL')).toContainText('EACCDN');
  await expect(ptos('S_PROCEXEC')).toContainText('CONF_WITH_PROCESS_EXEC_TEST');
  await expect(ptos('S_PROCEXEC')).toContainText('CONF_WITH_MULTITHREADING');
  await expect(ptos('S_PROCEXEC').getByRole('link', { name: 'Configuration source' })).toHaveAttribute('href',
    `https://github.com/${revisions.ptos.repo}/blob/${revisions.ptos.revision}/bdos/Kconfig`);
  await expect(ptos('S_DESKINFO')).toContainText('16-byte struct desk_info');
  await expect(ptos('S_DESKSET')).toContainText('item 2 sets the AES background');
  await expect(ptos('S_DESKSET')).toContainText('User processes on address-space builds receive EACCDN');
  await expect(mode('S_MEMINFO').getByRole('link', { name: 'S_MEMINFO', exact: true })).toHaveAttribute('href', '/reference/s-meminfo/');
  await expect(page.getByRole('heading', { name: 'Historical MiNT notes' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'pTOS Mode Selectors' })).toHaveCount(0);
  await expect(page.getByText("Available when a 'MiNT' cookie", { exact: false })).toBeVisible();
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://docs.ptos.dev/reference/ssystem/');

  const select = selectTarget(page);
  await select.selectOption('arm');
  await expect(page.locator('[data-target-panel="arm"]')).toContainText('arg1 · mode-specific');
  await select.selectOption('gfa');
  await expect(page.locator('[data-target-panel="gfa"]')).toContainText('GEMDOS(&H154,W:Arg1%,L:Arg2%,L:Arg3%)');
  await expect(page.locator('.prm-prototype')).toBeVisible();

  for (const language of ['en', 'de']) {
    await page.goto('/historical/' + language + '/ssystem/#S_OSHEADER', { waitUntil: 'commit' });
    await expect(page).toHaveURL('/reference/ssystem/#S_OSHEADER');
    await expect(mode('S_OSHEADER')).toBeAttached();
  }
  await page.goto('/reference/ssystem/#native-S_GETCOOKIE');
  await expect(mode('S_GETCOOKIE').locator('#native-S_GETCOOKIE')).toBeAttached();
  await expect(mode('PEXECVE_GUEST_SSYSTEM')).toHaveCount(0);

  for (const [slug, name] of [
    ['s-deskinfo', 'S_DESKINFO'],
    ['s-deskset', 'S_DESKSET'],
  ]) {
    await page.goto(`/reference/${slug}/#calling-convention`, { waitUntil: 'commit' });
    await expect(page).toHaveURL(`/reference/ssystem/#${name}`);
    await expect(mode(name)).toBeAttached();
  }
  for (const path of ['/subsystems/gemdos/system-functions/', '/functions/']) {
    await page.goto(path);
    await expect(page.getByRole('link', { name: 'Ssystem', exact: true })).toHaveAttribute('href', '/reference/ssystem/');
    await expect(page.getByRole('link', { name: /^(S_DESKINFO|S_DESKSET|PEXECVE_GUEST_SSYSTEM)$/ })).toHaveCount(0);
  }
});

test('BIOS system variables show separate types and link the six Ssystem access modes', async ({ page }) => {
  const path = '/subsystems/bios/the-system-variables/';
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(path);
  const table = page.getByRole('table', { name: 'TOS system variables' });
  await expect(table.locator(':scope > thead').getByRole('columnheader')).toHaveText(['Variable', 'Address', 'Type', 'Description']);
  await expect(table.locator(':scope > tbody > tr')).toHaveCount(75);
  const boot = table.locator(':scope > tbody > tr').filter({ has: page.locator('#UDO__bootdev') });
  await expect(boot.locator(':scope > td').first()).toHaveText('0x446');
  await expect(boot.locator(':scope > td').nth(1)).toHaveText('WORD');
  const themd = table.locator(':scope > tbody > tr').filter({ has: page.locator('#themd') });
  await expect(themd.locator(':scope > td').nth(1).getByRole('link', { name: 'MD' })).toHaveAttribute('href', '/historical/en/md/');
  await expect(page.locator('#ssystem-access')).toBeVisible();
  await expect(page.locator('pre.prm-code')).toContainText('Ssystem(S_GETWVAL, 0x0446L, 0L)');
  await expect(page.getByText('Ssystem(S_INQUIRE, 0L, 0L)', { exact: true })).toBeVisible();
  const scrollRegion = page.getByRole('region', { name: 'TOS system variables table' });
  expect(await scrollRegion.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);

  const accessModes = page.getByRole('table', { name: 'Ssystem modes by variable type' });
  const modes = ['S_GETLVAL', 'S_GETWVAL', 'S_GETBVAL', 'S_SETLVAL', 'S_SETWVAL', 'S_SETBVAL'];
  for (const mode of modes) {
    await expect(accessModes.getByRole('link', { name: mode })).toHaveAttribute('href', `/reference/ssystem/#${mode}`);
  }
  await accessModes.getByRole('link', { name: 'S_GETWVAL' }).click();
  await expect(page).toHaveURL('/reference/ssystem/#S_GETWVAL');
  for (const mode of modes) {
    await expect(page.locator(`tr[id="${mode}"]`).getByRole('link', { name: 'BIOS system variables' }))
      .toHaveAttribute('href', path + '#ssystem-access');
  }
});

test('Cookie jar documents Ssystem lookup and links the known cookie keys from both pages', async ({ page }) => {
  const cookieJar = '/subsystems/bios/cookie-jar/';
  const keyList = '/historical/en/cookie-and-xbra-list/';
  const keyListLabel = 'Known cookie keys (Cookie and XBRA list)';
  await page.goto(cookieJar);
  const guide = page.getByRole('region', { name: 'Access with Ssystem' });
  await expect(guide).toContainText('pTOS builds with CONF_WITH_SSYSTEM');
  await expect(guide).toContainText('MiNT or FreeMiNT');
  await expect(guide.locator('pre')).toContainText('Ssystem(S_GETCOOKIE, 0x5F435055L, (long)value)');
  await expect(page.getByRole('heading', { name: 'Classic TOS cookie jar' })).toBeVisible();
  await expect(guide.getByRole('link', { name: keyListLabel })).toHaveAttribute('href', keyList);

  await guide.getByRole('link', { name: 'Ssystem(S_GETCOOKIE)', exact: true }).click();
  await expect(page).toHaveURL('/reference/ssystem/#S_GETCOOKIE');
  const mode = page.locator('tr#S_GETCOOKIE');
  await expect(mode.getByRole('link', { name: 'Cookie jar access guide' })).toHaveAttribute('href', cookieJar + '#ssystem-access');
  await mode.getByRole('link', { name: keyListLabel }).click();
  await expect(page).toHaveURL(keyList);
  await expect(page.getByRole('heading', { name: 'Cookie and XBRA list', exact: true })).toBeVisible();
});

test('chapter navigation follows tos.hyp and places extensions with related calls', async ({ page }) => {
  await page.goto('/subsystems/');
  await page.getByRole('link', { name: 'GEMDOS', exact: true }).click();
  await page.getByRole('link', { name: 'Process functions', exact: true }).click();
  await expect(page).toHaveURL('/subsystems/gemdos/process-functions/');
  await expect(page.getByRole('link', { name: 'Pexec', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Pclone', exact: true }).click();
  const breadcrumb = page.getByRole('navigation', { name: 'Breadcrumb' });
  await expect(breadcrumb.getByRole('listitem')).toHaveText(['Subsystems', 'GEMDOS', 'Process functions', 'Pclone']);
  await page.goto('/subsystems/gemdos/memory-management/');
  await expect(page.getByRole('link', { name: 'Mmap', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Pclone', exact: true })).toHaveCount(0);
});

test('CUIS is a top-level subsystem with a cross-reference from AES', async ({ page }) => {
  await page.goto('/subsystems/');
  await page.getByRole('link', { name: 'CUIS', exact: true }).click();
  await expect(page).toHaveURL(cuisOverview);
  const breadcrumb = page.getByRole('navigation', { name: 'Breadcrumb' });
  await expect(breadcrumb.getByRole('listitem')).toHaveText(['Subsystems', 'CUIS']);
  await expect(page.getByRole('main')).toContainText('Core User Interface Services');
  await expect(page.getByRole('complementary', { name: 'CUIS development status' })).toContainText('Its API and syscall ABI may change.');
  await page.getByRole('link', { name: 'Sessions and discovery' }).click();
  await expect(page).toHaveURL(`${cuisOverview}sessions/`);
  await expect(breadcrumb.getByRole('listitem')).toHaveText(['Subsystems', 'CUIS', 'Sessions and discovery']);
  await page.getByRole('link', { name: 'CUIS_SESSION_QUERY', exact: true }).click();
  await expect(page).toHaveURL(cuisExample);
  await expect(breadcrumb.getByRole('listitem')).toHaveText(['Subsystems', 'CUIS', 'Sessions and discovery', 'CUIS_SESSION_QUERY']);
  await page.goto('/subsystems/aes/');
  await page.getByRole('main').locator('p').first().getByRole('link', { name: 'CUIS', exact: true }).click();
  await expect(page).toHaveURL(cuisOverview);
  await page.getByRole('main').getByRole('link', { name: 'AES', exact: true }).click();
  await expect(page).toHaveURL('/subsystems/aes/');
});

test('previous CUIS overview and call-group URLs redirect to the subsystem', async ({ page }) => {
  for (const oldPath of ['/abi/cuis/', '/subsystems/aes/cuis/']) {
    await page.goto(oldPath);
    await expect(page).toHaveURL(cuisOverview);
  }
  const groups = await page.getByRole('main').locator('.manual-index a').evaluateAll(links => links.map(link => link.getAttribute('href')!));
  expect(groups).toHaveLength(7);
  for (const group of groups) {
    await page.goto(group.replace('/subsystems/cuis/', '/subsystems/aes/cuis/'));
    await expect(page).toHaveURL(group);
  }
});

test('all CUIS call groups list distinct references with architecture-specific details', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(cuisOverview);
  const groupLinks = await page.getByRole('main').locator('.manual-index a').evaluateAll(links => links.map(link => link.getAttribute('href')!));
  expect(groupLinks).toHaveLength(7);
  const callLinks: string[] = [];
  for (const group of groupLinks) {
    await page.goto(group);
    callLinks.push(...await page.getByRole('main').locator('.manual-index a').evaluateAll(links => links.map(link => link.getAttribute('href')!)));
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  }
  expect(callLinks).toHaveLength(64);
  expect(new Set(callLinks).size).toBe(64);
  for (const href of callLinks) {
    const symbol = href.split('/')[2].replaceAll('-', '_');
    const response = await page.request.get(href);
    expect(response.ok()).toBe(true);
    const html = await response.text();
    const declaration = html.match(/<pre class="prm-prototype"[^>]*><code[^>]*>([\s\S]*?)<\/code>/)?.[1];
    expect(declaration, href).toMatch(new RegExp(`^LONG ${symbol}\\(`));
  }
  await page.goto('/reference/cuis-launch-attach/');
  const prototype = page.locator('.prm-prototype');
  const launchAttach = `LONG cuis_launch_attach(
    LONG session,
    ULONG authorization,
    const void *path_or_request,
    UQUAD tail_or_size,
    const char *environment,
    const char *directory
);`;
  for (const target of ['68k', 'arm', 'x32', 'gfa']) {
    await selectTarget(page).selectOption(target);
    await expect(prototype).toBeVisible();
    await expect(prototype).toHaveText(launchAttach);
    await expect(page).toHaveURL('/reference/cuis-launch-attach/');
  }
  await selectTarget(page).selectOption('x32');
  const x32 = page.getByRole('tabpanel', { name: 'x32' });
  await expect(x32.getByRole('table', { name: 'Register assignments' }).getByRole('rowheader')).toHaveText(['RAX', 'RDI', 'RSI', 'RDX', 'R10', 'R8', 'R9']);
  await expect(x32.locator('.prm-bit-fields code')).toHaveText(['0x103', '0x5D']);
  await expect(page.getByText('CUIS_LAUNCH_VECTORS (4)', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'PROCESS_EXEC_REQUEST layout' })).toHaveAttribute('href', '/reference/s-procexec/');
});

test('CUIS prototypes retain typed pointers and register order where the ABI requires padding', async ({ page }) => {
  await page.goto('/reference/cuis-stream-pending/');
  const prototype = page.locator('.prm-prototype');
  await expect(prototype).toHaveText('LONG cuis_stream_pending(LONG session);');
  await selectTarget(page).selectOption('x32');
  const x32 = page.getByRole('tabpanel', { name: 'x32' });
  await expect(x32).toContainText('Set unused argument registers to zero.');
  await expect(x32.getByRole('table', { name: 'Register assignments' }).getByRole('rowheader')).toHaveText(['RAX', 'RDI']);

  await page.goto('/reference/cuis-entry-publish/');
  await expect(prototype).toHaveText(`LONG cuis_entry_publish(
    LONG session,
    ULONG slot,
    ULONG reserved,
    const void *address,
    ULONG bytes
);`);
  await expect(x32.getByRole('row', { name: 'RDX reserved' })).toBeVisible();
  await expect(x32.getByRole('row', { name: 'R10 address' })).toBeVisible();

  await page.goto('/reference/cuis-stream-batch/');
  await expect(prototype).toHaveText(`LONG cuis_stream_batch(
    LONG session,
    UQUAD command,
    UQUAD a,
    UQUAD b,
    UQUAD c,
    UQUAD d
);`);
});

test('imported function breadcrumbs return to the manual chapters', async ({ page }) => {
  await page.goto('/subsystems/bios/');
  await page.getByRole('link', { name: 'Bconin', exact: true }).click();
  const breadcrumb = page.getByRole('navigation', { name: 'Breadcrumb' });
  await expect(breadcrumb.getByRole('listitem')).toHaveText(['Subsystems', 'BIOS', 'Bconin']);
  await breadcrumb.getByRole('link', { name: 'BIOS', exact: true }).click();
  await expect(page).toHaveURL('/subsystems/bios/');
  await page.goto('/historical/de/bconin/');
  await expect(breadcrumb.getByRole('listitem')).toHaveText(['Subsystems', 'BIOS', 'Bconin']);

  for (const [path, chapter, section] of [
    ['/historical/en/dmawrite/', 'XBIOS', 'Drive functions'],
    ['/historical/de/dmawrite/', 'XBIOS', 'Drive functions'],
    ['/historical/en/fopen/', 'GEMDOS', 'File functions'],
    ['/historical/de/fopen/', 'GEMDOS', 'File functions'],
    ['/historical/en/v-opnwk/', 'VDI', 'Control functions'],
    ['/historical/en/xhgetversion/', 'XHDI', 'XHDI functions'],
  ]) {
    await page.goto(path);
    await expect(breadcrumb.getByRole('link').nth(0)).toHaveText('Subsystems');
    await expect(breadcrumb.getByRole('link').nth(1)).toHaveText(chapter);
    await expect(breadcrumb.getByRole('link').nth(2)).toHaveText(section);
    await expect(breadcrumb.getByRole('link', { name: 'tos.hyp', exact: true })).toHaveCount(0);
  }
});

test('the homepage introduces the pTOS manual and directs readers to its attribution', async ({ page }) => {
  await page.goto('/');
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { level: 1 })).toHaveText(/pTOS Programmer’s\s*Reference Manual/);
  await expect(main).toContainText('reference for pTOS development');
  await expect(main).toContainText('interfaces from FreeMiNT and MagiC');
  await expect(main).toContainText('external references that the pTOS team has edited and extended');
  await expect(main).toContainText('The pTOS team is responsible for any errors or omissions');
  await expect(main.locator('.manual-index')).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Manual' }).getByRole('link')).toHaveText([
    'Subsystems', 'OS variants and extensions', 'Conventions and misc.', 'GFA BASIC', 'Search',
  ]);
  await main.getByRole('link', { name: 'Sources and licensing', exact: true }).click();
  await expect(page).toHaveURL('/sources/');
  await expect(main.getByRole('link', { name: 'Upstream foreword and licensing notice' })).toHaveAttribute('href', '/source/tos.hyp/anhang/hilfe.u');
  await expect(main.getByRole('link', { name: 'Download the complete pinned UDO source' })).toHaveAttribute('href', /freemint\/tos\.hyp\/archive\//);
});

test('the main sections contain only the assigned chapters', async ({ page }) => {
  await page.goto('/');
  const main = page.getByRole('main');
  const navigation = page.getByRole('navigation', { name: 'Manual' });
  await navigation.getByRole('link', { name: 'Subsystems', exact: true }).click();
  await expect(main.locator('p').first()).toContainText('pTOS organizes its system interfaces');
  await expect(main.getByText('Atari introduced TOS in 1985', { exact: false })).toBeVisible();
  await expect(main.locator('.manual-index a')).toHaveText([
    'BIOS', 'XBIOS', 'GEMDOS', 'AES', 'VDI', 'CUIS', 'Line-A', 'XHDI',
  ]);
  expect((await page.request.get('/subsystems/the-pmmu-functions-handler/')).status()).toBe(404);
  await main.getByRole('link', { name: 'AES', exact: true }).click();
  await expect(main.getByText('Digital Research developed GEM', { exact: false })).toBeVisible();
  await main.getByRole('link', { name: 'Virtual Device Interface', exact: true }).click();
  await expect(main.getByText('standardized graphics system', { exact: false })).toBeVisible();
  await navigation.getByRole('link', { name: 'OS variants and extensions' }).click();
  await expect(main.locator('.manual-index a')).toHaveText(['pTOS', 'MagiC', 'N.AES', 'XaAES', 'Emulators', 'TOS list']);
  await navigation.getByRole('link', { name: 'Conventions and misc.', exact: true }).click();
  await expect(main.locator('.manual-index a')).toHaveText([
    'Programming guidelines', 'Protocols', 'ASCII Table', 'Keyboard Scancodes', 'Development systems',
  ]);
  await main.getByRole('link', { name: 'Protocols' }).click();
  await main.getByRole('link', { name: 'XCONTROL', exact: true }).click();
  await expect(page).toHaveURL('/conventions/protocols/xcontrol/');
  await expect(main.getByRole('heading', { name: 'XCONTROL', exact: true })).toBeVisible();
  await expect(main.getByText('modular (extendable) control field', { exact: false })).toBeVisible();
  expect((await page.request.get('/subsystems/magic/')).status()).toBe(404);
  expect((await page.request.get('/subsystems/ptos/')).status()).toBe(404);
  await page.getByRole('link', { name: 'Sources and licensing', exact: true }).click();
  await expect(page).toHaveURL('/sources/');
  await expect(main.getByRole('link', { name: 'Read tos.hyp on FreeMiNT' })).toHaveAttribute('href', 'https://freemint.github.io/tos.hyp/');
});

test('the GEMDOS overview introduces the subsystem and replaces the About subpage', async ({ page }) => {
  await page.goto('/subsystems/gemdos/');
  const main = page.getByRole('main');
  await expect(main.locator('p').first()).toContainText('GEMDOS provides the highest-level operating system functions in pTOS');
  await expect(main.locator('#MiNT-compatible_20functions')).toContainText('FreeMiNT and MagiC');
  await expect(main.locator('.manual-index').getByRole('link', { name: 'Process functions' })).toBeVisible();
  await expect(main.getByRole('link', { name: 'About the GEMDOS', exact: true })).toHaveCount(0);
  await expect(main.getByText(/parameters on the stack|processor register d0|680x0 trap #1/i)).toHaveCount(0);
  await page.goto('/subsystems/gemdos/about-the-gemdos/');
  await expect(page).toHaveURL('/subsystems/gemdos/');
});

test('the BIOS and XBIOS overviews replace their About subpages', async ({ page }) => {
  for (const [subsystem, opening, entry, extensionHeading, extension] of [
    ['bios', 'pTOS uses the Basic Input/Output System (BIOS)', 'Getmpb', 'Legacy extensions', 'BSIM-BIOS-Extension'],
    ['xbios', 'pTOS uses the Extended BIOS (XBIOS)', 'Drive functions', 'Platform compatibility', 'Platform extensions'],
  ] as const) {
    const overview = `/subsystems/${subsystem}/`;
    await page.goto(overview);
    const main = page.getByRole('main');
    await expect(main.locator('p').first()).toContainText(opening);
    await expect(main.getByRole('link', { name: 'MagiC', exact: true })).toBeVisible();
    await expect(main.getByRole('heading', { level: 2 })).toHaveText([
      'System calls', 'Programming notes', extensionHeading, 'Reference indexes',
    ]);
    const indexes = main.locator('.manual-index');
    await expect(indexes.first().getByRole('link', { name: entry, exact: true })).toBeVisible();
    await expect(indexes.nth(2).getByRole('link')).toHaveText([extension]);
    const name = subsystem.toUpperCase();
    await expect(indexes.last().getByRole('link')).toHaveText([
      `${name} function list`, `${name} Structures`, `${name} error-messages`,
    ]);
    await expect(main.getByRole('link', { name: `About the ${subsystem.toUpperCase()}`, exact: true })).toHaveCount(0);
    await expect(main.locator(`a[href$="/about-the-${subsystem}/"]`)).toHaveCount(0);
    await expect(main.getByText(/parameters from the stack|processor register d0|680x0.trap #1[34]/i)).toHaveCount(0);
    await page.goto(`${overview}about-the-${subsystem}/`);
    await expect(page).toHaveURL(overview);
  }
});

test('XBIOS platform extensions have their own directory and breadcrumb', async ({ page }) => {
  await page.goto('/subsystems/xbios/');
  const main = page.getByRole('main');
  await expect(main.getByRole('link', { name: 'PCI-BIOS', exact: true })).toHaveCount(0);
  await main.getByRole('link', { name: 'Platform extensions', exact: true }).click();
  await expect(page).toHaveURL('/subsystems/xbios/platform-extensions/');
  await expect(main.locator('.manual-index a')).toHaveText([
    'MetaDOS', 'CENTScreen XBIOS extension', 'Crazy-Dots XBIOS extension', 'CT60 XBIOS extension',
    'Hatari DHS XBIOS extension', 'MATRIX XBIOS extension', 'OverScan XBIOS extension', 'PCI-BIOS', 'VIDIX XBIOS extension',
  ]);
  await main.getByRole('link', { name: 'PCI-BIOS', exact: true }).click();
  await expect(page).toHaveURL('/subsystems/xbios/pci-bios/');
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Platform extensions' }))
    .toHaveAttribute('href', '/subsystems/xbios/platform-extensions/');
});

test('AES and VDI fold their About material into grouped chapter overviews', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const main = page.getByRole('main');
  for (const [slug, introduction, firstGroup, notes, extension, indexes] of [
    ['aes', 'AES 4.0 expanded the library interfaces', 'Application library', ['AES fundamentals'],
      'AES extensions', ['AES function list', 'AES structures']],
    ['vdi', 'additional fonts and output devices could require a disk-loaded GDOS', 'Control functions',
      ['VDI fundamentals', 'VDI bindings'], 'TC-VDI functions', ['VDI functions list', 'VDI structures']],
  ] as const) {
    const overview = `/subsystems/${slug}/`;
    await page.goto(overview);
    await expect(main.locator('p').first()).toContainText('pTOS');
    await expect(main).toContainText(introduction);
    await expect(main.getByRole('heading', { level: 2 })).toHaveText([
      'Function groups', 'Programming notes', 'Extensions', 'Reference indexes',
    ]);
    const lists = main.locator('.manual-index');
    await expect(lists.nth(0).getByRole('link').first()).toHaveText(firstGroup);
    await expect(lists.nth(1).getByRole('link')).toHaveText([...notes]);
    await expect(lists.nth(2).getByRole('link')).toHaveText([extension]);
    await expect(lists.nth(3).getByRole('link')).toHaveText([...indexes]);
    await expect(main.locator(`a[href$="/about-the-${slug}/"]`)).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    await page.goto(`${overview}about-the-${slug}/`);
    await expect(page).toHaveURL(overview);
  }

  const origin = '#AES_2C_20Origin_20of_20the';
  await page.goto(`/subsystems/aes/about-the-aes/${origin}`);
  await expect(page).toHaveURL(`/subsystems/aes/${origin}`);
  await expect(main.locator(origin)).toBeInViewport();
});

test('AES extension libraries have their own directory and breadcrumb', async ({ page }) => {
  await page.goto('/subsystems/aes/');
  const main = page.getByRole('main');
  await expect(main.getByRole('link', { name: 'Geneva library', exact: true })).toHaveCount(0);
  await main.getByRole('link', { name: 'AES extensions', exact: true }).click();
  await expect(page).toHaveURL('/subsystems/aes/extensions/');
  await expect(main.locator('.manual-index a')).toHaveCount(12);
  await main.getByRole('link', { name: 'Geneva library', exact: true }).click();
  await expect(page).toHaveURL('/subsystems/aes/geneva-library/');
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'AES extensions' }))
    .toHaveAttribute('href', '/subsystems/aes/extensions/');
});

test('compatibility sections introduce pTOS before other system behavior', async ({ page }) => {
  const main = page.getByRole('main');
  await page.goto('/subsystems/aes/aes-fundamentals/');
  await expect(main.locator('p').first()).toContainText('pTOS provides the classic kernel AES');
  await expect(main).toContainText('MagiC, MiNT or MultiTOS');
  await page.goto('/subsystems/gemdos/support-for-alternative-file-systems/');
  await expect(main.locator('p').first()).toContainText('built-in FAT filesystem');
  await expect(main).toContainText('MagiC as of Version 3.0');
  await page.goto('/subsystems/gemdos/signals/');
  await expect(main.locator('p').first()).toContainText('currently unimplemented in pTOS');
  await expect(main.getByRole('table', { name: 'GEMDOS signal numbers and names' })).toBeVisible();
  await page.goto('/reference/pwaitpid/');
  await expect(main.locator('.historical-availability')).toContainText('MagiC as of Version 5.04');
});

test('GEMDOS groups system calls, programming notes, legacy extensions and indexes in order', async ({ page }) => {
  await page.goto('/subsystems/gemdos/');
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { level: 2 })).toHaveText([
    'System calls', 'Program formats and notes', 'Legacy compatibility', 'Reference indexes',
  ]);
  const groups = main.getByRole('list');
  await expect(groups).toHaveCount(4);
  await expect(groups.nth(0).getByRole('link')).toHaveText([
    'File functions', 'Directory functions', 'Character input/output', 'Date and Time',
    'Process functions', 'Memory management', 'System functions', 'MiNTnet socket functions',
  ]);
  await expect(groups.nth(1).getByRole('link')).toHaveText([
    'The program format', 'Program launch and TPA', 'Signals', 'Support for alternative file-systems',
    'Pipes, Test for', '68k GEMDOS trap',
  ]);
  await expect(groups.nth(2).getByRole('link')).toHaveText(['Legacy extensions']);
  await expect(groups.nth(3).getByRole('link')).toHaveText([
    'GEMDOS function list', 'GEMDOS structures', 'GEMDOS error messages',
  ]);

  await main.getByRole('link', { name: 'MiNTnet socket functions' }).click();
  await expect(page).toHaveURL('/subsystems/gemdos/network/');
  await expect(main.getByRole('link', { name: 'Fsocket', exact: true })).toBeVisible();
  await expect(main.getByRole('link', { name: 'F_lock', exact: true })).toHaveCount(0);
  await page.goBack();

  await main.getByRole('link', { name: 'Legacy extensions' }).click();
  await expect(main.getByRole('list').getByRole('link')).toHaveText([
    'Legacy network functions', "C'Task Royal", 'NAP BioNet100', 'PowerDOS', 'TekBios',
  ]);
  await main.getByRole('link', { name: 'Legacy network functions' }).click();
  await expect(page).toHaveURL('/subsystems/gemdos/network-functions/');
  await expect(main.getByRole('link', { name: 'F_lock', exact: true })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Legacy extensions' })).toBeVisible();
});

test('Protocols contains ARGV and the old GEMDOS URL preserves deep links', async ({ page }) => {
  const argv = '/conventions/protocols/argv-procedure/';
  const anchor = '#ARGV_20at_20the_20caller';
  const main = page.getByRole('main');
  await page.goto('/conventions/protocols/');
  await main.getByRole('link', { name: 'ARGV procedure', exact: true }).click();
  await expect(page).toHaveURL(argv);
  await expect(main.getByRole('heading', { name: 'ARGV procedure', exact: true })).toBeVisible();
  await expect(main.getByText('serves for passing extended command lines', { exact: false })).toBeVisible();

  await page.goto(`/subsystems/gemdos/argv-procedure/${anchor}`);
  await expect(page).toHaveURL(`${argv}${anchor}`);
  await expect(main.locator(anchor)).toBeAttached();
  await page.goto('/reference/pexec/');
  await expect(main.getByRole('link', { name: 'ARGV procedure', exact: true })).toHaveAttribute('href', argv);
});

test('the GEMDOS signal table has distinct number and name columns with no spacer row', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/subsystems/gemdos/signals/#SIGVTALRM');
  const table = page.getByRole('table', { name: 'GEMDOS signal numbers and names' });
  await expect(table.locator('thead').getByRole('columnheader')).toHaveText(['Number', 'Name', 'Meaning']);
  const rows = table.locator(':scope > tbody > tr');
  await expect(rows).toHaveCount(32);
  await expect(rows.first().locator('td').first()).toHaveText('0');
  await expect(rows.first().getByRole('rowheader')).toHaveText('SIGNULL');
  await expect(rows.last().locator('td').first()).toHaveText('31');
  await expect(rows.last().getByRole('rowheader')).toHaveText('SIGPWR');
  const longest = table.getByRole('rowheader', { name: 'SIGVTALRM' });
  await expect(longest.locator('#SIGVTALRM')).toBeAttached();
  await expect(longest).toHaveCSS('white-space', 'nowrap');
  expect(await longest.evaluate(cell => cell.scrollWidth <= cell.clientWidth)).toBe(true);
  const tableRegion = page.getByRole('region', { name: 'GEMDOS signal table' });
  expect(await tableRegion.evaluate(region => region.scrollWidth <= region.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('imported tables use separate reference fields and keep links and anchors', async ({ page }) => {
  await page.goto('/subsystems/gemdos/gemdos-error-messages/#E_OK');
  const errors = page.locator('main table').first();
  await expect(errors.getByRole('columnheader')).toHaveText(['Number', 'Name', 'Meaning']);
  const first = errors.locator(':scope > tbody > tr').first();
  await expect(first.getByRole('rowheader')).toHaveText('E_OK');
  await expect(first.locator('#E_OK')).toBeAttached();

  await page.goto('/subsystems/bios/bios-error-messages/');
  await expect(page.getByRole('rowheader', { name: 'E_OK', exact: true }).getByRole('link'))
    .toHaveAttribute('href', '/historical/en/gemdos-error-messages/#E_OK');

  await page.goto('/historical/de/die-systemvariablen/');
  const vars = page.locator('main table').first();
  await expect(vars.locator(':scope > thead').getByRole('columnheader')).toHaveText(['Variable', 'Adresse', 'Typ', 'Beschreibung']);
  const md = vars.locator(':scope > tbody > tr').filter({ has: page.locator('#themd') });
  await expect(md.locator(':scope > td').nth(1).getByRole('link', { name: 'MD', exact: true })).toBeVisible();
});

test('the ASCII tables retain readable fields at mobile width', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/conventions/ascii-table/');
  await expect(page.locator('.ascii-table-groups table')).toHaveCount(4);
  await expect(page.locator('.ascii-table-groups tbody tr')).toHaveCount(128);
  await expect(page.locator('.ascii-table-groups table').first().getByRole('columnheader')).toHaveText(['Hex', 'Dec', 'ASCII']);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('pTOS setup links document the boot files and moved ELF convention', async ({ page }) => {
  await page.goto('/os-variants/ptos/');
  const main = page.getByRole('main');
  await expect(main.locator('.manual-index a')).toHaveText([
    'PTOS.INI', 'External desktop and console', 'Font installation', 'ELF32 process entry',
  ]);
  await main.getByRole('link', { name: 'PTOS.INI', exact: true }).click();
  await expect(main.getByText('C:\\PTOS.INI', { exact: true })).toBeVisible();
  await expect(main.locator('pre')).toContainText('interpreter = \\BIN\\PARATOS.TOS');
  await expect(main.getByRole('link', { name: 'AT_PTOS_LAUNCH_VECTORS' })).toHaveAttribute('href', '/os-variants/ptos/elf-entry/#launch-vectors');
  await main.getByRole('link', { name: 'PTOS.INF under Font installation' }).click();
  await expect(page).toHaveURL('/os-variants/ptos/fonts/#system-font');
  await expect(main.getByText('\\GEMSYS\\FONTS', { exact: true })).toBeVisible();
  await expect(main.getByText('\\GEMSYS\\PTOS.INF', { exact: true })).toBeVisible();
  await page.goto('/os-variants/ptos/desktop-and-console/');
  await expect(main.getByRole('rowheader', { name: '\\EMUDESK.PRG' })).toBeVisible();
  await expect(main.getByRole('rowheader', { name: '\\EMUCON.TOS' })).toBeVisible();
  await expect(main.getByText('\\GEMSYS\\LIB\\X32', { exact: true })).toBeVisible();
  await main.getByRole('link', { name: 'ELF32 process entry' }).click();
  await expect(page).toHaveURL('/os-variants/ptos/elf-entry/');
  await selectTarget(page).selectOption('x32');
  await expect(page.locator('[data-target-panel="x32"]')).toContainText('RSP');
  await page.goto('/abi/elf-entry/');
  await expect(page).toHaveURL('/os-variants/ptos/elf-entry/');
});

test('historical target notes distinguish traps, library bindings, and unavailable native calls', async ({ page }) => {
  const select = selectTarget(page);
  for (const [path, target, binding] of [
    ['/historical/en/fpipe/', 'arm', 'This call is not implemented for native ARM programs'],
    ['/historical/de/fpipe/', 'x32', 'für native x32-Programme in pTOS nicht implementiert'],
    ['/historical/en/rwabs/', 'x32', 'struct x32_bios_lrwabs_args'],
    ['/historical/en/supexec/', 'arm', 'This call is not implemented for native ARM programs'],
    ['/historical/en/graf-mouse/', 'x32', 'mt_graf_mouse()'],
    ['/historical/en/graf-mouse/', 'arm', 'SVC #2'],
    ['/historical/en/appl-tplay/', 'x32', 'has no x32 libaes export'],
    ['/historical/en/v-opnvwk/', 'x32', 'libptos-vdi.a'],
    ['/historical/en/v-opnwk/', 'x32', 'This call is not implemented for native x32 programs'],
  ]) {
    await page.goto(path);
    await select.selectOption(target);
    await expect(page.locator(`[data-target-panel="${target}"]`)).toContainText(binding);
    await expect(page.locator('.prm-prototype')).toBeVisible();
  }
});

test('original German content and UDO aliases remain navigable', async ({ page }) => {
  await page.goto('/historical/de/beispiel-binding-fur-aes-funktionen/#Beispiel-Binding_20AES');
  await expect(page.locator('[id="Beispiel-Binding_20AES"]')).toBeAttached();
  await expect(page.locator('article')).toHaveAttribute('lang', 'de');
  await page.goto('/historical/de/fopen/');
  await expect(page.getByRole('heading', { name: 'C-Deklaration' })).toBeVisible();
  await expect(page.getByText('Verfügbar', { exact: true })).toBeVisible();
});

test('the pTOS master notes distinguish native staged execution, fork and PROCESS services', async ({ page }) => {
  await page.goto('/reference/pexec/');
  const select = selectTarget(page);
  await select.selectOption('arm');
  await expect(page.getByRole('tabpanel', { name: 'ARM' })).toContainText('The raw trap returns EINVFN');
  await expect(page.getByRole('row', { name: /^4 0L, basepage/ })).toContainText('The caller can start it again after exit');
  await expect(page.getByRole('row', { name: /200 .*same PROCESS/ })).toContainText('CONF_WITH_EXEC_REPLACE');
  await select.selectOption('68k');
  await expect(page.getByText(/including PRG-only builds/)).toBeVisible();
  await page.goto('/reference/pclone/');
  await expect(page.getByRole('link', { name: 'master snapshot' })).toHaveAttribute('href', ptosSourceTree);
  await expect(page.getByRole('link', { name: 'ParaTOS main snapshot' })).toBeVisible();
  await expect(page.getByRole('row', { name: /child_pid/ })).toContainText('+28');
  await expect(page.getByText(/pTOS 1\.4/)).toHaveCount(0);
  await page.goto('/reference/s-procexec/');
  await select.selectOption('x32');
  await expect(page.getByRole('row', { name: /completion.*SNAPSHOT/ })).toContainText('+32');
  await expect(page.getByRole('row', { name: /classic_tail/ })).toContainText('+64');
  const requestFlags = page.getByRole('row').filter({ has: page.getByRole('rowheader', { name: 'flags', exact: true }) });
  await expect(requestFlags).toContainText('Bit 1 requests ELF accessory startup');
  await expect(page.locator('.prm-prototype')).toBeVisible();
});

test('Pexecve documents the native ABI while ParaTOS keeps the guest Pexec trap', async ({ page }) => {
  await page.goto('/subsystems/gemdos/process-functions/');
  await expect(page.getByRole('link', { name: 'PEXECVE_GUEST_SSYSTEM', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'Pexecve', exact: true }).click();
  const prototype = page.locator('.prm-prototype');
  await expect(prototype).toContainText('long Pexecve(short mode, const char *path,');
  await expect(page.getByRole('table', { name: 'Caller stack at TRAP #1' }).getByRole('row', { name: /envp/ })).toContainText('+12');
  const select = selectTarget(page);
  await select.selectOption('arm');
  await expect(page.getByRole('tabpanel', { name: 'ARM' })).toContainText('SVC #1');
  await expect(page.getByRole('row', { name: /R4 envp/ })).toBeVisible();
  await select.selectOption('x32');
  await expect(page.locator('.prm-bit-fields code')).toHaveText(['0x1', '0x193']);
  await expect(prototype).toBeVisible();
  const config = page.getByText('CONF_WITH_M68K_SHARED_EXEC', { exact: false });
  await expect(config).toContainText('PRG-only Atari and Amiga ROMs');
  await expect(config).toContainText('return EINVFN for modes 100 and 200');
  await page.goto('/reference/pexecve-guest-ssystem/#calling-convention', { waitUntil: 'commit' });
  await expect(page).toHaveURL('/reference/pexecve/#paratos');
  await expect(page.locator('#paratos')).toContainText('translates guest modes 0, 100 and 200 to native Pexecve');
  await expect(page.locator('#paratos')).toContainText('all 128 bytes of the original command tail');
  await page.goto('/reference/pexec/');
  await expect(page.getByRole('tabpanel', { name: 'x32' })).toContainText('The raw syscall returns EINVFN');
  await expect(page.getByText('All GEMDOS versions.', { exact: true })).toBeVisible();
  await expect(page.getByText('ParaTOS translates modes 0, 100 and 200 to native Pexecve', { exact: false })).toBeVisible();
});

test('AES vector shell calls and static ELF startup are linked through the manual', async ({ page }) => {
  await page.goto('/subsystems/aes/shell-library/');
  await page.getByRole('link', { name: 'shel_write', exact: true }).first().click();
  const launchNotes = page.getByRole('region', { name: 'Launching from x32 libaes' });
  await expect(launchNotes).toContainText('SWM_LAUNCHACC (3) starts an ELF accessory with any filename');
  await expect(launchNotes).toContainText('CL_PARSE also accepts byte 127');
  await page.getByRole('link', { name: 'shel_writeve', exact: true }).first().click();
  await expect(page.locator('.prm-prototype')).toContainText('short shel_writeve(');
  await expect(page.getByRole('tabpanel', { name: '68k' })).toContainText('Unsupported');
  await selectTarget(page).selectOption('x32');
  await expect(page.getByRole('tabpanel', { name: 'x32' })).toContainText('mt_shel_writeve');
  await expect(page.getByText('Use CL_NORMAL with SWM_LAUNCH and SWM_LAUNCHACC', { exact: false })).toBeVisible();
  await page.getByRole('link', { name: 'shel_readve', exact: true }).click();
  await expect(page.locator('.prm-prototype')).toContainText('short shel_readve(');
  await page.getByRole('link', { name: 'ELF32 process entry', exact: true }).click();
  await expect(page.getByText('Static vector startup enters', { exact: false })).toBeVisible();
  await expect(page.locator('#launch-vectors')).toContainText('0x5004');
  const role = page.getByRole('row', { name: /^AT_PTOS_ENTRY_TYPE/ });
  await expect(role).toContainText('0x5006');
  await expect(role).toContainText('an absent tag selects program startup');
  await expect(page.getByText('0x50544F53', { exact: true })).toBeVisible();
  await expect(page.getByText('is a compatibility name for the same object', { exact: false })).toContainText('dynacccrt.o');
  const classic = page.getByRole('table', { name: 'Classic program and accessory basepage entry' });
  await expect(classic.getByRole('row', { name: /^68k/ })).toContainText('Basepage at 4(SP), A0 = 0');
  await expect(classic.getByRole('row', { name: /^68k/ })).toContainText('Kernel AES passes the basepage in A0');
  await expect(page.getByRole('row', { name: /AT_PTOS_GUEST_LAUNCH/ })).toHaveCount(0);
  await page.goto('/reference/cuis-launch-attach/');
  await expect(page.getByText('select observation without a console lease', { exact: false })).toBeVisible();
});

test('Fpoll_time64 belongs to File functions and keeps the C and trap interfaces distinct', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/subsystems/gemdos/file-functions/');
  await page.locator('.manual-index').getByRole('link', { name: 'Fpoll_time64', exact: true }).click();
  await expect(page).toHaveURL('/reference/fpoll-time64/');
  const prototype = page.locator('.prm-prototype');
  await expect(prototype).toHaveText('long Fpoll_time64(POLLFD *fds, uint32_t nfds, int64_t timeout_ms);');
  const stack = page.getByRole('table', { name: 'Caller stack at TRAP #1' });
  await expect(stack.getByRole('row', { name: /timeout_hi/ })).toContainText('+10');
  await expect(stack.getByRole('row', { name: /timeout_lo/ })).toContainText('+14');
  const record = page.getByRole('table', { name: 'POLLFD record' });
  await expect(record.getByRole('row', { name: /revents/ })).toContainText('+6');
  await expect(page.getByRole('table', { name: 'Poll event flags' }).getByRole('row', { name: /^POLLNVAL/ })).toContainText('0x020');
  await expect(page.getByText('The 256 KiB Amiga ROM returns EINVFN', { exact: false })).toBeVisible();
  await selectTarget(page).selectOption('arm');
  await expect(page.getByRole('row', { name: /R3 timeout_hi/ })).toBeVisible();
  await selectTarget(page).selectOption('x32');
  await expect(page.locator('.prm-bit-fields code')).toHaveText(['0x1', '0x194']);
  await expect(page.getByRole('row', { name: /R10 timeout_lo/ })).toBeVisible();
  await selectTarget(page).selectOption('gfa');
  await expect(prototype).toBeVisible();
  await expect(page.getByRole('tabpanel', { name: 'GFA BASIC' })).toContainText('&H194');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('legacy polling and Fcntl describe native pTOS support alongside historical availability', async ({ page }) => {
  for (const { name, text, legacy } of [
    { name: 'fpoll', text: 'Every negative value means an indefinite wait', legacy: 'FreeMiNT 1.15.12' },
    { name: 'fselect', text: 'An invalid selected descriptor clears the masks', legacy: 'MiNT version 1.04' },
  ]) {
    await page.goto(`/historical/en/${name}/`);
    await expect(page.locator('.prm-facts')).toContainText(legacy);
    const notes = page.getByRole('region', { name: 'pTOS behavior' });
    await expect(notes).toContainText(text);
    await expect(notes.getByRole('link', { name: 'Fpoll_time64' }).first()).toHaveAttribute('href', '/reference/fpoll-time64/');
    await selectTarget(page).selectOption('x32');
    const binding = page.getByRole('tabpanel', { name: 'x32' });
    await expect(binding).toContainText('C adapter in libcmini over Fpoll_time64');
    await expect(binding).toContainText('The legacy opcode returns EINVFN');
    await expect(binding.locator('.prm-bit-fields')).toHaveCount(0);
    await selectTarget(page).selectOption('68k');
    await expect(page.getByRole('tabpanel', { name: '68k' })).toBeVisible();
  }
  await page.goto('/historical/en/fcntl/');
  await expect(page.getByRole('region', { name: 'pTOS behavior' })).toContainText('0 for read-only, 1 for write-only or 2 for read/write');
  await selectTarget(page).selectOption('x32');
  const fcntl = page.getByRole('tabpanel', { name: 'x32' });
  await expect(fcntl).toContainText('Supports F_GETFL (3)');
  await expect(fcntl.locator('.prm-bit-fields code')).toHaveText(['0x1', '0x104']);
});

test('search covers historical sections outside the function index', async ({ page }) => {
  await page.goto('/search/');
  const search = page.getByRole('searchbox');
  await search.fill('argv procedure');
  await expect(page.getByRole('link', { name: 'ARGV procedure', exact: true }))
    .toHaveAttribute('href', '/conventions/protocols/argv-procedure/');
  for (const label of ['About the BIOS', 'About the AES', 'About the VDI']) {
    await search.fill(label);
    await expect(page.getByRole('link', { name: label, exact: true })).toHaveCount(0);
  }
  await search.fill('PMMU functions-handler');
  await expect(page.getByRole('link', { name: 'The PMMU functions-handler', exact: true })).toHaveCount(0);
  await search.fill('pmem_size');
  await expect(page.getByRole('link', { name: 'pmem_size', exact: true })).toHaveCount(0);
  await search.fill('bios subsystems');
  await expect(page.getByRole('link', { name: 'BIOS', exact: true })).toHaveAttribute('href', '/subsystems/bios/');
});

test('GFA BASIC shows compendium provenance, direct traps and runtime wrappers', async ({ page }) => {
  await page.goto('/gfa-basic/');
  await expect(page.getByRole('link', { name: 'http://bafo.free.fr/' })).toHaveAttribute('href', 'http://bafo.free.fr/');
  await expect(page.getByText('VDISYS [opcode[,c_int,c_pts[,subopc]]]')).toBeVisible();
  await page.goto('/reference/pexec/');
  await selectTarget(page).selectOption('gfa');
  await expect(page.getByText('EXEC(mode,name$,command$,environment$)')).toBeVisible();
  await expect(page.getByText('Result%=GEMDOS(&H4B,W:Arg1%,L:Arg2%,L:Arg3%,L:Arg4%)')).toBeVisible();
  await expect(page.locator('.prm-prototype')).toBeVisible();
  await page.goto('/historical/en/wind-get/');
  await expect(page.getByText('WIND_GET(handle,code[,w1,w2,w3,w4])')).toBeVisible();
  await expect(page.getByText('GFA-Basic Compendium · PDF page 34')).toBeVisible();
  await page.goto('/historical/en/bconin/');
  await expect(page.getByText('Result%=BIOS(&H2,W:Arg1%)')).toBeVisible();
  await page.goto('/historical/en/appl-getinfo/');
  await expect(page.getByText('The Compendium documents a custom GFA BASIC helper', { exact: false })).toBeVisible();
});
