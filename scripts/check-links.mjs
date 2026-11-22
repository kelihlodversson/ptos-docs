import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const host = 'https://docs.ptos.dev';
const dist = new URL('../dist/', import.meta.url);
const pages = new Map();
for (const path of readdirSync(dist, { recursive: true }).filter(path => path.endsWith('.html'))) {
  const html = readFileSync(new URL(path, dist), 'utf8');
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length, `Duplicate ID in ${path}`);
  const route = '/' + path.replace(/index\.html$/, '');
  assert.ok(html.includes(`rel="canonical" href="${host}${route}"`), `Wrong canonical URL for ${path}`);
  pages.set(path, { html, ids, route });
}
assert.ok(pages.size > 0, 'Build the site first');

let links = 0;
for (const { html, route } of pages.values()) {
  for (const [, attribute] of html.matchAll(/\s(?:href|src)="([^"]+)"/g)) {
    const { origin, pathname, hash } = new URL(attribute.replaceAll('&amp;', '&'), host + route);
    if (origin !== host) continue;
    const decoded = decodeURIComponent(pathname);
    const file = decoded.endsWith('/') ? join(decoded, 'index.html') : decoded;
    const url = new URL(file.slice(1), dist);
    assert.ok(existsSync(url) && statSync(url).isFile(), `${route} links to missing ${pathname}`);
    if (hash) assert.ok(pages.get(file.slice(1))?.ids.includes(decodeURIComponent(hash.slice(1))),
      `${route} links to missing fragment ${pathname}${hash}`);
    links++;
  }
}
console.log(`Checked ${links} internal resource and fragment links across ${pages.size} pages`);
