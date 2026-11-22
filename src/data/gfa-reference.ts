import documented from './gfa-builtins.json';

export interface GfaBuiltin {
  signature: string;
  page: number;
  subsystem: string;
  note?: string;
}

export interface GfaTrap {
  routine: 'GEMDOS' | 'BIOS' | 'XBIOS';
  opcode: number;
  args: { width: 'W' | 'L'; operand: string }[];
}

export const gfaSource = {
  title: 'The GFA-Basic Compendium',
  originalAuthor: 'GFA Systemtechnik GmbH',
  portCredits: 'Lonny Pursell and ENCOM',
  hypertextVersion: '2.84',
  url: 'http://bafo.free.fr/',
  sha256: 'd7b0fa22049091079c9357b7779f1cf51b59e0a85a752c39b10beb54a7d3dd7a',
};

export const gfaBuiltins: Readonly<Record<string, GfaBuiltin>> = documented;
export const gfaCustomExamples: Readonly<Record<string, number>> = {
  APPL_GETINFO: 31, APPL_SEARCH: 31, APPL_YIELD: 31,
  MENU_ATTACH: 32, MENU_ISTART: 32, MENU_POPUP: 32, MENU_SETTINGS: 32,
  OBJC_SYSVAR: 32, FSEL_EXINPUT: 33, WIND_NEW: 34, RSRC_RCFIX: 34,
};
export const gfaPath = '/gfa-basic/';

export function trapExample(trap: GfaTrap, discardResult = false) {
  const args = trap.args.map(({ width, operand }, index) => {
    const constant = /^#(-?\d+|\$[0-9a-f]+)$/i.exec(operand)?.[1];
    const value = constant ? constant.replace(/^\$/, '&H') : `Arg${index + 1}%`;
    return `${width}:${value}`;
  });
  const parameters = [`&H${trap.opcode.toString(16).toUpperCase()}`, ...args].join(',');
  return `${discardResult ? '~' : 'Result%='}${trap.routine}(${parameters})`;
}
