export const targets = [
  ['68k', '68k'],
  ['arm', 'ARM'],
  ['x32', 'x32'],
  ['gfa', 'GFA BASIC'],
] as const;
export type Target = typeof targets[number][0];
export type CPU = Exclude<Target, 'gfa'>;
