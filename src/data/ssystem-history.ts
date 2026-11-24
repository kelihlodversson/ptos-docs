import { defaultTreeAdapter, serialize } from 'parse5';
import { elements, readHistoricalTable } from './historical-table.ts';

export function readSsystemHistory(html: string) {
  const { heading, rows, intro, notes } = readHistoricalTable(html, 'Ssystem');
  if (serialize(heading[0]).trim().toLowerCase() !== 'mode') {
    throw new Error('Unexpected tos.hyp Ssystem table heading');
  }

  const modes = rows.map(cells => {
    const match = cells.length === 2 && /^([A-Z0-9_]+)\(0x([0-9a-f]{4})\)$/i.exec(serialize(cells[0]).trim());
    if (!match) throw new Error('Unexpected row in the tos.hyp Ssystem mode table');
    const code = Number.parseInt(match[2], 16);
    return { name: match[1], number: code < 0x8000 ? code : code - 0x10000, meaning: cells[1] };
  });
  const names = new Set(modes.map(mode => mode.name));
  if (names.size !== modes.length) throw new Error('Duplicate tos.hyp Ssystem mode');
  return {
    intro, notes,
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
