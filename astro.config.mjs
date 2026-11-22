import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://docs.ptos.dev',
  base: '/',
  output: 'static',
  trailingSlash: 'always',
});
