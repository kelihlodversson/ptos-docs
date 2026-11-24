import { defaultTreeAdapter, parseFragment, serialize } from 'parse5';
import type { DefaultTreeAdapterTypes } from 'parse5';

type Tree = DefaultTreeAdapterTypes.DefaultTreeAdapterMap;
type Parent = Tree['parentNode'];
type Element = Tree['element'];

function elements(parent: Parent, name: string): Element[] {
  return parent.childNodes.filter((node): node is Element => 'tagName' in node && node.tagName === name);
}

export function readSsystemHistory(html: string) {
  const fragment = parseFragment(html);
  const tables = elements(fragment, 'div').flatMap(wrapper =>
    elements(wrapper, 'table').map(table => ({ wrapper, table })));
  if (tables.length !== 1) throw new Error('Expected one outer tos.hyp Ssystem mode table');
  const { wrapper, table } = tables[0];
  const [header, ...rows] = elements(table, 'tbody').flatMap(body => elements(body, 'tr'));
  if (!header || serialize(elements(header, 'td')[0]).trim().toLowerCase() !== 'mode') {
    throw new Error('Unexpected tos.hyp Ssystem table heading');
  }

  const modes = rows.map(row => {
    const cells = elements(row, 'td');
    const match = cells.length === 2 && /^([A-Z0-9_]+)\(0x([0-9a-f]{4})\)$/i.exec(serialize(cells[0]).trim());
    if (!match) throw new Error('Unexpected row in the tos.hyp Ssystem mode table');
    const code = Number.parseInt(match[2], 16);
    return { name: match[1], number: code < 0x8000 ? code : code - 0x10000, meaning: cells[1] };
  });
  const names = new Set(modes.map(mode => mode.name));
  if (names.size !== modes.length) throw new Error('Duplicate tos.hyp Ssystem mode');
  const wrapperIndex = fragment.childNodes.indexOf(wrapper);
  return {
    intro: serialize({ ...fragment, childNodes: fragment.childNodes.slice(0, wrapperIndex) }),
    notes: serialize({ ...fragment, childNodes: fragment.childNodes.slice(wrapperIndex + 1) }),
    modes: modes.map(({ name, number, meaning }) => {
      // UDO leaves the anchor for the next mode at the end of the preceding cell.
      // The combined table puts each of those anchors on its own row.
      for (const anchor of elements(meaning, 'a')) {
        if (anchor.attrs.some(attr => attr.name === 'id' && names.has(attr.value))) {
          defaultTreeAdapter.detachNode(anchor);
        }
      }
      return { name, number, meaning: serialize(meaning) };
    }),
  };
}
