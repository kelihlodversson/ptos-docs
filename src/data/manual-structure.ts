import { pages, records } from './historical';
import type { Edition } from './historical';

export const chapterPath = (slug: string) => `/subsystems/${slug}/`;
export const sectionPath = (chapter: string, section: string) => `${chapterPath(chapter)}${section}/`;
export const historicalPath = (language: Edition, slug: string) => `/historical/${language}/${slug}/`;

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
  return english.filter(page => slug === 'contents' ? rank.has(page.slug) : parents.en[page.slug] === slug)
    .sort((a, b) => (rank.get(a.slug) ?? Infinity) - (rank.get(b.slug) ?? Infinity) || a.title.localeCompare(b.title, 'en'));
}

export const chapters = children('contents').filter(page => page.slug !== 'index').map(page => ({
  slug: page.slug,
  name: page.title,
  href: chapterPath(page.slug),
  historicalHref: page.href,
  sections: [
    ...children(page.slug).map(section => ({
      slug: section.slug,
      name: section.title,
      href: section.function ? section.href : sectionPath(page.slug, section.slug),
      historicalHref: section.href,
      directEntry: section.function,
    })),
    ...(page.slug === 'aes' ? [{
      slug: 'cuis', name: 'CUIS ABI', href: '/abi/cuis/', historicalHref: '', directEntry: true,
    }] : []),
  ],
}));

export function location(slug: string) {
  const [chapterSlug, sectionSlug] = [...ancestors('en', slug), slug];
  return chapterLocation(chapterSlug, sectionSlug);
}

export function chapterLocation(chapterSlug: string, sectionSlug?: string) {
  const chapter = chapters.find(entry => entry.slug === chapterSlug);
  return { chapter, section: chapter?.sections.find(entry => entry.slug === sectionSlug) };
}

export function manualBreadcrumbs(chapterSlug: string, sectionSlug?: string) {
  const { chapter, section } = chapterLocation(chapterSlug, sectionSlug);
  return [{ label: 'Subsystems', href: '/subsystems/' },
    ...[chapter, section].flatMap(node => node ? [{ label: node.name, href: node.href }] : [])];
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
    { label: language === 'en' ? 'Historical TOS reference' : 'Historisches TOS-Handbuch', href: '/historical/' },
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
