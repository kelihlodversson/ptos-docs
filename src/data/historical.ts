import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { GfaTrap } from './gfa-reference';

export type Edition = 'en' | 'de';
export interface HistoricalPage {
  slug: string;
  title: string;
  path: string;
  id?: string;
  language: Edition;
  nav: { href: string; label: string }[];
  subsystem: string;
  group: string;
  description: string;
  href: string;
  prototype: string;
  operation: string;
  facts: { label: string; value: string }[];
  body: string;
  function: boolean;
  native?: string;
  findings: number;
  bindings?: { href: string; assembly?: string; gfa?: string; raw?: GfaTrap };
}

export interface HistoricalFunction {
  name: string;
  group: string;
  description: string;
  subsystem: string;
  href: string;
  historicalHref: string;
}

export function records<T>(file: string): T {
  return JSON.parse(readFileSync(join(process.cwd(), 'src/data/historical', file), 'utf8')) as T;
}

export function pages(language: Edition): HistoricalPage[] {
  const data = readFileSync(join(process.cwd(), 'src/data/historical', `${language}.ndjson`), 'utf8');
  return data.trimEnd().split('\n').map(line => JSON.parse(line));
}
