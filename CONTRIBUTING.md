# Maintaining the manual

## Historical import and translation

The English and German editions are generated from the same pinned tos.hyp UDO
tree using the pinned UDO 7.12 command-line compiler. The importer removes the
merge-subsubnodes directive in a temporary copy so each node has its own page.
It reads the compiler’s node-to-file map for provenance, keeps aliases and
cross-references, and adapts the generated HTML into the reference layout and
target selector. The generated parent indexes supply the chapter hierarchy
and historical breadcrumbs. The importer takes UDO source as input.
It uses the author date from the German SE protocol source header for its
signature, keeping the rendered page independent of the day UDO runs.

The generated records are committed so the ordinary Astro build only needs
Node and npm. To regenerate on Linux, install a C compiler and run:

```sh
git clone https://github.com/freemint/tos.hyp.git .upstream/tos.hyp
git clone https://github.com/th-otto/udo.git .upstream/udo
git -C .upstream/udo checkout 2c997eb4e163a4e6673c7ba99664d0eaa9ef6c0f
scripts/build-udo.sh .upstream/udo .upstream/bin/udo
npm run import:historical -- .upstream/tos.hyp .upstream/bin/udo
npm run import:historical -- .upstream/tos.hyp .upstream/bin/udo --check
npm run import -- .upstream/tos.hyp --check
```

Pin changes belong in `src/data/sources.json`. The import reads tos.hyp Git
objects at the pinned revision even when the source checkout is on another
branch. CI runs both import checks and verifies that the final site resolves
internal pages, assets, and fragments. Review changes to the one-record-per-line
data and the coverage report together. Sources outside the main document tree
are listed in the report. This includes alternate driver documents with
duplicate chapter includes, the download-page wrapper, and conversion fixtures.

The report distinguishes UDO nodes from recognized function records. Some
nodes document commands or interfaces without a standard function table.
They are still rendered and searchable as sections. The English lint records
possible German text and encoding issues by page. The German comparison
records function tables without an exact English source-path and title match.
These are editorial review queues. They include localized headings and
formatting differences as well as possible incomplete translations.

The original Fclose, Pexec, and appl_init pages have a separate editorial check.
Keep reviewed example-local edits in `src/data/translation-review.json`. Preserve
public identifiers, constants, register assignments and code behavior. The
two existing GFA edits rename result variables and leave the calls unchanged.
Add scoped allowlist records with the matched term, context and reason after
reviewing source text.

## Source and license

The [tos.hyp foreword](public/source/tos.hyp/anhang/hilfe.u) records the
historical licensing change and credits Rolf Kotzian and other contributors.
The project distributes the text under the GNU General Public License. The
[upstream license copy](public/source/tos.hyp/COPYING.GPL) is GPL v2. The
site links each converted page to its pinned UDO file and offers the full
upstream source archive.

The import includes the referenced technical diagrams and contact illustrations
selected in the converter. Their upstream paths and checksums are in the report.
Screenshots, application imagery and artwork with unclear individual
permissions are linked to the pinned originals. Check each asset before
adding it to the included set. The palette and system typeface choices come
from the pinned ptos.dev CSS.

## GFA BASIC reference

The site cites *The GFA-Basic Compendium* at [BAFO](http://bafo.free.fr/).
The source metadata records the supplied PDF fingerprint and the credited
authors. The PDF identifies the hypertext port as rights reserved, so the
site includes factual call forms, page citations and original explanations.
It links to the source from the GFA BASIC guide and attribution page.

Update `src/data/gfa-builtins.json` after checking each built-in name and
argument order against the cited PDF page. Keep runtime notes where the
compendium describes a dummy binding or reports a compiler limitation.
For legacy BIOS, XBIOS and GEMDOS calls, the importer emits a raw GFA BASIC
call form only when the UDO assembler listing identifies the trap and opcode
and accounts for every byte pushed and removed from the 68k stack. A raw
call form describes argument marshalling. Compatibility remains scoped to
the architecture and OS recorded on the reference page.

## Native overlays and ABI figures

Add OS-specific material to `src/data/overlays.ts` or `src/data/native-calls.ts`.
The evidence baseline is the exact commit pinned in `src/data/sources.json`
from pTOS `master`, alongside the pinned ParaTOS PR #27 commit. Cite the
implementation, public header, configuration and corresponding test where
available. Scope compatibility notes to the native kernel, host backend or
guest interface the source verifies.

```sh
git clone https://github.com/kelihlodversson/pTOS.git .upstream/pTOS
git -C .upstream/pTOS fetch origin master
git clone https://github.com/kelihlodversson/libcmini.git .upstream/libcmini
git clone https://github.com/SapionAps/ParaTos.git .upstream/ParaTos
git -C .upstream/ParaTos fetch origin refs/pull/27/head
node scripts/validate-upstream.mjs .upstream/pTOS .upstream/libcmini .upstream/ParaTos
node scripts/import-native-bindings.mjs .upstream/pTOS
node scripts/import-native-bindings.mjs .upstream/pTOS --check
```

The native binding inventory reads dispatch tables, libaes exports and the
x32 VDI client at the pinned pTOS commit. To refresh the pin, review the
changes on `origin/master`, set `ptos.revision` to the reviewed commit, and
regenerate the inventory. Historical binding rules in
`src/data/historical-bindings.ts` supply the Availability summary and native
calling conventions. They account for shared opcodes, native argument
structures, and build or privilege restrictions. The summary adds pTOS
information alongside the imported Availability and omits a redundant summary
when the original says that all versions support the call and every pTOS
target implements it without qualification. Review these rules when repinning
the source. Assign extensions to the closest historical subsection using
`src/data/manual-structure.ts`.

Keep ABI layouts in structured data with explicit widths and byte offsets.
Use Chromium print view or capture the reference review images:

```sh
npm run build
MANUAL_SCREENSHOTS=review npm run test:browser -- tests/screenshots.spec.ts
```

## Publishing

The Reference manual workflow validates and uploads a static Pages artifact
for open pull requests. On pushes to `main` and manual runs from `main`,
it deploys through the existing `github-pages` environment and verifies
HTTPS deep links. The existing Pages source is GitHub Actions and the
custom domain is `docs.ptos.dev`.
