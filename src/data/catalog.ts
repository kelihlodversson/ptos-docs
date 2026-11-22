import imported from './toshyp.generated.json';
import revisions from './sources.json';

export { targets } from './targets';
export type { Target, CPU } from './targets';
export type Status = 'implemented' | 'experimental' | 'planned' | 'unsupported' | 'unverified';

export const statusLabels: Record<Status, string> = {
  implemented: 'Implemented',
  experimental: 'Experimental',
  planned: 'Planned',
  unsupported: 'Unsupported',
  unverified: 'Unverified',
};

export const subsystems = [
  { slug: 'bios', name: 'BIOS', summary: 'Basic I/O and system vectors' },
  { slug: 'xbios', name: 'XBIOS', summary: 'Extended hardware services' },
  { slug: 'gemdos', name: 'GEMDOS', summary: 'Files, memory and processes' },
  { slug: 'vdi', name: 'VDI', summary: 'Virtual Device Interface' },
  { slug: 'aes', name: 'AES', summary: 'Application Environment Services' },
  { slug: 'ptos', name: 'pTOS', summary: 'pTOS extensions and native ABI' },
];

export type Source = [keyof typeof revisions, string, string];
export function sourceLink([key, path, label]: Source) {
  const { repo, revision } = revisions[key];
  return { href: `https://github.com/${repo}/blob/${revision}/${path}`, label, revision, path };
}

export const historical = imported;
export type Historical = typeof imported[keyof typeof imported];
export const referencePath = (name: string) => `/reference/${name.toLowerCase()}/`;

export const catalog = [
  ...Object.values(imported).map(record => ({
    name: record.name, description: record.operation, subsystem: record.subsystem,
    group: record.group, href: referencePath(record.name),
  })),
  { name: 'Ssystem', description: 'Read console dimensions with S_CONSOLE_DIM', subsystem: 'pTOS',
    group: 'GEMDOS extensions', href: referencePath('Ssystem') },
  { name: 'CUIS ABI', description: 'Private x32 syscall selector and session query', subsystem: 'pTOS',
    group: 'Native ABI', href: '/abi/cuis/' },
  { name: 'ELF32 process entry', description: 'Initial stack for dynamically interpreted ELF programs',
    subsystem: 'pTOS', group: 'Native ABI', href: '/abi/elf-entry/' },
].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase(), 'en'));

export const upstreamSubsystems: Record<string, string> = {
  BIOS: 'e_bios.u', XBIOS: 'e_xbios.u', VDI: 'e_vdi.u', GEMDOS: 'e_gemdos.u', AES: 'e_aes.u',
};
