# pTOS Programmer’s Reference Manual

Static Astro and TypeScript source for [docs.ptos.dev](https://docs.ptos.dev/).
The manual includes the complete English and German tos.hyp corpus, searchable
function and section indexes, and separate pTOS and ParaTOS implementation notes.
Native process and thread references use the pinned pTOS PR #903 and ParaTOS
PR #27 source trees.

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
