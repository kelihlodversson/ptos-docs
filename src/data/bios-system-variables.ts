import { serialize } from 'parse5';
import { readHistoricalTable, takeTrailingAnchors } from './historical-table.ts';

export function readBiosSystemVariables(html: string) {
  const { heading, rows, intro, notes } = readHistoricalTable(html, 'BIOS system variables');
  if (heading.length !== 2 || serialize(heading[0]).replaceAll('&nbsp;', ' ').trim().replace(/\s+/g, ' ') !== 'Variable Address') {
    throw new Error('Unexpected tos.hyp BIOS system variables table heading');
  }
  let previous = heading[1];
  const variables = rows.map(cells => {
    const match = cells.length === 2 &&
      /^(\w+)\s+(.+?)\s+(0x[\da-f]+)$/i.exec(serialize(cells[0]).replaceAll('&nbsp;', ' ').trim());
    if (!match) throw new Error('Unexpected row in the tos.hyp BIOS system variables table');
    const anchors = takeTrailingAnchors(previous);
    previous = cells[1];
    return { name: match[1], type: match[2], address: match[3], anchors, description: cells[1] };
  });
  return {
    intro, notes,
    variables: variables.map(variable => ({ ...variable, description: serialize(variable.description) })),
  };
}
