import { defaultTreeAdapter, parseFragment, serialize } from 'parse5';
import type { DefaultTreeAdapterTypes } from 'parse5';

type Tree = DefaultTreeAdapterTypes.DefaultTreeAdapterMap;
type Element = Tree['element'];

export function elements(parent: Tree['parentNode'], name: string): Element[] {
  return parent.childNodes.filter((node): node is Element => 'tagName' in node && node.tagName === name);
}

export function takeTrailingAnchors(cell: Element) {
  const anchors: string[] = [];
  // UDO can emit the anchors for a row at the end of the previous cell.
  for (const child of [...cell.childNodes].reverse()) {
    if (defaultTreeAdapter.isTextNode(child) && !child.value.trim()) continue;
    if (!defaultTreeAdapter.isElementNode(child) || child.tagName !== 'a' || child.childNodes.length) break;
    const id = child.attrs.find(attr => attr.name === 'id');
    if (!id) break;
    anchors.unshift(id.value);
    defaultTreeAdapter.detachNode(child);
  }
  return anchors;
}

export function readHistoricalTable(html: string, section: string) {
  const fragment = parseFragment(html);
  const tables = elements(fragment, 'div').flatMap(wrapper =>
    elements(wrapper, 'table').map(table => ({ wrapper, table })));
  if (tables.length !== 1) throw new Error(`Expected one outer tos.hyp table for ${section}`);
  const { wrapper, table } = tables[0];
  const [heading, ...rows] = elements(table, 'tbody')
    .flatMap(body => elements(body, 'tr').map(row => elements(row, 'td')));
  if (!heading?.length || !rows.length) throw new Error(`Empty tos.hyp table for ${section}`);
  const wrapperIndex = fragment.childNodes.indexOf(wrapper);
  return {
    heading, rows,
    intro: serialize({ ...fragment, childNodes: fragment.childNodes.slice(0, wrapperIndex) }),
    notes: serialize({ ...fragment, childNodes: fragment.childNodes.slice(wrapperIndex + 1) }),
  };
}
