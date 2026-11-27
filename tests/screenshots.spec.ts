import { mkdir } from 'node:fs/promises';
import { test } from '@playwright/test';

const directory = process.env.MANUAL_SCREENSHOTS;
test.skip(!directory, 'Set MANUAL_SCREENSHOTS to capture review images.');

for (const { slug, route, target } of [
  { slug: 'fclose', route: '/reference/fclose/', target: '68k' },
  { slug: 'pexec', route: '/reference/pexec/', target: '68k' },
  { slug: 'pexecve', route: '/reference/pexecve/', target: 'x32' },
  { slug: 'cuis', route: '/subsystems/cuis/', target: 'x32' },
  { slug: 'cuis-call', route: '/reference/cuis-launch-attach/', target: 'x32' },
  { slug: 'fopen', route: '/historical/en/fopen/', target: '68k' },
  { slug: 'pclone', route: '/reference/pclone/', target: 'x32' },
]) {
  for (const [size, width, height] of [['desktop', 1440, 1100], ['mobile', 390, 844]] as const) {
    test(`capture ${slug} ${size}`, async ({ page }) => {
      await mkdir(directory!, { recursive: true });
      await page.setViewportSize({ width, height });
      await page.goto(route);
      await page.getByRole('combobox', { name: 'Target / Language' }).selectOption(target);
      await page.screenshot({ path: `${directory}/${slug}-${size}.png`, fullPage: slug !== 'pexec', animations: 'disabled' });
      if (slug === 'pexec') {
        await page.locator('#calling-convention').evaluate(el => el.scrollIntoView({ block: 'start' }));
        await page.screenshot({ path: `${directory}/${slug}-abi-${size}.png`, animations: 'disabled' });
      }
      if (slug === 'pexec' && size === 'desktop') {
        await page.pdf({ path: `${directory}/pexec-print.pdf`, format: 'A4', preferCSSPageSize: true });
      }
      if (slug === 'cuis-call' && size === 'desktop') {
        await page.pdf({ path: `${directory}/cuis-call-print.pdf`, format: 'A4', preferCSSPageSize: true });
        await page.locator('#calling-convention').evaluate(el => el.scrollIntoView({ block: 'start' }));
        for (const [state, value] of [['planned-arm', 'arm'], ['undocumented-gfa', 'gfa']]) {
          await page.getByRole('combobox', { name: 'Target / Language' }).selectOption(value);
          await page.screenshot({ path: `${directory}/cuis-${state}.png`, animations: 'disabled' });
        }
      }
    });
  }
}
