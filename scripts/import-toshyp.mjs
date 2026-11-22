import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { localResult, translationFindings } from './translation.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const json = path => JSON.parse(readFileSync(join(root, path), 'utf8'));
const { tos } = json('src/data/sources.json');
const { entries, references } = json('src/data/import-scope.json');
const reviews = json('src/data/translation-review.json');
const upstream = process.argv.slice(2).find(arg => arg !== '--check');
const check = process.argv.includes('--check');
if (!upstream) throw new Error('Usage: npm run import -- /path/to/tos.hyp [--check]');

function git(args, encoding) {
  return execFileSync('git', ['-C', upstream, ...args], { encoding, maxBuffer: 16 * 1024 * 1024 });
}

function save(path, data) {
  const output = join(root, path);
  if (check) {
    if (!readFileSync(output).equals(Buffer.from(data))) throw new Error(`Regenerate ${path}`);
    return;
  }
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, data);
}

const upstreamFile = path => git(['show', `${tos.revision}:${path}`]);
const decode = bytes => bytes.toString('latin1').replace(/\r\n/g, '\n')
  // Atari ST guillemets are used as delimiters around the operation title.
  .replaceAll('\u00af', '«').replaceAll('\u00ae', '»');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const sourceUrl = path => `https://github.com/${tos.repo}/blob/${tos.revision}/${path}`;
const stringify = data => JSON.stringify(data, null, 2) + '\n';

function branches(source) {
  const match = /^!iflang \[english\]\s*\n([\s\S]*?)^!else\s*\n([\s\S]*?)^!endif\s*$/m.exec(source);
  return match ? { en: match[1], de: match[2] } : {};
}

function inline(markup, html = false) {
  const value = markup.replaceAll('!-', '').replace(/\(!nolink \[([^\]]*)\]\)/g, '$1')
    .replaceAll('(!nl)', '\n');
  if (!html) return value.replace(/\(!(?:[BIbi])\)/g, '');
  const tags = { B: '<strong>', b: '</strong>', I: '<em>', i: '</em>' };
  return escape(value).replace(/\(!([BIbi])\)/g, (_, tag) => tags[tag]).replaceAll('\n', '<br>');
}

// Parse the structural UDO subset in this release. Unknown directives are errors,
// so an upstream syntax change cannot silently drop material from a published leaf.
function splitSections(source) {
  const nodes = [];
  let section;
  let sections;
  let depth = 0;
  let verbatim = false;
  for (const line of source.split('\n')) {
    if (line.startsWith('!begin_node ')) {
      sections = new Map();
      nodes.push(sections);
      section = undefined;
    } else if (/^\(!begin_liste\)|^\(!ende_liste\)|^!end_node|^!ignore_index/.test(line)) {
      section = undefined;
    } else if (line.startsWith('!item [') && depth === 0 && !verbatim) {
      const heading = inline(line.slice(7, -1)).replace(/:$/, '');
      if (sections.has(heading)) throw new Error(`Duplicate UDO section ${heading}`);
      section = [];
      sections.set(heading, section);
    } else if (section) {
      if (/^!begin_(?:xlist|itemize|table)/.test(line)) depth++;
      if (/^!end_(?:xlist|itemize|table)/.test(line)) depth--;
      if (line === '!begin_verbatim') verbatim = true;
      if (line === '!end_verbatim') verbatim = false;
      if (!verbatim && line.startsWith('#')) continue;
      section.push(line);
    } else if (line.trim() && !line.startsWith('#')) {
      throw new Error(`Unexpected UDO outside a section: ${line}`);
    }
  }
  if (depth || verbatim || nodes.length !== 2) throw new Error('Unexpected UDO node structure');
  return nodes;
}

function render(lines) {
  let paragraph = [];
  let result = '';
  let table = false;
  let verbatim = false;
  const lists = [];
  function flush() {
    if (!paragraph.length) return;
    const text = paragraph.join(' ').trim();
    if (text.includes('(!') && /\(!(?!(?:[BIbi]\)|nl\)|nolink \[))/g.test(text)) {
      throw new Error(`Unconverted UDO inline markup: ${text}`);
    }
    const declaration = /^(?:int32_t|\(!nolink \[PD\]\)|PD) \*?Pexec \(.*\);(?: \(!nl\))?$/;
    result += declaration.test(text)
      ? `<p><code>${escape(inline(text).trim())}</code></p>`
      : `<p>${inline(text, true)}</p>`;
    paragraph = [];
  }
  const grouped = lines.join('\n').replace(/(?:^!item \[\d+\]\n){2,}/gm, items =>
    `!item [${[...items.matchAll(/\[(\d+)\]/g)].map(match => match[1]).join(', ')}]\n`);
  for (const line of grouped.split('\n')) {
    if (line === '!end_verbatim') {
      verbatim = false;
      result += '</code></pre>';
    } else if (verbatim) {
      result += escape(line.trimEnd()) + '\n';
    } else if (line === '!begin_verbatim') {
      flush();
      verbatim = true;
      result += '<pre class="prm-code"><code>';
    } else if (line.startsWith('!begin_table')) {
      flush();
      result += '<div class="table-scroll"><table class="prm-rule-table">';
      table = true;
    } else if (line === '!end_table') {
      result += '</tbody></table></div>';
      table = false;
    } else if (table) {
      if (line === '!hline') continue;
      const header = result.endsWith('<table class="prm-rule-table">');
      const tag = header ? 'th' : 'td';
      const cells = line.split('!!');
      while (cells.length < 3) cells.push('');
      const row = `<tr>${cells.map(cell => `<${tag}${header ? ' scope="col"' : ''}>${inline(cell.trim(), true)}</${tag}>`).join('')}</tr>`;
      result += header ? `<thead>${row}</thead><tbody>` : row;
    } else if (/^!begin_(?:xlist|itemize)/.test(line)) {
      flush();
      const tag = line.startsWith('!begin_xlist') ? 'dl' : 'ul';
      lists.push({ tag, open: false });
      result += `<${tag} class="udo-list">`;
    } else if (line.startsWith('!item')) {
      flush();
      const list = lists.at(-1);
      if (!list) throw new Error('UDO item outside list');
      const label = line.match(/^!item \[(.*)\]\s*$/)?.[1];
      if (list.open) result += list.tag === 'dl' ? '</dd>' : '</li>';
      result += list.tag === 'dl' ? `<dt>${inline(label ?? '', true)}</dt><dd>` : '<li>';
      list.open = true;
    } else if (/^!end_(?:xlist|itemize)/.test(line)) {
      flush();
      const list = lists.pop();
      if (list.open) result += list.tag === 'dl' ? '</dd>' : '</li>';
      result += `</${list.tag}>`;
    } else if (line.startsWith('!label ')) {
      flush();
      const id = line.slice(7).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-$/, '');
      result += `<span id="${id}"></span>`;
    } else if (!line.trim()) {
      flush();
    } else if (line.startsWith('!')) {
      throw new Error(`Unconverted UDO directive: ${line}`);
    } else {
      paragraph.push(line.trim());
    }
  }
  flush();
  return result;
}

function seeAlso(lines) {
  return lines.join(' ').trim().split(/\s*~\s*/).map(part => {
    const match = /^\(!link \[([^\]]+)\]\s*\[([^\]]+)\]\)$/.exec(part);
    const [, label, target] = match ?? [null, part, part];
    if (target.startsWith('Bindings for ')) return { label, href: '#calling-convention' };
    const path = references[target];
    if (!path) throw new Error(`Unmapped cross-reference: ${target}`);
    upstreamFile(path);
    return { label, href: sourceUrl(path) };
  });
}

const records = {};
const qa = {};
for (const [name, { path, subsystem }] of Object.entries(entries)) {
  const bytes = upstreamFile(path);
  const { en, de } = branches(decode(bytes));
  if (!en || !de) throw new Error(`English or German source missing: ${path}`);
  const [sections, bindings] = splitSections(en);
  const lines = (map, section) => {
    if (!map.has(section)) throw new Error(`${name} lacks ${section}`);
    return map.get(section);
  };
  const text = (map, section) => inline(lines(map, section).join('\n')).trim();
  const assembly = bindings.has('Assembler') ? lines(bindings, 'Assembler')
    .filter(line => line !== '!begin_verbatim' && line !== '!end_verbatim').join('\n').trim() : null;
  const originalGfa = bindings.has('GFA-Basic') ? text(bindings, 'GFA-Basic') : null;
  const review = reviews[name];
  if (!review) throw new Error(`Missing translation review for ${name}`);
  if (review.example && originalGfa !== review.example.original) throw new Error(`Stale GFA edit in ${name}`);
  const gfa = review.example ? localResult(review.example) : originalGfa;
  const translated = review.example ? en.replace(review.example.original, gfa) : en;
  const findings = translationFindings(translated);
  const allowlist = review.allowlist ?? [];
  const sameFinding = (entry, finding) => entry.term === finding.term && entry.context === finding.context;
  for (const entry of allowlist) {
    if (!entry.reason || !findings.some(finding => sameFinding(entry, finding))) {
      throw new Error(`${path}: stale translation allowlist entry: ${entry.context}`);
    }
  }
  const untriaged = findings.filter(finding => !allowlist.some(entry => sameFinding(entry, finding)));
  if (untriaged.length) throw new Error(`${path}: untriaged translation or encoding findings\n${stringify(untriaged)}`);

  const modeLabels = branch => [...branch.matchAll(/^!item \[(\d+)\]/gm)].map(match => match[1]);
  const missingModes = modeLabels(de).filter(mode => !modeLabels(en).includes(mode));
  if (missingModes.length && review.status === 'verified') throw new Error(`${name}: modes missing from English`);
  const [, title, operation] = /^«(.+)» - (.+)$/.exec(text(sections, 'Name')) ?? [];
  if (!title || !operation) throw new Error(`${name}: operation title missing`);
  records[name] = {
    name, subsystem, title, operation, path, sha256: hash(bytes),
    syntax: text(sections, 'Syntax').replace(/\s+\n\s*/g, '\n'),
    opcode: text(sections, 'Opcode'),
    group: text(sections, 'Group'),
    description: render(lines(sections, 'Description')),
    returns: render(lines(sections, 'Return value').map(line =>
      line.replace(/^\(!B\)Return value:\(!b\) /, ''))),
    availability: render(lines(sections, 'Availability')),
    availabilityText: text(sections, 'Availability'),
    assembly, originalGfa, gfa,
    legacyBinding: bindings.has('Binding') ? render(lines(bindings, 'Binding')) : null,
    arrays: bindings.has('GEM-Arrays') ? render(lines(bindings, 'GEM-Arrays')) : null,
    bindingSyntax: text(bindings, 'C'),
    related: seeAlso(lines(sections, 'See also')),
    translation: review.status,
  };
  qa[name] = {
    path, status: review.status, missingModes, findings, allowlist, note: review.note,
    example: review.example,
  };
  save(`public/source/tos.hyp/${path}`, bytes);
}

const directories = ['bios', 'xbios', 'gemdos', 'gem/vdi', 'gem/aes'];
const paths = git(['ls-tree', '-r', '--name-only', tos.revision, '--', ...directories], 'utf8')
  .trim().split('\n').filter(path => /\.ui?$/.test(path));
const coverage = { revision: tos.revision, published: Object.keys(records), skipped: [], incomplete: [], other: [] };
for (const path of paths) {
  if (Object.values(entries).some(entry => entry.path === path)) continue;
  const source = decode(upstreamFile(path));
  const { en, de } = branches(source);
  // Inventory is conservative: entries with an API declaration or opcode marker
  // are counted as candidates even when they need unsupported UDO constructs.
  const api = /^!item \[(?:Syntax|Opcode|Deklaration|Gemdosnummer|AES-Nummer)[:\]]/im;
  if (!api.test(source)) {
    coverage.other.push(path);
  } else if (!en || !de || !api.test(en)) {
    coverage.incomplete.push(path);
  } else {
    coverage.skipped.push(path);
  }
}

save('public/source/tos.hyp/COPYING.GPL', upstreamFile('COPYING.GPL'));
save('public/source/tos.hyp/anhang/hilfe.u', upstreamFile('anhang/hilfe.u'));
save('src/data/toshyp.generated.json', stringify(records));
save('public/source/import-report.json', stringify({ ...coverage, translation: qa }));
console.log(`tos.hyp ${tos.revision}: ${coverage.published.length} converted, ${coverage.skipped.length} deferred API candidates, ${coverage.incomplete.length} incomplete branch structures, ${coverage.other.length} other UDO files`);
for (const [name, review] of Object.entries(qa)) {
  console.log(`${name}: ${review.status}${review.missingModes.length ? ` (missing English modes: ${review.missingModes.join(', ')})` : ''}`);
}
