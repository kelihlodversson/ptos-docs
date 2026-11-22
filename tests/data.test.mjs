import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { localResult, translationFindings } from '../scripts/translation.mjs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url));
const json = path => JSON.parse(read(path));
const samples = json('src/data/toshyp.generated.json');
const abi = json('src/data/abi.json');
const report = json('public/source/import-report.json');

test('published samples retain byte-exact sources and pinned provenance', () => {
  assert.deepEqual(report.published, Object.keys(samples));
  const { tos } = json('src/data/sources.json');
  assert.equal(report.revision, tos.revision);
  assert.match(tos.revision, /^[a-f0-9]{40}$/);
  for (const { path, sha256 } of Object.values(samples)) {
    assert.equal(createHash('sha256').update(read(`public/source/tos.hyp/${path}`)).digest('hex'), sha256);
  }
  assert.equal(new Set([...report.skipped, ...report.incomplete, ...report.other]).size,
    report.skipped.length + report.incomplete.length + report.other.length);
});

test('historical availability and mode restrictions survive conversion', () => {
  assert.equal(samples.Fclose.availabilityText, 'All GEMDOS versions.');
  assert.equal(samples.Pexec.availabilityText, 'All GEMDOS versions.');
  assert.equal(samples.appl_init.availabilityText, 'All AES versions.');
  assert.match(samples.Pexec.description, /GEMDOS Version 0\.15/);
  assert.match(samples.Pexec.description, /Version 0\.19/);
  assert.match(samples.Pexec.description, /300, 301, 401<\/dt><dd><p>Is used internally by MagiC/);
  assert.match(samples.Pexec.description, /no longer supported from MagiC 2\.0/);
  assert.match(samples.Fclose.returns, /EBADF/);
});

test('GFA editorial changes preserve the exact call and arguments', () => {
  for (const sample of Object.values(samples).filter(sample => sample.gfa)) {
    assert.equal(localResult({ original: sample.originalGfa, english: sample.gfa }), sample.gfa);
  }
  assert.equal(samples.Fclose.gfa, 'ErrCode%=Gemdos(&H3E,W:handle%)');
  assert.equal(samples.appl_init.gfa, null);
  assert.throws(() => localResult({ original: 'Fehler%=Gemdos(62)', english: 'ErrCode%=Gemdos(63)' }));
});

test('translation checks flag prose, example locals, comments and broken encodings', () => {
  assert.deepEqual(translationFindings('Fehler%=Gemdos(62)\nmove.w d0,d1 ; Hinweis\nDatei öffnen\nÃ¶').map(finding => finding.term),
    ['Fehler', 'Hinweis', 'Datei', 'Ã¶']);
  assert.deepEqual(translationFindings('ErrCode%=Gemdos(&H3E,W:handle%)\nEIHNDL\nph_prgflags'), []);
  assert.equal(report.translation.Pexec.status, 'needs-review');
});

function validateBitFields(diagram) {
  assert.ok([8, 16, 32, 64].includes(diagram.bits));
  let nextBit = diagram.bits - 1;
  for (const { hi, lo, width } of diagram.fields) {
    assert.equal(hi, nextBit);
    assert.ok(Number.isInteger(width) && width > 0 && lo >= 0);
    assert.equal(width, hi - lo + 1);
    nextBit = lo - 1;
  }
  assert.equal(nextBit, -1);
}

test('bit diagrams have contiguous bit ranges with no overlapping fields', () => {
  validateBitFields(abi.cuis.selector);
  for (const bits of [8, 16, 32, 64]) {
    validateBitFields({ bits, fields: [{ hi: bits - 1, lo: 1, width: bits - 1 }, { hi: 0, lo: 0, width: 1 }] });
  }
  assert.throws(() => validateBitFields({ bits: 8, fields: [{ hi: 7, lo: 0, width: 7 }] }));
  const [high, low] = abi.cuis.example.slice(2).split('_');
  assert.equal(BigInt(`0x${high}${low}`), (BigInt(abi.cuis.class) << 32n) | BigInt(abi.cuis.sessionQuery));
});

test('stack and structure slots match word and pointer sizes', () => {
  for (const layout of [abi.fclose, abi.pexec, abi.console]) {
    let next = 0;
    for (const field of layout.fields) {
      assert.equal(field.offset, next);
      assert.equal(field.offset % layout.alignment, 0);
      next += field.bytes;
    }
    assert.equal(next, layout.bytes);
  }
  assert.deepEqual(abi.fclose.fields.map(field => field.bytes), [2, 2]);
  assert.deepEqual(abi.pexec.fields.map(field => field.bytes), [2, 2, 4, 4, 4]);
  assert.deepEqual(abi.console.fields.map(field => field.bytes), [2, 2, 2, 2]);
  assert.equal(abi.elf.wordBytes * abi.elf.auxWords, 8);
  assert.equal(abi.elf.alignment, 16);
});

test('the historical import preserves every UDO node and names its input file', () => {
  const coverage = json('public/source/historical-report.json');
  const { tos, udo } = json('src/data/sources.json');
  assert.equal(coverage.revision, tos.revision);
  assert.equal(coverage.compiler, udo.revision);
  for (const language of ['en', 'de']) {
    const records = read(`src/data/historical/${language}.ndjson`).toString().trimEnd().split('\n').map(JSON.parse);
    assert.equal(records.length, coverage.languages[language].nodes);
    assert.equal(records.filter(row => row.function).length, coverage.languages[language].functions);
    assert.equal(new Set(records.map(row => row.href)).size, records.length);
    for (const row of records) {
      assert.match(row.path, /\.ui?$/);
      assert.ok(row.href.startsWith(`/historical/${language}/`));
    }
    assert.deepEqual(coverage.languages[language].missingLinks, []);
    assert.ok(records.some(row => row.slug === 'contents'));
  }
  assert.ok(coverage.languages.en.findings.length > 0);
  assert.ok(coverage.languages.de.declarationsWithoutExactEnglishMatch.length > 0);
});

test('historical compiler preserves declarations, availability and original binding references', () => {
  const records = read('src/data/historical/en.ndjson').toString().trimEnd().split('\n').map(JSON.parse);
  const fclose = records.find(row => row.slug === 'fclose');
  assert.match(fclose.prototype, /int16_t Fclose/);
  assert.match(fclose.facts.find(row => row.label === 'Availability:').value, /All GEMDOS versions/);
  assert.match(fclose.bindings.assembly, /trap\s+#1/);
  assert.equal(fclose.bindings.gfa, 'ErrCode%=Gemdos(&H3E,W:handle%)');
  assert.match(records.find(row => row.slug === 'bindings-for-fclose').body, /ErrCode%=Gemdos/);
  assert.equal(fclose.native, '/reference/fclose/');
  const names = new Set(records.map(row => row.title));
  for (const name of ['Fopen', 'Pwaitpid', 'Bconin', 'v_opnvwk', 'appl_find', 'ARGV procedure']) assert.ok(names.has(name));
});

test('native callable layouts are contiguous and separate ABI widths from names', async () => {
  const { nativeCalls, nativePath } = await import('../src/data/native-calls.ts');
  assert.equal(new Set(nativeCalls.map(call => nativePath(call.name))).size, nativeCalls.length);
  for (const call of nativeCalls) {
    assert.ok(call.args.length <= 6);
    assert.ok(call.sources.length > 0);
    if (!call.layout) continue;
    let offset = 0;
    for (const field of call.layout.fields) {
      assert.equal(field.offset, offset, call.name);
      offset += field.bytes;
    }
    assert.equal(offset, call.layout.bytes, call.name);
  }
});

test('GFA trap derivation requires the exact historical stack shape', async () => {
  const { gfaTrap } = await import('../scripts/gfa-trap.mjs');
  const source = ['pea name', 'move.w mode,-(sp)', 'move.w #$4b,-(sp)', 'trap #1', 'lea $8(sp),sp'].join('\n');
  assert.deepEqual(gfaTrap(source), {
    routine: 'GEMDOS', opcode: 75, args: [{ width: 'W', operand: 'mode' }, { width: 'L', operand: 'name' }],
  });
  assert.equal(gfaTrap(source.replace('$8(sp)', '$6(sp)')), undefined);
  assert.equal(gfaTrap(source.replace('trap #1', 'trap #2')), undefined);
  assert.equal(gfaTrap(source.replace('pea name', 'pea (a0)')), undefined);
  assert.equal(gfaTrap(source.replace('move.w mode', 'move.w d0')), undefined);
  const report = json('public/source/historical-report.json');
  assert.ok(report.languages.en.additionalGfaTrapForms > 0);
});

test('the compendium bindings have page citations and preserve GFA argument order', () => {
  const bindings = json('src/data/gfa-builtins.json');
  assert.ok(Object.keys(bindings).length > 70);
  for (const [symbol, binding] of Object.entries(bindings)) {
    assert.ok(binding.signature.startsWith(symbol + '('));
    assert.ok(Number.isInteger(binding.page) && binding.page >= 29 && binding.page <= 35);
  }
  assert.equal(bindings.APPL_INIT.signature, 'APPL_INIT()');
  assert.equal(bindings.SHEL_WRITE.signature, 'SHEL_WRITE(mode,gr,cr,tail$,cmd$)');
});
