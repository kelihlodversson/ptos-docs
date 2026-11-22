# pTOS Programmer’s Reference Manual

Static Astro and TypeScript source for [docs.ptos.dev](https://docs.ptos.dev/).
The initial edition covers Fclose, Pexec, appl_init, the pTOS Ssystem console
extension, the CUIS session-query ABI and ELF32 process entry.

## Development

Use the Node version in `.nvmrc`. Install and run the manual locally:

```sh
npm ci
npm run dev
```

Install the Chromium browser used by the tests, then validate the manual:

```sh
npx playwright install chromium
npm test
npm run preview
```

On Linux CI, the browser install also uses `--with-deps`. Set
`PLAYWRIGHT_CHROMIUM_EXECUTABLE` to use an existing system Chromium.
See [CONTRIBUTING.md](CONTRIBUTING.md) for import, ABI and publishing details.
