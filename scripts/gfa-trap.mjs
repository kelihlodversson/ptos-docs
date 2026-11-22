const routineByTrap = new Map([[1, 'GEMDOS'], [13, 'BIOS'], [14, 'XBIOS']]);
const number = token => token?.startsWith('$') ? Number.parseInt(token.slice(1), 16) : Number(token);

// Only turn a literal 68k stack binding into a BASIC form if we can account
// for the opcode, every push, the trap class and the exact stack adjustment.
export function gfaTrap(assembly) {
  const lines = assembly.split('\n').map(line => line.split(';', 1)[0].trim()).filter(Boolean);
  const trap = routineByTrap.get(number(/^trap\s+#(\$[a-f\d]+|\d+)$/i.exec(lines.at(-2))?.[1]));
  const opcode = number(/^move\.w\s+#(\$[a-f\d]+|\d+)\s*,\s*-\(sp\)$/i.exec(lines.at(-3))?.[1]);
  const cleanup = /^(?:addq?\.l\s+#(\$[a-f\d]+|\d+)|lea\s+(\$[a-f\d]+|\d+)\(sp\))\s*,\s*sp$/i.exec(lines.at(-1));
  if (!trap || !Number.isInteger(opcode) || opcode > 0xffff || !cleanup) return undefined;

  const args = [];
  for (const line of lines.slice(0, -3).reverse()) {
    const move = /^move\.([wl])\s+([^,]+)\s*,\s*-\(sp\)$/i.exec(line);
    const pea = /^pea\s+(.+)$/i.exec(line);
    const operand = (move?.[2] ?? pea?.[1] ?? '').trim();
    if (pea && operand.startsWith('#')) return undefined;
    if (/^(?:[ad][0-7]|sp|usp|sr|ccr|pc)$/i.test(operand) ||
        !/^(?:[a-z_][a-z_0-9]*|#(?:-?\d+|\$[a-f\d]+))$/i.test(operand)) return undefined;
    args.push({ width: move?.[1].toUpperCase() ?? 'L', operand });
  }
  const bytes = args.reduce((total, arg) => total + (arg.width === 'W' ? 2 : 4), 2);
  if (number(cleanup[1] ?? cleanup[2]) !== bytes) return undefined;
  return { routine: trap, opcode, args };
}
