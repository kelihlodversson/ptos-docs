# Maintaining the manual

## Historical import and translation

`src/data/sources.json` records the upstream revisions. The historical source
is the English and German UDO branches within the same upstream checkout.
Generated HTML and compiled hypertext are never import inputs.

```sh
git clone https://github.com/freemint/tos.hyp.git .upstream/tos.hyp
npm run import -- .upstream/tos.hyp
npm run import -- .upstream/tos.hyp --check
```

The importer reads Git objects at the pinned revision even if the checkout
is on a different branch. Review the diff to the generated records, verbatim
sources and coverage report together. CI regenerates and checks all outputs
byte for byte. Extend the UDO converter and its tests before expanding
`src/data/import-scope.json`.

The inventory scans BIOS, XBIOS, GEMDOS, VDI and AES for function-like files.
Its counts are file counts. A skipped file can contain multiple entries, and
a file without a recognized declaration or opcode marker may still document
an API. Incomplete inventory files lack a branch pattern or an English API
marker the importer recognizes. The published report lists these files for
follow-up. This converter handles the UDO constructs and Atari ST title
delimiters in the initial leaves. A broader import needs a complete encoding
decoder and additional UDO directives.

The import compares numeric mode labels between the two branches of the
published leaves, checks English source for German tokens and damaged encoding,
and records manual review status. Add verified code-local edits in
`translation-review.json`. Keep authentic API symbols, trap constants and
code behavior intact. Review suspect phrases or additions against both
branches, including code comments, examples and mode restrictions. An entry’s
optional `allowlist` accepts exact `term`, `context` and `reason` records for
authentic names and intentional historical quotations. Resolve untriaged findings before publishing. The saved English source reflects
upstream spelling, while the report records editorial changes and known
uncertainties.

## Source and license

The [tos.hyp foreword](public/source/tos.hyp/anhang/hilfe.u) records the
historical licensing change and credits Rolf Kotzian and other contributors.
The project distributes the text under the GNU General Public License.
The [upstream license copy](public/source/tos.hyp/COPYING.GPL) is GPL v2.
The original per-function source files, report and notices ship with the site.
The manual converts UDO formatting and changes two illustrative GFA result
variable names. The report describes those modifications and their provenance.
The imported scope is text and code examples. Upstream pictures, fonts and
Motorola graphics are outside that scope. The palette and system typeface
choices were taken from the pinned ptos.dev CSS. Layout markup is original.

## Native overlays and ABI figures

Add OS-specific findings to `src/data/overlays.ts` and link to the public
binding, kernel dispatch, configuration and corresponding test where available.
Record the exact implementation revision. Label experimental and planned
interfaces explicitly, and scope unsupported claims to the affected build,
mode or runtime. Record unverified behavior as such.

```sh
git clone https://github.com/kelihlodversson/pTOS.git .upstream/pTOS
git clone https://github.com/kelihlodversson/libcmini.git .upstream/libcmini
node scripts/validate-upstream.mjs .upstream/pTOS .upstream/libcmini
```

Define figures in `src/data/abi.json` with explicit field widths and offsets.
Compare claims against the pinned source as well as the figure assertions.
Use Chromium’s print view or capture the review images and sample PDF:

```sh
npm run build
MANUAL_SCREENSHOTS=review npm run test:browser -- tests/screenshots.spec.ts
```

## Publishing

The Reference manual workflow runs validation on pull requests. On pushes to
`main` and manual runs from `main`, it uploads the static `dist` artifact,
deploys through the existing `github-pages` environment, and verifies the
custom HTTPS origin and representative deep links. The current environment
only allows deployments from `main`. An open pull request can validate the
build and links before publication.

The existing Pages source must be GitHub Actions and the domain must be
`docs.ptos.dev`. If deployment succeeds but HTTPS checks fail, inspect the
workflow log for the failing URL and check the existing custom-domain
certificate and Pages settings.
