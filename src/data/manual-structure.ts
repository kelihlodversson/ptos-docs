import { pages, records } from './historical';
import type { Edition } from './historical';

export const historicalPath = (language: Edition, slug: string) => `/historical/${language}/${slug}/`;
export const upstreamTosHyp = 'https://freemint.github.io/tos.hyp/';
export const elfEntryPath = '/os-variants/ptos/elf-entry/';

const areas = [
  {
    slug: 'subsystems', name: 'Subsystems', description: 'TOS interfaces for programs, graphics, devices and storage.',
    chapters: ['bios', 'xbios', 'gemdos', 'aes', 'vdi', 'line-a', 'the-pmmu-functions-handler', 'xhdi'],
  },
  {
    slug: 'os-variants', name: 'OS variants and extensions', description: 'TOS-compatible systems, desktop environments and emulators.',
    chapters: ['magic', 'n-aes', 'xaaes', 'ptos', 'emulators', 'tos-list'],
  },
  {
    slug: 'conventions', name: 'Conventions and misc.', description: 'Programming guidelines, protocols, character codes and development tools.',
    chapters: ['programming-guidelines', 'protocols', 'ascii-table', 'keyboard-scancodes', 'development-systems'],
  },
];

type Area = Omit<typeof areas[number], 'chapters'> & { href: string };
export type ManualTopic = {
  slug: string;
  name: string;
  href: string;
  historicalSlug?: string;
  standalone?: boolean;
};
export type ManualChapter = ManualTopic & { area: Area; sections: ManualTopic[] };

const english = pages('en');
const englishBySlug = new Map(english.map(page => [page.slug, page]));
export const historicalSectionBody = (slug: string) => englishBySlug.get(slug)?.body;
const parents = {
  en: records<Record<string, string>>('en-parents.json'),
  de: records<Record<string, string>>('de-parents.json'),
};

export function ancestors(language: Edition, slug: string) {
  const chain: string[] = [];
  for (let parent = parents[language][slug]; parent && parent !== 'contents'; parent = parents[language][parent]) {
    chain.unshift(parent);
  }
  return chain;
}

function children(slug: string) {
  const order = [...(englishBySlug.get(slug)?.body ?? '').matchAll(/href="\/historical\/en\/([^/"#]+)\//g)];
  const rank = new Map(order.map((match, index) => [match[1], index]));
  return english.filter(page => parents.en[page.slug] === slug)
    .sort((a, b) => (rank.get(a.slug) ?? Infinity) - (rank.get(b.slug) ?? Infinity) || a.title.localeCompare(b.title, 'en'));
}

const renamedChapters: Record<string, { name: string; historicalSlug: string }> = {
  'ascii-table': { name: 'ASCII Table', historicalSlug: 'ascii-table' },
  xhdi: { name: 'XHDI', historicalSlug: 'xhdi-extended-harddisk-interface-version-1-30' },
  'keyboard-scancodes': { name: 'Keyboard Scancodes', historicalSlug: 'the-scancode' },
};

const sectionAdditions: Record<string, ManualTopic[]> = {
  aes: [{ slug: 'cuis', name: 'CUIS ABI', href: '/abi/cuis/', standalone: true }],
  protocols: [{
    slug: 'xcontrol', name: 'XCONTROL', href: '/conventions/protocols/xcontrol/', historicalSlug: 'about-xcontrol',
  }],
  ptos: [
    { slug: 'ptos-ini', name: 'PTOS.INI', href: '/os-variants/ptos/ptos-ini/', standalone: true },
    { slug: 'desktop-and-console', name: 'External desktop and console', href: '/os-variants/ptos/desktop-and-console/', standalone: true },
    { slug: 'fonts', name: 'Font installation', href: '/os-variants/ptos/fonts/', standalone: true },
    { slug: 'elf-entry', name: 'ELF32 process entry', href: elfEntryPath, standalone: true },
  ],
};

export const manualAreas = areas.map(({ chapters: slugs, ...metadata }) => {
  const area = { ...metadata, href: `/${metadata.slug}/` };
  const chapters = slugs.map((slug): ManualChapter => {
    const href = `${area.href}${slug}/`;
    const historicalSlug = slug === 'ptos' ? undefined : renamedChapters[slug]?.historicalSlug ?? slug;
    const original = historicalSlug ? englishBySlug.get(historicalSlug) : undefined;
    if (historicalSlug && !original) throw new Error(`Missing tos.hyp chapter: ${historicalSlug}`);
    const historicalSections = historicalSlug ? children(historicalSlug) : [];
    return {
      slug, href, area, historicalSlug, name: renamedChapters[slug]?.name ?? original?.title ?? 'pTOS',
      sections: [
        ...historicalSections.map(section => ({
          slug: section.slug,
          name: section.title,
          href: section.function ? section.href : `${href}${section.slug}/`,
          historicalSlug: section.slug,
          standalone: section.function,
        })),
        ...(sectionAdditions[slug] ?? []),
      ],
    };
  });
  return { ...area, chapters };
});

export const chapters = manualAreas.flatMap(area => area.chapters);

export function location(slug: string) {
  const [chapterSlug, sectionSlug] = [...ancestors('en', slug), slug];
  if (chapterSlug === 'xcontrol') return chapterLocation('protocols', 'xcontrol');
  return chapterLocation(chapterSlug, sectionSlug);
}

export function chapterLocation(chapterSlug: string, sectionSlug?: string) {
  const chapter = chapters.find(entry => entry.slug === chapterSlug || entry.historicalSlug === chapterSlug);
  return { chapter, section: chapter?.sections.find(entry => entry.slug === sectionSlug) };
}

export function manualBreadcrumbs(chapterSlug: string, sectionSlug?: string) {
  const { chapter, section } = chapterLocation(chapterSlug, sectionSlug);
  return [chapter?.area, chapter, section].flatMap(node => node ? [{ label: node.name, href: node.href }] : []);
}

export function nativeSection(name: string) {
  if (['Mmap', 'Mprot', 'Munmap', 'S_MEMINFO', 'S_MMUPROBE'].includes(name)) return 'memory-management';
  if (['Ssystem', 'S_DESKINFO', 'S_DESKSET'].includes(name)) return 'system-functions';
  return 'process-functions';
}

export function historicalBreadcrumbs(language: Edition, slug: string) {
  const trail = ancestors(language, slug);
  const titles = language === 'en' ? englishBySlug : germanBySlug;
  return [
    { label: 'tos.hyp', href: upstreamTosHyp },
    ...(slug === 'contents' ? [] : [{
      label: language === 'en' ? 'English contents' : 'Deutsche Ausgabe', href: historicalPath(language, 'contents'),
    }]),
    ...trail.map(parent => ({
      label: titles.get(parent)?.title ?? parent,
      href: historicalPath(language, parent),
    })),
  ];
}

const germanBySlug = new Map(pages('de').map(page => [page.slug, { title: page.title }]));
