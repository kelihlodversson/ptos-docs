import { pages, records } from './historical';
import type { Edition, HistoricalPage } from './historical';

export const historicalPath = (language: Edition, slug: string) => `/historical/${language}/${slug}/`;
export const upstreamTosHyp = 'https://freemint.github.io/tos.hyp/';
export const elfEntryPath = '/os-variants/ptos/elf-entry/';
export const systemVariablesPath = '/subsystems/bios/the-system-variables/';
export const cookieJarPath = '/subsystems/bios/cookie-jar/';
export const cookieKeysPath = historicalPath('en', 'cookie-and-xbra-list');

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
const germanBySlug = new Map(pages('de').map(({ slug, title, path, id }) => [slug, { title, path, id }]));
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

const chapterIntroductions: Record<string, string> = {
  bios: 'about-the-bios',
  gemdos: 'about-the-gemdos',
  xbios: 'about-the-xbios',
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
    const historicalSections = historicalSlug ? children(historicalSlug).filter(section =>
      section.slug !== chapterIntroductions[slug]) : [];
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

const germanChapterSlugs: Record<string, string> = {
  protokolle: 'protocols',
  'der-pmmu-funktionshandler': 'the-pmmu-functions-handler',
};

export function location(slug: string, language: Edition = 'en'): ReturnType<typeof chapterLocation> {
  const [root, sectionSlug] = [...ancestors(language, slug), slug];
  if (root === 'xcontrol') return chapterLocation('protocols', 'xcontrol');

  const chapterSlug = language === 'de' ? germanChapterSlugs[root] ?? root : root;
  const result = chapterLocation(chapterSlug, sectionSlug);
  if (language === 'en' || !result.chapter || result.section || !sectionSlug) return result;

  const sectionSource = germanBySlug.get(sectionSlug)?.path;
  const matchingSections = result.chapter.sections.filter(section =>
    section.historicalSlug && englishBySlug.get(section.historicalSlug)?.path === sectionSource);
  if (matchingSections.length === 1) return { ...result, section: matchingSections[0] };

  // Translated headings may have different source files. A shared UDO node
  // or symbol from the same source file can identify the English subsection.
  const germanPage = germanBySlug.get(slug);
  const englishPage = englishBySlug.get(slug);
  if (germanPage && englishPage &&
      (germanPage.path === englishPage.path || germanPage.id && germanPage.id === englishPage.id)) {
    const matchingEntry = location(slug);
    if (matchingEntry.chapter === result.chapter) return matchingEntry;
  }
  return result;
}

export function chapterLocation(chapterSlug: string, sectionSlug?: string) {
  const chapter = chapters.find(entry => entry.slug === chapterSlug || entry.historicalSlug === chapterSlug);
  return { chapter, section: chapter?.sections.find(entry => entry.slug === sectionSlug) };
}

export function manualBreadcrumbs(chapterSlug: string, sectionSlug?: string) {
  const { chapter, section } = chapterLocation(chapterSlug, sectionSlug);
  return breadcrumbLinks([chapter?.area, chapter, section]);
}

function breadcrumbLinks(nodes: (Area | ManualTopic | undefined)[]) {
  return nodes.flatMap(node => node ? [{ label: node.name, href: node.href }] : []);
}

export function nativeSection(name: string) {
  if (['Mmap', 'Mprot', 'Munmap', 'S_MEMINFO', 'S_MMUPROBE'].includes(name)) return 'memory-management';
  if (['Ssystem', 'Syield'].includes(name)) return 'system-functions';
  return 'process-functions';
}

export function importedNavigation({ language, slug }: Pick<HistoricalPage, 'language' | 'slug'>) {
  const trail = ancestors(language, slug);
  const { chapter, section } = location(slug, language);
  if (chapter) {
    const breadcrumbs = breadcrumbLinks([
      chapter.area,
      trail.length > 0 || section ? chapter : undefined,
      trail.length > 1 ? section : undefined,
    ]);
    return { chapter, breadcrumbs };
  }
  const titles = language === 'en' ? englishBySlug : germanBySlug;
  const breadcrumbs = [
    { label: 'tos.hyp', href: upstreamTosHyp },
    ...(slug === 'contents' ? [] : [{
      label: language === 'en' ? 'English contents' : 'Deutsche Ausgabe', href: historicalPath(language, 'contents'),
    }]),
    ...trail.map(parent => ({
      label: titles.get(parent)?.title ?? parent,
      href: historicalPath(language, parent),
    })),
  ];
  return { chapter, breadcrumbs };
}
