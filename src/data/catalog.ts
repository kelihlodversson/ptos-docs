import imported from './toshyp.generated.json';
import revisions from './sources.json';
import { nativeCalls, nativePath } from './native-calls';
import { records } from './historical';
import type { HistoricalFunction } from './historical';
import { chapterLocation, elfEntryPath, location, nativeSection } from './manual-structure';

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

export type Source = [keyof typeof revisions, string, string];
export function sourceLink([key, path, label]: Source) {
  const { repo, revision } = revisions[key];
  return { href: `https://github.com/${repo}/blob/${revision}/${path}`, label, revision, path };
}

export const historical = imported;
export type Historical = typeof imported[keyof typeof imported];
export const referencePath = (name: string) => `/reference/${name.toLowerCase()}/`;

const importedFunctions = records<HistoricalFunction[]>('functions.json');
const migratedFunctions = new Set([...Object.keys(imported), 'Ssystem', ...nativeCalls.map(call => call.name)]);
const functionByName = new Map(importedFunctions.map(entry => [entry.name, entry]));
const historicalLocation = (href: string) => location(href.split('/')[3]);
const nativeLocation = (name: string) => chapterLocation('gemdos', nativeSection(name));

export const catalog = [
  ...importedFunctions.filter(entry => !migratedFunctions.has(entry.name))
    .map(entry => ({ ...entry, ...historicalLocation(entry.historicalHref) })),
  ...nativeCalls.map(call => ({
    name: call.name, description: call.title, subsystem: 'GEMDOS', ...nativeLocation(call.name), href: nativePath(call.name),
  })),
  ...Object.values(imported).map(record => ({
    name: record.name, description: record.operation, subsystem: record.subsystem,
    ...historicalLocation(functionByName.get(record.name)!.historicalHref), href: referencePath(record.name),
  })),
  { name: 'Ssystem', description: 'Read console dimensions with S_CONSOLE_DIM', subsystem: 'GEMDOS',
    ...nativeLocation('Ssystem'), href: referencePath('Ssystem') },
  { name: 'CUIS ABI', description: 'Private x32 syscall selector and session query', subsystem: 'AES',
    ...chapterLocation('aes', 'cuis'), href: '/abi/cuis/', kind: 'abi' as const },
  { name: 'ELF32 process entry', description: 'Initial stack for dynamically interpreted ELF programs',
    subsystem: 'pTOS', ...chapterLocation('ptos', 'elf-entry'), href: elfEntryPath, kind: 'abi' as const },
].map(entry => ({ ...entry, group: entry.section?.name ?? entry.chapter?.name ?? entry.subsystem }))
  .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase(), 'en'));

export const referenceLocation = (name: string) => catalog.find(entry => entry.name === name && entry.href.startsWith('/reference/'));

export function historicalReference(label: string, href: string) {
  const section = { 'ARGV procedure': 'argv-procedure', 'Program flags': 'the-program-flags' }[label];
  if (section) return `/historical/en/${section}/`;
  return importedFunctions.find(entry => entry.name === label)?.historicalHref ?? href;
}
