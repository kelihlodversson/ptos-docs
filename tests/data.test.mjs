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
