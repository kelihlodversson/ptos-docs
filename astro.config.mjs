import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://docs.ptos.dev',
  base: '/',
  output: 'static',
  trailingSlash: 'always',
  redirects: {
    '/abi/elf-entry/': '/os-variants/ptos/elf-entry/',
    '/historical/': 'https://freemint.github.io/tos.hyp/',
  },
});
