import { defaultTreeAdapter as tree, html, parseFragment, serialize } from 'parse5';
import type { DefaultTreeAdapterTypes } from 'parse5';
import type { Edition } from './historical.ts';
import { elements as direct, takeTrailingAnchors } from './historical-table.ts';

type Tree = DefaultTreeAdapterTypes.DefaultTreeAdapterMap;
type Node = Tree['childNode'];
type Element = Tree['element'];
type Parent = Tree['parentNode'];

function* descendants(parent: Parent): Generator<Node> {
  for (const child of parent.childNodes) {
    yield child;
    if (tree.isElementNode(child)) yield* descendants(child);
  }
}

const cells = (row: Element) => row.childNodes.filter((node): node is Element =>
  tree.isElementNode(node) && (node.tagName === 'td' || node.tagName === 'th'));
const textNodes = (parent: Parent) => [...descendants(parent)].filter(tree.isTextNode);
const rawText = (parent: Parent) => textNodes(parent).map(node => node.value).join('');
const clean = (text: string) => text.replace(/\s+/g, ' ').trim();
const label = (cell: Element) => clean(rawText(cell));
const attr = (element: Element, name: string) => element.attrs.find(item => item.name === name)?.value;

function setAttr(element: Element, name: string, value: string) {
  const previous = element.attrs.find(item => item.name === name);
  if (previous) previous.value = value;
  else element.attrs.push({ name, value });
}

function element(tag: string, text = '') {
  const node = tree.createElement(tag, html.NS.HTML, []);
  tree.insertText(node, text);
  return node;
}

function removeText(cell: Element, start: number, length: number) {
  let offset = 0;
  for (const node of textNodes(cell)) {
    const end = offset + node.value.length;
    if (start < end && start + length > offset) {
      node.value = node.value.slice(0, Math.max(start - offset, 0)) + node.value.slice(Math.max(start + length - offset, 0));
    }
    offset = end;
  }
}

function setLabel(cell: Element, value: string) {
  const text = textNodes(cell);
  if (!text.length) tree.insertText(cell, value);
  else {
    text[0].value = value;
    for (const node of text.slice(1)) node.value = '';
  }
}

function header(cell: Element, scope: 'col' | 'row') {
  cell.tagName = cell.nodeName = 'th';
  setAttr(cell, 'scope', scope);
}

const headings = new Set(`
access by|address|adresse|aes|alignment|argument|art|ascii|attribute|ausrichtung|author|autor|
availability|backgrnd.|bedeutung|bedeutung für gesetzte bits|bedeutung in magic mac|bedeutung symbole|
befehl|bemerkung|beschreibung|betriebssystem|bezeichnung|bit|bits|bytes|c|c-sequence|c-sequenz|cause|
channel|character|code|colour|colour index|command|comment|contents|cookie|data type|date|datum|dec|
definition|description|deutschland|device|dez|disktype|display mode|dll_id|dom|driveno|driver type|drv|
effect|effect of the call|eingabe|element|element (value)|entry|exception|execflag|exist in|farbe|field|
file|flag|font type|fontart|foregrnd.|format|from version|func|function|function name|function number|
funktion|gdos type|gemdos|gemdos error|gemdos-fehler|germany|gerät|group|größe|handle|handler|hex|
hex value|hex-wert|hintergr.|icon|id|identifier|info_select|info_string|input|instruction|
instruction name|intout[0]|kanal|kategorie|key presses|kind|kommando|komponente|language|length|library|
lim|länge|manufacturer/distributor|mask|me_bshow|meaning|meaning for set bits|meaning in magic mac|
meaning symbole|memory size|message|mode|n|nachricht|name|name of function|nr.|number|nummer|offset|
opcode|operating system|operation|option|others|parameter|pid|pin|pixel value|position|present|
present in|processor|program|program name|programm|protokoll|prozessor|range|register|remark|rwflag-bit|
sa_handler|scancode|screen saver|selector|semaphore|set by|sh_wdoex|sh_wdoex bit|sh_wiscr|sh_wisgr|
sharing|signal|size|sprache|src_inter|standard rgb values|standard rgb-werte|standard value|
standard vdi code|state description|state meaning|status|subcode|suffix|symbol|symbole|system vector|
tasten-kombination|time|tos|typ|type|usa|value|value range|variable|variants|vdi format|vdi-format|
vector|vektor|version|vordergr.|wert|wert bereich kommentar|what|width|wirkung|wirkung des aufrufs|
work_out|workstation|x|xor format|xor-format|zeichen|zugriff durch|zustand bedeutung
`.trim().split(/\s*\|\s*/));
const signedNumber = '[+−-]?(?:0x[\\da-fA-F]+|\\$[\\da-fA-F]+|\\d+)';
const numberAndName = new RegExp(`^\\s*(${signedNumber})\\s+(.+?)\\s*$`, 's');
const nameAndCode = new RegExp(`([A-Za-z_][\\w-]*)\\s+\\((${signedNumber})\\)`, 'g');
const enumAndCode = new RegExp(`^\\s*((?!(?:WORD|LONG|BYTE|BIT|ARGUMENT)\\b)[A-Z][A-Z_\\d]+)\\s+(${signedNumber})\\s*$`);
const plainName = /^\s*[A-Za-z_][\w-]*\s*$/;
const numberRange = /^\s*\d+ (?:to|bis) \d+\s*$/i;
const variableParts = /^\s*([A-Za-z_][\w]*)\s+(.+?)\s+(0x[\da-fA-F]+)\s*$/s;
const vectorParts = /^(BYTE|WORD|LONG)\s+(\$[\da-fA-F]+)(?:\s*-\s*\1\s+(\$[\da-fA-F]+))?$/;
const compact = /^[\p{L}\p{N}_$+−.:[\]()/&'"#@%<>-]+$/u;
const combinedLabels = /^(?:no\. name|nr\. bezeichnung|number name|nummer name|code name|(?:type|n) (?:meaning|bedeutung)|variable (?:address|adresse))$/;

function hasHeadings(labels: string[]) {
  if (labels.length < 2) return false;
  const named = labels.filter(Boolean);
  return named.length >= 2 && named.every(value => headings.has(value) || combinedLabels.test(value));
}

function cacheHeader(row: Element, labels: string[], german: boolean) {
  if (labels.join('|') !== '||020|030|040|060|cfv4e') return false;
  const [bit, operation] = cells(row);
  setLabel(bit, 'Bit');
  setLabel(operation, german ? 'Funktion' : 'Operation');
  return true;
}

function blank(row: Element) {
  return !label(row) && ![...descendants(row)].some(node => tree.isElementNode(node) &&
    ['img', 'svg', 'input', 'table'].includes(node.tagName));
}

function removeBlankRows(rows: Element[], start: number) {
  let next = start;
  while (next < rows.length && blank(rows[next])) next++;
  if (next === rows.length || next === start) return;
  const firstCell = cells(rows[next])[0];
  if (!firstCell) return;
  const before = firstCell.childNodes[0];
  for (const row of rows.splice(start, next - start)) {
    for (const anchor of [row, ...descendants(row)].filter((node): node is Element =>
      tree.isElementNode(node) && attr(node, 'id') !== undefined)) {
      const existing = element('span');
      setAttr(existing, 'id', attr(anchor, 'id')!);
      if (before) tree.insertBefore(firstCell, existing, before);
      else tree.appendChild(firstCell, existing);
    }
    tree.detachNode(row);
  }
}

function addHeading(table: Element, body: Element, labelList: string[]) {
  const head = element('thead');
  const row = element('tr');
  tree.insertBefore(table, head, body);
  tree.appendChild(head, row);
  for (const name of labelList) {
    const cell = element('th', name);
    setAttr(cell, 'scope', 'col');
    tree.appendChild(row, cell);
  }
  return row;
}

function moveHeading(table: Element, body: Element, row: Element) {
  const head = element('thead');
  tree.insertBefore(table, head, body);
  tree.detachNode(row);
  tree.appendChild(head, row);
  for (const cell of cells(row)) header(cell, attr(cell, 'scope') === 'row' ? 'row' : 'col');
}

function splitNumber(row: Element, cell: Element, hit: RegExpExecArray | null) {
  const number = element('td', hit?.[1] ?? '');
  if (hit) removeText(cell, 0, hit[0].indexOf(hit[2], hit[0].indexOf(hit[1]) + hit[1].length));
  tree.insertBefore(row, number, cell);
}

function splitNumberHeading(row: Element, cell: Element, number: string, name: string) {
  const first = element('td', number);
  tree.insertBefore(row, first, cell);
  setLabel(cell, name);
}

function splitPairs(headerRow: Element, rows: Element[], number: string, symbol: string) {
  splitNumberHeading(headerRow, cells(headerRow)[0], number, symbol);
  splitNumberRows(rows);
}

function splitNumberRows(rows: Element[]) {
  for (const row of rows) {
    const first = cells(row)[0];
    splitNumber(row, first, numberAndName.exec(rawText(first)));
    header(first, 'row');
  }
}

function splitVariables(headerRow: Element, rows: Element[], german: boolean) {
  const [first, description] = cells(headerRow);
  let previous = description;
  setLabel(first, german ? 'Typ' : 'Type');
  tree.insertBefore(headerRow, element('td', 'Variable'), first);
  tree.insertBefore(headerRow, element('td', german ? 'Adresse' : 'Address'), first);
  for (const row of rows) {
    const type = cells(row)[0];
    const raw = rawText(type);
    const hit = variableParts.exec(raw);
    if (hit) {
      const name = element('th', hit[1]);
      header(name, 'row');
      for (const id of takeTrailingAnchors(previous)) {
        const anchor = element('span');
        setAttr(anchor, 'id', id);
        tree.insertBefore(name, anchor, name.childNodes.at(-1)!);
      }
      tree.insertBefore(row, name, type);
      tree.insertBefore(row, element('td', hit[3]), type);
      removeText(type, raw.lastIndexOf(hit[3]), hit[3].length);
      removeText(type, 0, raw.indexOf(hit[1]) + hit[1].length);
    } else {
      tree.insertBefore(row, element('td'), type);
      tree.insertBefore(row, element('td'), type);
    }
    previous = cells(row).at(-1)!;
  }
}

function splitNAes(headerRow: Element, rows: Element[], german: boolean) {
  const original = cells(headerRow);
  splitNumberHeading(headerRow, original[0], german ? 'N.AES-Nummer' : 'N.AES number', german ? 'N.AES-Symbol' : 'N.AES symbol');
  splitNumberHeading(headerRow, original[1], german ? 'GEMDOS-Nummer' : 'GEMDOS number', german ? 'GEMDOS-Symbol' : 'GEMDOS symbol');
  for (const row of rows) {
    const first = cells(row).slice(0, 2);
    for (const cell of first) splitNumber(row, cell, numberAndName.exec(rawText(cell)));
  }
}

function splitVectors(table: Element, body: Element, headerRow: Element | undefined, rows: Element[], german: boolean) {
  if (headerRow) splitNumberHeading(headerRow, cells(headerRow)[0], german ? 'Adresse' : 'Address', german ? 'Typ' : 'Type');
  else addHeading(table, body, german ? ['Adresse', 'Typ', 'Beschreibung'] : ['Address', 'Type', 'Description']);
  for (const row of rows) {
    const first = cells(row)[0];
    const hit = vectorParts.exec(label(first));
    tree.insertBefore(row, element('td', hit?.slice(2).filter(Boolean).join('–') ?? ''), first);
    if (hit) setLabel(first, hit[1]);
  }
}

function symbolValues(text: string) {
  const pairs = [...text.matchAll(nameAndCode)];
  if (pairs.length && !text.replace(nameAndCode, '').replaceAll(',', '').trim()) return pairs;
  const pair = enumAndCode.exec(text);
  return pair ? [pair] : [];
}

function splitSymbols(table: Element, body: Element, headRow: Element | undefined, rows: Element[], german: boolean, equalsColumn: boolean) {
  if (headRow) {
    const first = cells(headRow)[0];
    tree.insertBefore(headRow, element('td', german ? 'Wert' : 'Value'), cells(headRow)[1]);
    if (label(first).toLowerCase() === 'function number') setLabel(first, german ? 'Funktion' : 'Function');
    if (/^(number|nummer|nr\.)$/i.test(label(first))) setLabel(first, 'Symbol');
  } else addHeading(table, body, german ? ['Symbol', 'Wert', 'Beschreibung'] : ['Symbol', 'Value', 'Description']);
  for (const row of rows) {
    const [first, second] = cells(row);
    const text = rawText(first);
    const pairs = symbolValues(text);
    const value = numberRange.test(text) ? label(first) : pairs.map(pair => pair[2]).join(', ');
    for (const pair of pairs.reverse()) {
      const endOfName = pair[0].indexOf(pair[1]) + pair[1].length;
      removeText(first, pair.index + endOfName, pair[0].length - endOfName);
    }
    if (value && pairs.length === 0) setLabel(first, '');
    tree.insertBefore(row, element('td', value), second);
    if (equalsColumn) tree.detachNode(second);
    header(first, 'row');
  }
}

function wrapTable(table: Element, german: boolean) {
  const parent = tree.getParentNode(table);
  if (!parent || tree.isElementNode(parent) && attr(parent, 'class')?.split(/\s+/).includes('table-scroll')) return;
  const wrapper = element('div');
  setAttr(wrapper, 'class', 'table-scroll');
  setAttr(wrapper, 'role', 'region');
  setAttr(wrapper, 'tabindex', '0');
  setAttr(wrapper, 'aria-label', direct(table, 'caption').map(label)[0] || (german ? 'Referenztabelle' : 'Reference table'));
  tree.insertBefore(parent, wrapper, table);
  tree.detachNode(table);
  tree.appendChild(wrapper, table);
}

function splitAscii(table: Element, headRow: Element, rows: Element[], german: boolean) {
  const parent = tree.getParentNode(table);
  if (!parent) return;
  const group = element('div');
  setAttr(group, 'class', 'ascii-table-groups');
  const rowCells = [headRow, ...rows].map(cells);
  tree.insertBefore(parent, group, table);
  for (let start = 0; start < 12; start += 3) {
    const tile = element('table');
    setAttr(tile, 'class', attr(table, 'class') ?? 'prm-rule-table');
    if (start === 0 && attr(table, 'id')) setAttr(tile, 'id', attr(table, 'id')!);
    const range = [rowCells[1][start], rowCells.at(-1)![start]].map(cell => `0x${label(cell).toUpperCase()}`).join('–');
    tree.appendChild(tile, element('caption', range));
    const head = element('thead'), body = element('tbody');
    tree.appendChild(tile, head);
    tree.appendChild(tile, body);
    for (const [index, sourceCells] of rowCells.entries()) {
      const row = element('tr');
      if (start === 0) {
        const sourceRow = index ? rows[index - 1] : headRow;
        if (attr(sourceRow, 'id')) setAttr(row, 'id', attr(sourceRow, 'id')!);
      }
      for (const cell of sourceCells.slice(start, start + 3)) {
        if (!index) header(cell, 'col');
        tree.detachNode(cell);
        tree.appendChild(row, cell);
      }
      tree.appendChild(index ? body : head, row);
    }
    tree.appendChild(group, tile);
    formatCells(tile);
    wrapTable(tile, german);
  }
  tree.detachNode(table);
  if (tree.isElementNode(parent) && attr(parent, 'class') === 'table-scroll' && !attr(parent, 'id')) {
    const outer = tree.getParentNode(parent);
    if (outer) {
      tree.detachNode(group);
      tree.insertBefore(outer, group, parent);
      tree.detachNode(parent);
    }
  }
}

function formatCells(table: Element) {
  for (const section of table.childNodes.filter(tree.isElementNode)) {
    if (!['thead', 'tbody', 'tfoot'].includes(section.tagName)) continue;
    for (const row of direct(section, 'tr')) {
      for (const cell of cells(row)) {
        const value = label(cell);
        if (!value) continue;
        const content = [...descendants(cell)];
        if (content.some(node => tree.isElementNode(node) && ['table', 'pre'].includes(node.tagName))) continue;
        const singleLine = !content.some(node => tree.isElementNode(node) && node.tagName === 'br');
        const kind = singleLine && value.length <= 70 && compact.test(value) ? 'table-token'
          : value.length >= 85 && /\s/.test(value) ? 'table-prose' : undefined;
        if (kind) setAttr(cell, 'class', [attr(cell, 'class'), kind].filter(Boolean).join(' '));
      }
    }
  }
}

function normalizeTable(table: Element, german: boolean) {
  const bodies = direct(table, 'tbody');
  const explicitHead = direct(table, 'thead')[0];
  const existingRows = bodies.flatMap(section => direct(section, 'tr'));
  const spansRows = existingRows.some(row => cells(row).some(cell => attr(cell, 'rowspan') !== undefined));
  if (bodies.length === 1 && existingRows.length && !spansRows) {
    const [body] = bodies;
    const rows = [...existingRows];
    removeBlankRows(rows, 0);
    const first = rows[0];
    if (first && !explicitHead && rows.length > 1) {
      const labels = cells(first).map(cell => label(cell).toLowerCase());
      const columns = labels.length;
      const topHasHeaders = cells(first).some(cell => cell.tagName === 'th' && attr(cell, 'scope') !== 'row');
      const headRow = hasHeadings(labels) || topHasHeaders || cacheHeader(first, labels, german) ? first : undefined;
      if (headRow) removeBlankRows(rows, 1);
      const data = headRow ? rows.slice(1) : rows;
      const rectangular = data.every(row => cells(row).length === columns &&
        cells(row).every(cell => attr(cell, 'colspan') === undefined));
      if (rectangular && columns === 12 && labels.every((name, i) =>
        i % 3 === 0 ? name === 'hex' : i % 3 === 1 ? ['dec', 'dez'].includes(name) : name === 'ascii')) {
        splitAscii(table, first, data, german);
        return;
      }
      if (rectangular && headRow && columns === 2 && /^variable (address|adresse)$/.test(labels[0])) {
        splitVariables(headRow, data, german);
      } else if (rectangular && headRow && columns === 2 && combinedLabels.test(labels[0])) {
        const number = labels[0] === 'code name' ? 'Code' : german ? 'Nummer' : 'Number';
        const field = /^(type|n) (meaning|bedeutung)$/.exec(labels[0]);
        splitPairs(headRow, data, field?.[1] ?? number, field ? (german ? 'Bedeutung' : 'Meaning') : 'Name');
      } else if (rectangular && headRow && columns === 3 && /^gemdos[ -](?:error|fehler)$/.test(labels[1])) {
        splitNAes(headRow, data, german);
      } else if (rectangular && data.length >= 3) {
        const firstValues = data.filter(row => !blank(row)).map(row => label(cells(row)[0]));
        const equalsColumn = !headRow && columns === 3 && data.every(row => serialize(cells(row)[1]).trim() === '=');
        const symbolColumn = firstValues.map(symbolValues);
        if (columns === 2 && firstValues.every(value => vectorParts.test(value) || value === ':') && firstValues.some(value => vectorParts.test(value))) {
          splitVectors(table, body, headRow, data, german);
        } else if ((columns === 2 || equalsColumn || headRow && columns === 3) &&
          symbolColumn.filter(values => values.length).length >= Math.max(3, Math.ceil(firstValues.length * .6)) &&
          firstValues.every((value, i) => symbolColumn[i].length || plainName.test(value) || numberRange.test(value))) {
          splitSymbols(table, body, headRow, data, german, equalsColumn);
        } else if (columns === 2 && !headRow && firstValues.length >= 3 &&
          (firstValues.every(value => /^\d+ SEM_[A-Z_]+$/.test(value)) ||
            firstValues[0] === '1 installed' && firstValues.every(value => /^\d+ [A-Za-z_]\w*$/.test(value)))) {
          addHeading(table, body, german ? ['Nummer', 'Name', 'Bedeutung'] : ['Number', 'Name', 'Meaning']);
          splitNumberRows(data);
        }
      }
      if (headRow) moveHeading(table, body, headRow);
    }
  }
  formatCells(table);
  wrapTable(table, german);
}

// Format the rendered excerpt. The imported UDO records remain the source for reproduction and cross-references.
export function formatHistoricalTables(html: string | null | undefined, language: Edition = 'en') {
  if (!html?.includes('<table')) return html;
  const fragment = parseFragment(html);
  const tables = [...descendants(fragment)].filter((node): node is Element => tree.isElementNode(node) && node.tagName === 'table');
  for (const table of tables.reverse()) normalizeTable(table, language === 'de');
  return serialize(fragment);
}
