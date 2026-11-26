import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const json = path => JSON.parse(readFileSync(new URL(path, root), 'utf8'));
const abi = json('src/data/abi.json');
const { ptos, libcmini, paratos } = json('src/data/sources.json');
const [kernel, sdk, guest] = process.argv.slice(2);
if (!kernel || !sdk || !guest) throw new Error('Usage: node scripts/validate-upstream.mjs PTOS_CHECKOUT LIBCMINI_CHECKOUT PARATOS_CHECKOUT');
const show = (repo, { revision }, path) => execFileSync('git', ['-C', repo, 'show', `${revision}:${path}`], { encoding: 'utf8' });
const fromKernel = path => show(kernel, ptos, path);
const fromSdk = path => show(sdk, libcmini, path);

const cuis = fromKernel('include/cuis.h');
const define = (header, name) => Number(new RegExp(`^#define\\s+${name}\\s+(0x[0-9a-fA-F]+|\\d+)`, 'm').exec(header)?.[1]);
assert.equal(define(cuis, 'CUIS_SERVICE_CLASS'), abi.cuis.class);
assert.equal(define(cuis, 'CUIS_SESSION_QUERY'), abi.cuis.sessionQuery);
const x32Trap = fromKernel('bios/arch/x86_64/trap.c');
assert.match(x32Trap, /trap_class\s*=\s*frame->rax\s*>>\s*32/);
assert.match(x32Trap, /ULONG fn = \(ULONG\)frame->rax/);
const x32Classes = fromKernel('bios/arch/x86_64/trap.h');
for (const [name, value] of Object.entries(abi.x32.classes)) {
  assert.equal(define(x32Classes, 'X86_64_TRAP_' + name), value);
}
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

const { nativeCalls } = await import('../src/data/native-calls.ts');
const get = name => nativeCalls.find(call => call.name === name);
const kernelHeaders = {
  'include/pclone.h': 'Pclone',
  'include/threadcalls.h': ['Pthjoin', 'Ptermgrp'],
  'bdos/mintproc.h': ['Pfork', 'Pvfork', 'Pwait', 'Pwait3', 'Pwaitpid', 'Syield'],
  'include/mman.h': ['Mmap', 'Mprot', 'Munmap'],
};
for (const [path, names] of Object.entries(kernelHeaders)) {
  const header = fromKernel(path);
  for (const name of [names].flat()) assert.equal(define(header, 'GEMDOS_' + name.toUpperCase()), get(name).opcode);
}
const { ssystemModeGroups } = await import('../src/data/ssystem-modes.ts');
const documentedModes = ssystemModeGroups.flatMap(group => group.modes);
const ssystem = fromKernel('bdos/ssystem.c');
assert.match(ssystem, /wval_table\[\] = \{[^}]*SVAR_ENTRY\(0x446, bootdev\)/);
assert.match(ssystem, /bval_table\[\] = \{[^}]*SVAR_ENTRY\(0x484, conterm\)/);
assert.match(ssystem, /lval_table\[\] = \{[^}]*SVAR_ENTRY\(0x4ba, hz_200\)/);
assert.match(ssystem, /if \(p == &hz_200\)\s+return hz_200;/);
const ssystemDispatch = ssystem.split('\nLONG xssystem(')[1];
assert.ok(ssystemDispatch);
const dispatchModes = [...ssystemDispatch.matchAll(/^\s*case (S_[A-Z_]+):/gm)].map(match => match[1]);
assert.deepEqual(documentedModes.map(mode => mode.name).sort(), dispatchModes.sort());
for (const { name, number } of documentedModes) {
  const selector = new RegExp(`^#define ${name}\\s+(?:\\(\\(WORD\\))?(0x[0-9a-f]+|\\d+)\\b`, 'm')
    .exec(consoleHeader)?.[1];
  assert.equal(Number(selector), number & 0xffff, name);
}
console.log(`Verified all ${documentedModes.length} documented Ssystem selectors against the dispatcher and header`);
for (const [name, fn] of Object.entries({ LAUNCH_ATTACH: 93, STREAM_RECEIPT: 94, ENDPOINT_BARRIER: 95, STREAM_BATCH: 96 })) {
  assert.equal(define(cuis, `CUIS_${name}`), fn);
}
assert.equal(define(cuis, 'CUIS_STREAM_READ_ORIGIN'), 2);
assert.match(fromKernel('lib/aes/lifecycle.c'), /cuis_call6\(CUIS_STREAM_READ,[^;]+CUIS_STREAM_READ_ORIGIN,[^;]+&own_receipt/);
assert.match(fromKernel('bdos/ssystem.c'), /#if CONF_WITH_PROCESS_EXEC\s+case S_PROCEXEC/);
assert.match(fromKernel('bdos/ssystem.c'), /#if CONF_WITH_PROCESS_EXEC_DISPATCH\s+case S_PROCEXEC/);
assert.match(fromKernel('include/bdosdefs.h'), /PE_EXEC_REPLACE\s+200/);
const bdosConfig = fromKernel('bdos/Kconfig');
function configBody(name) {
  const definition = bdosConfig.split(`\nconfig ${name}\n`)[1];
  assert.ok(definition, name);
  return definition.split('\nconfig ')[0].split('\n    help')[0];
}
assert.match(configBody('CONF_WITH_STAGED_PEXEC'), /def_bool CONF_WITH_LEGACY_PEXEC \|\| !CONF_WITH_USER_ASPACE/);
assert.match(configBody('CONF_WITH_MULTITHREADING'), /depends on CONF_WITH_USER_ASPACE && \(!ARCH_ARM \|\| CPU_ARMV7\)\s+default y/);
assert.match(configBody('CONF_WITH_PREEMPTION'), /depends on CONF_WITH_MULTITHREADING[\s\S]+default y/);
assert.match(configBody('CONF_WITH_EXEC_REPLACE'), /depends on CONF_WITH_MULTITHREADING\s+depends on CONF_WITH_ELF_LOADER \|\| \(ARCH_M68K_CLASSIC && CONF_WITH_PRG_LOADER\)\s+default y/);
const fork = configBody('CONF_WITH_FORK');
assert.match(fork, /depends on CONF_WITH_EXEC_REPLACE[\s\S]+!CONF_M68K_ROM_WINDOW && !CONF_WITH_MFASTCALL[\s\S]+default y/);
assert.doesNotMatch(fork, /CONF_WITH_DEMAND_PAGING/);
assert.match(configBody('CONF_WITH_MMAP'), /depends on CONF_WITH_USER_ASPACE && CONF_WITH_DEMAND_PAGING/);
assert.match(configBody('CONF_WITH_PROCESS_EXEC'), /depends on CONF_WITH_USER_ASPACE && CONF_WITH_MULTITHREADING && CONF_WITH_SSYSTEM/);
assert.match(fromKernel('bdos/proc.c'), /#if CONF_WITH_EXEC_REPLACE\s+if \(flag == PE_EXEC_REPLACE\) return proc_exec_replace/);
assert.match(fromKernel('lib/aes/application.c'), /global->ap_id = \(short\)identity.client_id/);
assert.match(fromSdk('include/mint/mintbind.h'), /#define Ptermgrp\(status\).*0x192/);
assert.match(show(guest, paratos, 'host/posix/README.md'), /The first staged launch copies the accessible RAM/);
assert.match(show(guest, paratos, 'host/ptos/runtime.c'), /ptos_call\(GEMDOS_OP_PCLONE,/);
assert.match(show(guest, paratos, 'host/posix/proc.c'), /NOT_IMPLEMENTED\(GEMDOS, Ptermres, 49\)/);
assert.match(show(guest, paratos, 'host/posix/proc.c'), /int16_t Pvfork \( void \).*?return Pfork\(\);/s);
assert.match(show(guest, paratos, 'host/ptos/dispatch.c'), /case GEMDOS_OP_SYIELD: ptos_task_yield/);
assert.doesNotMatch(show(guest, paratos, 'host/ptos/dispatch.c'), /case GEMDOS_OP_P(?:CLONE|THJOIN|TERMGRP):/);
console.log('Verified pTOS master native opcodes, discovery and configuration and ParaTOS PR #27 guest paths');

const bootConfig = fromKernel('bdos/binfmt.c');
assert.ok(bootConfig.includes(String.raw`"A:\\PTOS.INI"`));
assert.match(bootConfig, /total > 65536UL/);
assert.match(fromKernel('bdos/binfmt.h'), /^#define BINFMT_RULES\s+8\b/m);
assert.match(fromKernel('bios/bios.c'), /init_default_environment\(\);[\s\S]*binfmt_boot_init\(\);[\s\S]*autoexec\(\);/);
const shells = fromKernel('util/shells.c');
assert.match(shells, /shell_names_desk\[\]\s*=\s*\{\s*"EMUDESK.PRG", "DESKTOP.PRG", NULL/);
assert.match(shells, /shell_names_cli\[\]\s*=\s*\{\s*"EMUCON.TOS", "EMUCON2.TOS", "COMMAND.TOS", "SHELL.TOS", NULL/);
assert.match(fromKernel('lib/ldso/build.mk'), /LDSO_RUNTIME_FILES = \$\(LDSO_RUNTIME_DIR\)\/LIB\/X32\/LD.SO \$\(LDSO_RUNTIME_DIR\)\/LIB\/X32\/LIBPTOS.SO/);
assert.match(fromKernel('lib/aes/build.mk'), /\/LIB\/X32\/LIBAES.SO:/);
assert.ok(fromKernel('vdi/Kconfig').includes(String.raw`"\\GEMSYS\\FONTS"`));
assert.ok(fromKernel('vdi/vdi_gdos.c').includes(String.raw`"\\GEMSYS\\PTOS.INF"`));
assert.match(fromKernel('vdi/vdi_gdos.c'), /^#define SYSTEM_FONT_KEY\s+"SYSTEMFONT"/m);
console.log('Verified pTOS boot configuration, external shell names, runtime files and font paths');
