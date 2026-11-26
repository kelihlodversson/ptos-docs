import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultTreeAdapter as tree, parse, parseFragment, serialize } from 'parse5';
import { translationFindings } from './translation.mjs';
import { gfaTrap } from './gfa-trap.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const { tos, udo } = JSON.parse(readFileSync(join(root, 'src/data/sources.json')));
const args = process.argv.slice(2);
const check = args.includes('--check');
const [checkout, compiler] = args.filter(arg => arg !== '--check').map(arg => resolve(arg));
if (!checkout || !compiler) throw new Error('Usage: npm run import:historical -- TOS_HYP_CHECKOUT UDO_EXECUTABLE [--check]');

const work = mkdtempSync(join(tmpdir(), 'ptos-toshyp-'));
const source = join(work, 'source');
const git = (...args) => execFileSync('git', ['-C', checkout, ...args], { maxBuffer: 64 * 1024 * 1024 });
const decode = bytes => new TextDecoder('utf-8', { fatal: true }).decode(bytes);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

const outputPaths = new Set();
const assetFolder = 'public/source/tos.hyp/bilder/gif';
const issueExamples = JSON.parse(readFileSync(join(root, 'src/data/translation-review.json')));
const historicalMerges = JSON.parse(readFileSync(join(root, 'src/data/historical-merges.json')));
const permittedFigure = /^(?:aligment|cl_width(?:_en)?|drv_u|drv_udev|drvuproc|email_gs|email_mb|extent(?:_en)?|filesys|fontinfo(?:_en)?|gdos_ahn|koords(?:_en)?|linien|marker|meta_3|metafile|muster|raster(?:_en)?|tpa(?:_en)?|wr_modi(?:_en)?)\.gif$/;
const allowedTags = new Set('a b blockquote br caption center code dd div dl dt em h1 h2 h3 h4 h5 h6 hr i img kbd li ol p pre small span strong sub sup table tbody td th thead tr tt u ul q'.split(' '));
const ignoredTags = new Set(['script', 'style', 'iframe', 'object', 'embed']);
const labelFor = entry => entry.trim().replace(/[:\s]+$/, '').toLowerCase();
const normalize = text => text.replace(/[\t\f\u00a0 ]+/g, ' ').replace(/ *\n */g, '\n').trim();
const slugify = value => value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const children = node => node?.childNodes ?? [];
const elements = node => children(node).filter(child => child.tagName);
const element = (node, tag) => elements(node).find(child => child.tagName === tag);
const attr = (node, name) => node?.attrs?.find(item => item.name === name)?.value;
const content = node => !node ? '' : node.nodeName === '#text' ? node.value
  : node.tagName === 'br' ? '\n' : children(node).map(content).join('');
const plain = node => normalize(content(node));
const route = (language, slug) => `/historical/${language}/${slug}/`;
const pinnedSource = path => `https://github.com/${tos.repo}/blob/${tos.revision}/${path}`;
const tpaFigures = {
  en: {
    slug: 'program-launch-and-tpa', image: 'tpa_en.gif',
    caption: 'Classic PRG TPA after Mshrink',
    columns: ['Region (high to low)', 'Address', 'Length'],
    stack: ['Stack', 'Stack pointer at the upper end', 'Space reserved by startup code'],
    names: ['Uninitialized data', 'Initialized data', 'Program code', 'Basepage'],
    bytes: '256 bytes', original: 'Original TPA diagram',
  },
  de: {
    slug: 'programmstart-und-tpa', image: 'tpa.gif',
    caption: 'Klassische PRG-TPA nach Mshrink',
    columns: ['Bereich (von oben nach unten)', 'Adresse', 'Länge'],
    stack: ['Stack', 'Stack-Pointer am oberen Ende', 'Vom Startcode reservierter Speicher'],
    names: ['Variablenbereich', 'Datenbereich', 'Programmcode', 'Basepage'],
    bytes: '256 Bytes', original: 'Originalabbildung der TPA',
  },
};
const englishNotes = {
  Fclose: '/reference/fclose/',
  Pexec: '/reference/pexec/',
  appl_init: '/reference/appl_init/',
  Ssystem: '/reference/ssystem/',
  Pfork: '/reference/pfork/',
  Pvfork: '/reference/pvfork/',
  Pwait: '/reference/pwait/',
  Pwait3: '/reference/pwait3/',
  Pwaitpid: '/reference/pwaitpid/',
  Pterm: '/reference/pterm/',
  Pterm0: '/reference/pterm0/',
  Ptermres: '/reference/ptermres/',
  Syield: '/reference/syield/',
};
const publishedRoute = (language, slug) => historicalMerges[slug] ?? route(language, slug);

function save(path, contents) {
  outputPaths.add(path);
  const file = join(root, path);
  if (check) {
    if (!readFileSync(file).equals(Buffer.from(contents))) throw new Error(`Regenerate ${path}`);
    return;
  }
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, contents);
}

function childRows(table) {
  return elements(table).flatMap(node => node.tagName === 'tr' ? [node] : elements(node));
}

function relevantNodes(body) {
  const nodes = children(body);
  const first = nodes.findIndex(node => node.tagName === 'hr');
  const last = nodes.findLastIndex(node => node.tagName === 'hr');
  if (first < 0 || first === last) throw new Error('UDO output is missing its navigation delimiters');
  const nav = nodes.slice(0, first);
  const aliases = nav.filter(node => node.tagName === 'a' && attr(node, 'name') && !attr(node, 'href'));
  return { nav, content: [...aliases, ...nodes.slice(first + 1, last)] };
}

function archiveMetadata(output) {
  const log = readFileSync(join(output, 'index.ulh'), 'utf8');
  const nodes = Number(/^Total nodes:\s+(\d+)/m.exec(log)?.[1]);
  if (!/^Errors:\s+0$/m.test(log) || !nodes) throw new Error(log);
  const sourceFiles = new Set(['tos_hyp.u']);
  const pageSource = new Map();
  for (const line of decode(readFileSync(join(output, 'index.uth'))).split('\n')) {
    const include = /^(?:\|----)+(.+\.ui?)$/.exec(line)?.[1];
    if (include) sourceFiles.add(include);
    const match = /; (.+?\.ui?); (\S+)$/.exec(line);
    if (match) {
      sourceFiles.add(match[1]);
      pageSource.set(match[2] + '.html', match[1]);
    }
  }
  return { nodes, sourceFiles, pageSource };
}

function buildLanguage(language) {
  const output = join(work, language);
  mkdirSync(join(output, 'bilder'), { recursive: true });
  cpSync(join(source, 'bilder/gif'), join(output, 'bilder/gif'), { recursive: true });
  execFileSync(compiler, ['-q', '-D', language === 'en' ? 'ENGLISH' : 'GERMAN',
    '--html', '--tree', '-o', join(output, 'index.html'), 'tos_hyp.u'], { cwd: source });
  const metadata = archiveMetadata(output);
  const files = readdirSync(output).filter(file => file.endsWith('.html')).sort();
  if (files.length !== metadata.nodes) {
    throw new Error(`${language}: ${files.length} rendered pages for ${metadata.nodes} UDO nodes`);
  }

  const records = new Map();
  const slugs = new Set(['contents']);
  for (const file of files) {
    const path = metadata.pageSource.get(file) ?? (file === 'index.html' || file === 'indexudo.html' ? 'tos_hyp.u' : null);
    if (!path) throw new Error(`Missing source provenance: ${language}/${file}`);
    const doc = element(parse(decode(readFileSync(join(output, file)))), 'html');
    const head = element(doc, 'head');
    const rawTitle = plain(element(head, 'title'));
    const title = rawTitle.replace(/^[^:]+: /, '') || file;
    const id = file.slice(0, -5);
    const base = slugify(title) || id;
    const slug = file === 'index.html' ? 'contents' : slugs.has(base) ? `${base}-${id.toLowerCase()}` : base;
    if (file !== 'index.html' && slugs.has(slug)) throw new Error(`Duplicate ${language} slug ${slug}`);
    slugs.add(slug);
    records.set(file, { title, slug, path, ...relevantNodes(element(doc, 'body')) });
  }

  const diagnostics = { missingLinks: [], linkedFigures: [], inlinedFigures: [], transcribedFigures: [], findings: [] };
  const copied = new Set();

  function link(href, file) {
    if (/^(?:https?:|mailto:|ftp:)/i.test(href)) return href;
    if (/^\/\//.test(href)) return `https:${href}`;
    const [name, fragment] = href.split('#');
    const target = records.get(name || file);
    if (!target) {
      diagnostics.missingLinks.push({ file, href });
      return null;
    }
    // UDO already escapes special anchor characters in its generated names.
    return publishedRoute(language, target.slug) + (fragment ? `#${fragment}` : '');
  }

  function renderNode(node, parent, file) {
    if (node.nodeName === '#text') {
      tree.insertText(parent, node.value);
      return;
    }
    if (!node.tagName || ignoredTags.has(node.tagName)) return;
    if (!allowedTags.has(node.tagName)) throw new Error(`Unreviewed UDO element <${node.tagName}> in ${file}`);
    const tpa = tpaFigures[language];
    if (node.tagName === 'p' && records.get(file).slug === tpa.slug) {
      const [figure, ...other] = elements(node);
      const path = `bilder/gif/${tpa.image}`;
      if (figure?.tagName === 'img' && attr(figure, 'src') === path && other.length === 0 && !plain(node)) {
        const bytes = readFileSync(join(source, path));
        diagnostics.transcribedFigures.push({ file, path, sha256: hash(bytes) });
        if (!copied.has(tpa.image)) save(`${assetFolder}/${tpa.image}`, bytes);
        copied.add(tpa.image);
        const [bss, data, text, basepage] = tpa.names;
        const [stack, stackPointer, stackLength] = tpa.stack;
        const fragment = parseFragment(`
<table class="historical-table prm-rule-table classic-tpa-layout">
  <caption>${tpa.caption}</caption>
  <thead><tr>${tpa.columns.map(label => `<th scope="col">${label}</th>`).join('')}</tr></thead>
  <tbody>
    <tr><th scope="row">${stack}</th><td>${stackPointer}</td><td>${stackLength}</td></tr>
    <tr><th scope="row">${bss} (<code>BSS</code>)</th><td><code>p_bbase</code></td><td><code>p_blen</code></td></tr>
    <tr><th scope="row">${data} (<code>DATA</code>)</th><td><code>p_dbase</code></td><td><code>p_dlen</code></td></tr>
    <tr><th scope="row">${text} (<code>TEXT</code>)</th><td><code>p_tbase</code></td><td><code>p_tlen</code></td></tr>
    <tr><th scope="row">${basepage}</th><td><code>p_lowtpa</code></td><td>${tpa.bytes}</td></tr>
  </tbody>
</table>
<p class="revision-note"><a href="${pinnedSource(path)}">${tpa.original}</a></p>`);
        for (const child of children(fragment)) tree.appendChild(parent, child);
        return;
      }
    }
    const tag = { center: 'div', tt: 'code', h1: 'h2' }[node.tagName] ?? node.tagName;
    const attrs = [];
    const id = attr(node, 'id') || (tag === 'a' && attr(node, 'name'));
    if (id) attrs.push({ name: 'id', value: id });
    if (tag === 'a') {
      const href = attr(node, 'href');
      // UDO can auto-link words on either side of an underscore in an identifier.
      if (href && !id && records.get(file).slug === 'appl-getinfo' && /^[A-Z][A-Z0-9_]*$/.test(content(node))) {
        const siblings = children(node.parentNode);
        const index = siblings.indexOf(node);
        if (content(siblings[index - 1]).endsWith('_') || content(siblings[index + 1]).startsWith('_')) {
          for (const child of children(node)) renderNode(child, parent, file);
          return;
        }
      }
      const target = href && link(href, file);
      if (target) attrs.push({ name: 'href', value: target });
      if (href && !target) attrs.push({ name: 'title', value: `Unresolved upstream link: ${href}` });
    }
    if (tag === 'table') attrs.push({ name: 'class', value: 'historical-table prm-rule-table' });
    if (tag === 'td' || tag === 'th') {
      for (const name of ['colspan', 'rowspan']) {
        const value = attr(node, name);
        if (value && /^\d+$/.test(value)) attrs.push({ name, value });
      }
      const align = attr(node, 'align');
      const classes = [];
      if (attr(node, 'nowrap') !== undefined) classes.push('historical-nowrap');
      if (['center', 'right'].includes(align)) classes.push(`historical-align-${align}`);
      if (classes.length) attrs.push({ name: 'class', value: classes.join(' ') });
    }
    if (tag === 'img') {
      const src = attr(node, 'src');
      const image = basename(src ?? '');
      if (!src || src !== `bilder/gif/${image}` || !/^[\w.-]+\.gif$/i.test(image)) {
        throw new Error(`Unreviewed UDO image source ${src} in ${file}`);
      }
      const path = `bilder/gif/${image}`;
      const bytes = readFileSync(join(source, path));
      const caption = attr(node, 'alt') || image.replace(/\.gif$/i, '').replaceAll('_', ' ');
      if (!permittedFigure.test(image)) {
        diagnostics.linkedFigures.push({ file, path });
        const anchor = tree.createElement('a', 'http://www.w3.org/1999/xhtml', [{ name: 'href', value: pinnedSource(path) }]);
        tree.insertText(anchor, language === 'en' ? `Original illustration (${caption})` : `Originalabbildung (${caption})`);
        tree.appendChild(parent, anchor);
        return;
      }
      diagnostics.inlinedFigures.push({ file, path, sha256: hash(bytes) });
      if (!copied.has(image)) save(`${assetFolder}/${image}`, bytes);
      copied.add(image);
      attrs.push({ name: 'src', value: `/source/tos.hyp/${path}` }, { name: 'alt', value: caption },
        { name: 'loading', value: 'lazy' });
      for (const name of ['width', 'height']) {
        const value = attr(node, name);
        if (value && /^\d+$/.test(value)) attrs.push({ name, value });
      }
    }
    const copy = tree.createElement(tag, 'http://www.w3.org/1999/xhtml', attrs);
    if (tag === 'table') {
      const region = tree.createElement('div', 'http://www.w3.org/1999/xhtml', [
        { name: 'class', value: 'table-scroll' }, { name: 'tabindex', value: '0' },
        { name: 'role', value: 'region' }, { name: 'aria-label', value: language === 'en' ? 'Historical table' : 'Historische Tabelle' },
      ]);
      tree.appendChild(region, copy);
      tree.appendChild(parent, region);
      if (['the-program-format', 'das-programmformat'].includes(records.get(file).slug)) {
        const [header, ...rows] = childRows(node);
        const ns = 'http://www.w3.org/1999/xhtml';
        const caption = tree.createElement('caption', ns, []);
        tree.insertText(caption, language === 'en' ? 'Digital Research symbol types' : 'Digital-Research-Symboltypen');
        tree.appendChild(copy, caption);
        const thead = tree.createElement('thead', ns, []);
        const tr = tree.createElement('tr', ns, []);
        for (const cell of elements(header)) {
          const th = tree.createElement('th', ns, [{ name: 'scope', value: 'col' }]);
          tree.insertText(th, plain(cell));
          tree.appendChild(tr, th);
        }
        tree.appendChild(thead, tr);
        tree.appendChild(copy, thead);
        const tbody = tree.createElement('tbody', ns, []);
        for (const row of rows) renderNode(row, tbody, file);
        tree.appendChild(copy, tbody);
        return;
      }
    } else {
      tree.appendChild(parent, copy);
    }
    for (const child of children(node)) renderNode(child, copy, file);
  }

  function html(nodes, file) {
    const parent = tree.createDocumentFragment();
    for (const node of nodes) renderNode(node, parent, file);
    return serialize(parent);
  }

  function rows(table) {
    return childRows(table).map(row => {
      const [key, value] = elements(row).filter(cell => cell.tagName === 'td' || cell.tagName === 'th');
      return { key, value, label: labelFor(plain(key)) };
    }).filter(row => row.key && row.value);
  }

  const bindings = new Map();
  for (const [file, record] of records) {
    const parentFile = attr(record.nav.find(node => attr(node, 'name') === 'UDO_nav_up_HEAD'), 'href');
    const table = record.content.find(node => node.tagName === 'table');
    const fields = rows(table);
    const asm = fields.find(field => ['assembler', 'assembly', 'binding', 'umsetzung'].includes(field.label));
    const gfa = fields.find(field => /gfa[- ]?basic/.test(field.label));
    if (!parentFile || !asm && !gfa || records.get(parentFile)?.path !== record.path) continue;
    const gfaCode = gfa && plain(gfa.value);
    const review = language === 'en' && Object.values(issueExamples).find(entry => entry.example && entry.example.original === gfaCode);
    bindings.set(parentFile, {
      href: route(language, record.slug),
      assembly: asm && html(children(asm.value), file).trim(),
      gfa: review?.example?.english ?? gfaCode,
      raw: asm && gfaTrap(content(asm.value)),
    });
  }

  const functions = [];
  const paths = [];
  const controls = [];
  const parents = {};
  for (const [file, record] of records) {
    let nodes = record.content.filter(node => attr(node, 'id') !== 'udo_titlepage');
    const sectionHead = nodes.find(node => node.tagName === 'h1');
    const sectionId = attr(element(sectionHead, 'a'), 'name');
    if (sectionHead) nodes = nodes.filter(node => node !== sectionHead);

    const table = nodes.find(node => node.tagName === 'table');
    const fields = rows(table);
    const syntax = fields.find(field => ['syntax', 'deklaration'].includes(field.label));
    const name = fields.find(field => field.label === 'name');
    const opcode = fields.find(field => /opcode|nummer/.test(field.label));
    const isFunction = Boolean(syntax || name && opcode);
    const operation = name ? plain(name.value).replace(/^[»«][^»«]+[»«]\s*-\s*/, '') : '';
    const prototype = syntax ? plain(syntax.value) : '';
    if (syntax && !prototype) controls.push({ file, path: record.path, issue: 'Empty declaration' });
    const description = operation ? operation.replace(/\s+/g, ' ').slice(0, 300) : record.title;

    const parentLink = record.nav.find(node => attr(node, 'name') === 'UDO_nav_up_HEAD');
    const parentFile = attr(parentLink, 'href');
    if (records.has(parentFile)) parents[record.slug] = records.get(parentFile).slug;
    const group = records.get(parentFile)?.title ?? 'tos.hyp';
    const nav = record.nav.filter(node => attr(node, 'name')?.startsWith('UDO_nav_') && attr(node, 'href')).map(node => {
      const href = attr(node, 'href');
      const text = plain(node) || attr(element(node, 'img'), 'alt');
      return { href: link(href, file), label: text };
    }).filter(item => item.href && item.label);
    const subsystem = record.path.startsWith('gem/aes/') ? 'AES'
      : record.path.startsWith('gem/vdi/') ? 'VDI'
      : record.path.startsWith('bios/') ? 'BIOS'
      : record.path.startsWith('xbios/') ? 'XBIOS'
      : record.path.startsWith('gemdos/') ? 'GEMDOS'
      : 'tos.hyp';

    const relatedMode = englishNotes[record.title];
    const knownEdit = language === 'en' && Object.values(issueExamples).find(review =>
      review.example && plain({ childNodes: nodes }).includes(review.example.original));
    if (knownEdit?.example) {
      const replace = node => {
        if (node.nodeName === '#text') node.value = node.value.replace(knownEdit.example.original, knownEdit.example.english);
        for (const child of children(node)) replace(child);
      };
      for (const node of nodes) replace(node);
    }

    const findings = language === 'en' ? translationFindings(content({ childNodes: nodes })) : [];
    if (findings.length) diagnostics.findings.push({ slug: record.slug, path: record.path, findings: findings.length,
      examples: findings.slice(0, 4) });

    const fragment = isFunction ? nodes.filter(node => node !== table) : nodes;
    const page = {
      slug: record.slug, title: record.title, path: record.path, id: sectionId,
      language, nav, subsystem, group, description, href: route(language, record.slug),
      prototype, operation,
      facts: isFunction ? fields.filter(row => row !== syntax).map(({ key, value }) =>
        ({ label: plain(key), value: html(children(value), file).trim() })) : [],
      body: html(fragment, file).trim(), function: isFunction, native: relatedMode,
      findings: findings.length, bindings: bindings.get(file),
    };
    if (isFunction) functions.push({ name: record.title, group, description, subsystem, href: relatedMode ?? page.href, historicalHref: page.href });
    paths.push(page);
  }

  return { metadata, controls, functions, paths, diagnostics, parents };
}

try {
  mkdirSync(source);
  execFileSync('tar', ['-x', '-C', source], { input: git('archive', tos.revision) });
  const main = join(source, 'tos_hyp.u');
  const mainBytes = readFileSync(main);
  // The UDO main file is legacy encoded. The directive itself is ASCII.
  const unfolded = mainBytes.toString('latin1').replace(/^!html_merge_subsubnodes\r?\n/m, '');
  if (unfolded.length === mainBytes.length) throw new Error('The UDO split directive has changed');
  writeFileSync(main, Buffer.from(unfolded, 'latin1'));

  // UDO expands (!today) to the build date. The SE protocol source header
  // records the author's original date, so use it for the rendered signature.
  const protocol = join(source, 'protokol/seproto/seproto_de.ui');
  const protocolText = readFileSync(protocol, 'latin1');
  const credit = /^# @\(#\)seproto\.u, (Dirk Haun), (\d{2}\.\d{2}\.\d{4})\r?$/m.exec(protocolText);
  if (!credit) throw new Error('Missing original SE protocol author date');
  const signature = protocolText.replace(/^Dirk Haun, \(!today\)(?=\r?$)/m, credit[1] + ', ' + credit[2]);
  if (signature === protocolText) throw new Error('The SE protocol author signature has changed');
  writeFileSync(protocol, signature, 'latin1');

  const report = { revision: tos.revision, compiler: udo.revision, languages: {}, outOfCorpus: [] };
  const used = new Set();
  let englishFunctions;
  for (const language of ['en', 'de']) {
    const { metadata, functions, paths, diagnostics, controls, parents } = buildLanguage(language);
    save(`src/data/historical/${language}-parents.json`, JSON.stringify(parents, null, 2) + '\n');
    save(`src/data/historical/${language}.ndjson`, paths.map(page => JSON.stringify(page)).join('\n') + '\n');
    if (language === 'en') {
      englishFunctions = new Set(paths.filter(page => page.function).map(page => `${page.path}:${page.title}`));
      save('src/data/historical/functions.json', JSON.stringify(functions, null, 2) + '\n');
    }
    for (const path of metadata.sourceFiles) used.add(path);
    report.languages[language] = {
      nodes: metadata.nodes, pages: paths.length, functions: functions.length,
      gfaTrapForms: paths.filter(page => page.function && page.bindings?.raw).length,
      additionalGfaTrapForms: paths.filter(page => page.function && page.bindings?.raw && !page.bindings?.gfa).length,
      ...diagnostics, controls,
      declarationsWithoutExactEnglishMatch: language === 'de' ? paths.filter(page =>
        page.function && !englishFunctions.has(`${page.path}:${page.title}`))
        .map(page => ({ title: page.title, path: page.path, href: page.href })) : undefined,
    };
    if (diagnostics.transcribedFigures.length !== 1) throw new Error(`Missing or duplicate ${language} TPA diagram`);
    console.log(`${language}: ${paths.length} UDO pages, ${functions.length} function records, ${diagnostics.findings.length} pages flagged for translation review`);
  }
  report.outOfCorpus = decode(git('ls-tree', '-r', '--name-only', tos.revision)).split('\n')
    .filter(path => /\.ui?$/.test(path) && !used.has(path));
  save('public/source/historical-report.json', JSON.stringify(report, null, 2) + '\n');

  const existing = readdirSync(join(root, assetFolder));
  for (const image of existing) {
    const path = `${assetFolder}/${image}`;
    if (!outputPaths.has(path)) throw new Error(`Remove stale historical image: ${path}`);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
