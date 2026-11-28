import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const [checkout, ...options] = process.argv.slice(2);
if (!checkout) throw new Error('Usage: node scripts/import-native-bindings.mjs PTOS_CHECKOUT [--check]');
const { ptos } = JSON.parse(readFileSync(new URL('../src/data/sources.json', import.meta.url)));
const source = path => execFileSync('git', ['-C', checkout, 'show', `${ptos.revision}:${path}`], { encoding: 'utf8' });
const defineNumbers = code => Object.fromEntries([...code.matchAll(/^#define\s+(\w+)\s+(0x[\da-f]+|\d+)\b/gim)]
  .map(([, symbol, number]) => [symbol, Number(number)]));

// Native dispatch uses one slot per argument. Keep the table's arity
// and cross-check it against the same entry's 68k word/long signature.
const dispatch = source('bdos/bdosmain.c');
const gemdos = {};
for (const [, , count, shape, opcode] of dispatch.matchAll(/F\((\w+)\)[^\n]*W_N\((\d+),(\w+)\)[^\n]*\/\* (0x[\da-f]+)/gi)) {
  const args = shape.replace(/^[R]?(?=.)/, '').replace(/^V$/, '');
  assert.equal(Number(count), args.length, opcode);
  gemdos[Number(opcode)] = { args, config: { '0x14': 'CONF_WITH_ALT_RAM', '0x15': 'CONF_WITH_VIDEL' }[opcode] };
}
assert.deepEqual(gemdos[0x3d], { args: 'PW', config: undefined });
assert.equal(gemdos[0x4b].args, 'WLLL');
assert.match(dispatch, /#if ARCH_ARM \|\| \(CONF_WITH_NATIVE_ABI && CONF_WITH_USER_ASPACE\)\s+\{ NI,[^\n]+0x4B: historical Pexec/);
const { GEMDOS_PEXECVE } = defineNumbers(source('include/pexecve.h'));
assert.match(dispatch, /if \(fn == GEMDOS_PEXECVE\)/);
gemdos[GEMDOS_PEXECVE] = { args: 'WPPP', source: 'bdos/bdosmain.c' };
const pollNumbers = defineNumbers(source('include/fpoll_abi.h'));
for (const [symbol, args] of [
  ['GEMDOS_FPOLL_TIME64', 'PLLL'], ['GEMDOS_FPOLL', 'PLL'], ['GEMDOS_FSELECT', 'WPPP'],
]) {
  assert.ok(symbol in pollNumbers && dispatch.includes(`if (fn == ${symbol})`), symbol);
  gemdos[pollNumbers[symbol]] = { args, config: 'CONF_WITH_FPOLL_TIME64', source: 'bdos/bdosmain.c' };
}

const mint = source('bdos/mintproc.c');
const mintNumbers = defineNumbers(source('bdos/mintproc.h'));
const mintArgs = {
  PGETPID: '', PGETPPID: '', PGETUID: '', PGETEUID: '', PGETGID: '', PGETEGID: '',
  PGETAUID: '', PSETAUID: 'W', PGETPRIORITY: 'WW', PSETPRIORITY: 'WWW', PRUSAGE: 'P', DGETCWD: 'PWW',
};
for (const [name, args] of Object.entries(mintArgs)) {
  const symbol = 'GEMDOS_' + name;
  assert.ok(symbol in mintNumbers && mint.includes('case ' + symbol + ':'), symbol);
  gemdos[mintNumbers[symbol]] = { args, config: 'CONF_WITH_KPROC', source: 'bdos/mintproc.c' };
}
const extendedNumbers = defineNumbers([dispatch, source('bdos/fs.h'), source('bdos/ssystem.h'), source('include/shutdown.h')].join('\n'));
for (const [name, args, config] of [
  ['SUPER', 'L', undefined], ['PSETLIMIT', 'WL', 'CONF_WITH_USER_ASPACE'],
  ['FCNTL', 'WLW', 'CONF_WITH_USER_ASPACE'],
  ['MVALIDATE', 'WPLP', 'CONF_WITH_USER_ASPACE'], ['MACCESS', 'PLW', 'CONF_WITH_USER_ASPACE'],
  ['SYSCONF', 'W', 'CONF_WITH_SSYSTEM'], ['SHUTDOWN', 'L', 'CONF_WITH_GEMDOS_SHUTDOWN'],
]) {
  const symbol = 'GEMDOS_' + name;
  assert.ok(symbol in extendedNumbers && new RegExp(`(?:case |fn == )${symbol}\\b`).test(dispatch), symbol);
  gemdos[extendedNumbers[symbol]] = { args, config };
}

const vectorTable = prefix => source(`bios/${prefix}.c`).split(`const PFLONG ${prefix}_vecs[] = {`)[1].split('};')[0];
const bios = {}, xbios = {}, xbiosConfig = {};
for (const [prefix, vectors] of [['bios', bios], ['xbios', xbios]]) {
  const vector = new RegExp(`VEC\\(${prefix}_([\\da-f]+), (\\w+)\\)`);
  let gate;
  for (const line of vectorTable(prefix).split('\n')) {
    if (/^#(?:if|else|elif|endif)\b/.test(line)) {
      gate = /^#if (CONF_\w+)\s*$/.exec(line)?.[1];
    }
    const match = vector.exec(line);
    if (!match) continue;
    const opcode = parseInt(match[1], 16);
    vectors[opcode] = match[2].toLowerCase();
    if (prefix === 'xbios' && gate) xbiosConfig[opcode] = gate;
  }
}
assert.equal(xbiosConfig[0x0d], 'CONF_WITH_MFP');
assert.equal(xbiosConfig[0x58], 'CONF_WITH_VIDEL');
const atariXbios = source('bios/arch/m68k/m68kusertrap.c');
const allowList = atariXbios.split('static BOOL atari_xbios_allowed(WORD fn)')[1].split('return TRUE;')[0];
const higherHalfXbios = [...allowList.matchAll(/case (0x[\da-f]+):/gi)].map(([, number]) => Number(number));
assert.ok(higherHalfXbios.includes(0x05) && !higherHalfXbios.includes(0x26));

const linea = source('bios/arch/m68k/linea.S');
assert.match(linea, /#if CONF_WITH_USER_ASPACE[^\n]*\n[\s\S]+?jra\s+C_SYM\(linea_fault_vec\)/);
const lineACount = [...linea.split('linea_vecs:')[1].split('linea_ents:')[0].matchAll(/^\s*\.dc\.l\s+/gm)].length;
assert.equal(lineACount, 16);

const xhdiDispatch = source('bios/xhdi.c');
const xhdiCases = xhdiDispatch.split('switch (opcode)')[1];
const xhdi = Object.fromEntries(Object.entries(defineNumbers(source('bios/xhdi.h')))
  .filter(([name]) => xhdiCases.includes(`case ${name}:`))
  .map(([name, number]) => [number, name.toLowerCase()]));
const xhdiDriverOnly = [...xhdiDispatch.matchAll(/^static long (XH\w+)\([^)]*\)\n\{\n([\s\S]*?)^\}/gm)]
  .filter(([, , body]) => /return next_handler\(/.test(body) && /^    return (?:ERR|EINVFN);[^\n]*\n$/m.test(body))
  .map(([, name]) => Number(Object.keys(xhdi).find(number => xhdi[number] === name.toLowerCase())));
assert.equal(Object.keys(xhdi).length, 20);
assert.deepEqual(xhdiDriverOnly, [2, 3, 4, 5, 13, 15, 16, 18, 19]);
const xbiosDoc = source('doc/x86_64-syscall.txt').split('XBIOS (the calls this configuration has)')[1].split('Not implemented here')[0];
const x32Xbios = [...xbiosDoc.matchAll(/^\s+(\d+(?:, \d+)*)\s+\w+\(/gm)]
  .flatMap(([, opcodes]) => opcodes.split(', ').map(Number)).sort((a, b) => a - b);
assert.match(source('bios/arch/x86_64/trap.c'), /fn >= xbios_ent \|\| xbios_vecs\[fn\] == xbios_unimpl_addr/);
assert.match(source('bios/arch/arm/vectorsasm.S'), /C_SYM\(biostrap\):[\s\S]*C_SYM\(bios_vecs\)/);
assert.match(source('bdos/arch/arm/uspace.c'), /pw\[i\] = \(long\)f->r\[i\]/);
assert.ok(x32Xbios.includes(0x08) && x32Xbios.includes(0x25) && !x32Xbios.includes(0x26));
// Flopfmt, which is described on a line of its own after the floppy I/O group.
assert.ok(x32Xbios.includes(0x0a) && x32Xbios.every(opcode => Boolean(xbios[opcode])));

const aesConstants = defineNumbers(source('aes/crysbind.h'));
const aesNative = {};
let config;
for (const line of source('aes/gemsuper.c').split('\n')) {
  const gate = /^#if (CONF_\w+)$/.exec(line)?.[1];
  if (gate) config = gate;
  if (/^#endif\b/.test(line)) config = undefined;
  const name = /^    case ([A-Z_]+):/.exec(line)?.[1];
  if (name && Object.hasOwn(aesConstants, name)) aesNative[name.toLowerCase()] = { opcode: aesConstants[name], config };
}
const aesLibrary = {};
const exports = new Set([...source('lib/aes/exports.map').matchAll(/\bmt_(\w+);/g)].map(match => match[1]));
for (const line of source('doc/libaes-compatibility.md').split('\n')) {
  const [names, status] = line.split(' | ');
  if (!['available', 'partial'].includes(status)) continue;
  for (const [, name] of names.matchAll(/`(\w+)`/g)) {
    assert.ok(exports.has(name), name);
    aesLibrary[name] = status;
  }
}
assert.deepEqual(Object.keys(aesLibrary).sort(), [...exports].sort());
assert.equal(aesNative.appl_init.opcode, 10);
assert.match(source('aes/arch/arm/gemdosif.S'), /cmp r0, #0xC8/);

const legacyVdi = {};
const vdi = source('vdi/vdi_main.c');
for (const [, handler, opcode, aliases = ''] of vdi.matchAll(/\{\s*\d+,\s*\d+,\s*vdi_(\w+)\s*\},?;?\s*\/\*\s*(\d+)\s*\*\/(?:\s*\/\* also ([\w_]+) \*\/)?/g)) {
  if (handler !== 'v_nop') legacyVdi[Number(opcode)] = [handler, ...aliases ? [aliases] : []];
}
assert.equal(legacyVdi[100][0], 'v_opnvwk');
assert.match(source('vdi/vdi_defs.h'), /^#define HAVE_BEZIER 0/m);
const vdiClient = source('vdi/x32/vdi_client.c');
const userSwitch = vdiClient.split('switch (control.code) {')[1].split('default:')[0];
const x32Vdi = [...new Set([...userSwitch.matchAll(/case (\d+):/g)].map(([, op]) => Number(op)))].sort((a, b) => a - b);
assert.ok(x32Vdi.includes(100) && !x32Vdi.includes(1) && x32Vdi.every(opcode => legacyVdi[opcode]));
assert.match(source('vdi/vdi_user_draw.c'), /case 102:[^\n]*vq_extnd\(1\)[\s\S]*r->intin\[0\] != 1/);
assert.match(source('bios/arch/arm/vectorsasm.S'), /C_SYM\(gemtrap\):\s*cmp\s+r0, #0x73/);

const inventory = {
  revision: ptos.revision, gemdos, bios, xbios, xbiosConfig, higherHalfXbios, x32Xbios,
  lineACount, xhdi, xhdiDriverOnly, aesNative, aesLibrary, legacyVdi, x32Vdi,
};
const output = JSON.stringify(inventory, null, 2) + '\n';
const path = new URL('../src/data/native-inventory.json', import.meta.url);
if (options.includes('--check')) assert.equal(readFileSync(path, 'utf8'), output, 'Regenerate the native inventory');
else writeFileSync(path, output);
console.log(`Verified native dispatch for ${Object.keys(gemdos).length} GEMDOS selectors, ${Object.keys(bios).length} BIOS vectors, ${Object.keys(xbios).length} XBIOS vectors, ${Object.keys(aesNative).length} kernel AES operations, ${exports.size} libaes exports and ${x32Vdi.length} x32 VDI client opcodes`);
