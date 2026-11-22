import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const json = path => JSON.parse(readFileSync(new URL(path, root), 'utf8'));
const abi = json('src/data/abi.json');
const { ptos, libcmini } = json('src/data/sources.json');
const [kernel, sdk] = process.argv.slice(2);
if (!kernel || !sdk) throw new Error('Usage: node scripts/validate-upstream.mjs /path/to/pTOS /path/to/libcmini');
const show = (repo, { revision }, path) => execFileSync('git', ['-C', repo, 'show', `${revision}:${path}`], { encoding: 'utf8' });
const fromKernel = path => show(kernel, ptos, path);
const fromSdk = path => show(sdk, libcmini, path);

const cuis = fromKernel('include/cuis.h');
const define = (header, name) => Number(new RegExp(`^#define\\s+${name}\\s+(0x[0-9a-fA-F]+|\\d+)`, 'm').exec(header)?.[1]);
assert.equal(define(cuis, 'CUIS_SERVICE_CLASS'), abi.cuis.class);
assert.equal(define(cuis, 'CUIS_SESSION_QUERY'), abi.cuis.sessionQuery);
assert.match(fromKernel('bios/arch/x86_64/trap.c'), /frame->rax\s*>>\s*32/);
assert.match(fromKernel('tests/cuis/program.c'), /raw\(CUIS_SESSION_QUERY, handle\) == E_OK/);
assert.match(fromKernel('aes/Kconfig'), /config CONF_WITH_CUIS\s+bool\s+depends on ARCH_X86_64 && CONF_WITH_USER_ASPACE/);

const dispatch = fromKernel('bdos/bdosmain.c');
assert.match(dispatch, /F\(xclose\).*W_N\(1,W\).*0x3E/);
assert.match(dispatch, /F\(xexec\).*W_N\(4,WLLL\).*0x4B/);
const m68k = fromSdk('include/mint/osbind.h');
assert.match(m68k, /trap_1_ww\(\(short\)\(0x3E\),\(short\)\(handle\)\)/);
assert.match(m68k, /trap_1_wwlll\(\(short\)\(0x4B\),\(short\)\(mode\),\(long\)\(prog\),/);
assert.match(fromSdk('include/mint/mintbind.h'), /trap_1_wwll\(0x154, \(short\)\(mode\), \(long\)\(arg1\), \(long\)\(arg2\)\)/);
const consoleHeader = fromKernel('bdos/ssystem.h');
assert.match(consoleHeader, /#define S_CONSOLE_DIM\s+\(\(WORD\)0xfffe\)/);
const struct = /struct console_dim \{([^}]+)\};/.exec(consoleHeader)?.[1];
assert.ok(struct);
const words = [...struct.matchAll(/\bUWORD\s+(\w+);/g)].map(match => match[1]);
assert.deepEqual(words, abi.console.fields.map(field => field.name));
assert.match(fromKernel('include/portab.h'), /typedef\s+(?:unsigned short|uint16_t)\s+UWORD;/);

const startup = fromKernel('lib/ldso/startup.c');
assert.match(startup, /aux\[auxwords-2\] = aux\[auxwords-1\] = 0/);
assert.match(startup, /\(s.base \+ s.back - vectors\) & ~15U/);
const probe = fromKernel('tests/interp_probe/check.c');
assert.match(probe, /v \+= argc \+ 1/);
assert.match(probe, /v \+= 3/);
assert.match(probe, /v \+= 2/);
console.log('Verified CUIS constants and configuration, GEMDOS dispatch and SDK slots, console_dim fields, and ELF32 stack evidence');
