import { defineConfig } from 'astro/config';
import { cuisGroupPath, cuisGroups, cuisPath } from './src/data/cuis-calls.ts';

export default defineConfig({
  site: 'https://docs.ptos.dev',
  base: '/',
  output: 'static',
  trailingSlash: 'always',
  redirects: {
    '/abi/cuis/': cuisPath,
    '/subsystems/aes/cuis/': cuisPath,
    ...Object.fromEntries(cuisGroups.map(({ slug }) => [`/subsystems/aes/cuis/${slug}/`, cuisGroupPath(slug)])),
    '/abi/elf-entry/': '/os-variants/ptos/elf-entry/',
    '/historical/': '/sources/',
    '/subsystems/bios/about-the-bios/': '/subsystems/bios/',
    '/subsystems/gemdos/about-the-gemdos/': '/subsystems/gemdos/',
    '/subsystems/vdi/about-the-vdi/': '/subsystems/vdi/',
    '/subsystems/xbios/about-the-xbios/': '/subsystems/xbios/',
  },
});
