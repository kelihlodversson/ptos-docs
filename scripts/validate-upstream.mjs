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
assert.match(dispatch, /#if ARCH_ARM \|\| \(CONF_WITH_NATIVE_ABI && CONF_WITH_USER_ASPACE\)\s+\{ NI,[^\n]+0x4B: historical Pexec/);
assert.match(dispatch, /#if CONF_WITH_PEXECVE\s+if \(fn == GEMDOS_PEXECVE\)/);
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
assert.match(startup, /aux\[auxwords\+\+\] = 0; aux\[auxwords\+\+\] = 0/);
assert.match(startup, /\(s.base \+ s.back - s.front\) & ~15U/);
const startupHeader = fromKernel('lib/ldso/startup.h');
const entryRole = fromKernel('lib/entry_role.h');
const elfCrt = fromSdk('sources/elfcrt.c');
assert.equal(define(startupHeader, 'DL_AT_PTOS_ENTRY_TYPE'), 0x5006);
assert.equal(define(elfCrt, 'AT_PTOS_ENTRY_TYPE'), 0x5006);
assert.equal(define(entryRole, 'PTOS_ENTRY_PROGRAM'), 0);
assert.equal(define(entryRole, 'PTOS_ENTRY_ACCESSORY'), 1);
assert.match(startupHeader, /DL_SHARED_STACK_SIZE\s+\(256UL \* 1024\)/);
assert.match(startup, /if \(vectors->entry_type != PTOS_ENTRY_PROGRAM\) \{\s+aux\[auxwords\+\+\] = DL_AT_PTOS_ENTRY_TYPE; aux\[auxwords\+\+\] = vectors->entry_type;/);
assert.match(elfCrt, /_app = entry_type != PTOS_ENTRY_ACCESSORY;/);
assert.match(fromSdk('sources/arch/elf-entry-note.h'), /\.balign 4\s+\.long 5, 4, 0x50544f53\s+\.asciz "pTOS"\s+\.balign 4\s+\.long 1/);
assert.match(fromKernel('bdos/elfld.c'), /note\[0\] == 5 && note\[1\] == 4 && note\[2\] == 0x50544f53UL/);
assert.match(fromKernel('bdos/elfld.c'), /\.argc = 1, \.entry_type = PTOS_ENTRY_ACCESSORY/);
assert.match(fromKernel('lib/ldso/arch/x32/dyncrt.S'), /call __ptos_is_application@PLT\s+movw %ax, _app\(%rip\)/);
assert.match(fromKernel('lib/ldso/build.mk'), /^obj\/ldso\/dynacccrt\.o: obj\/ldso\/dyncrt\.o$/m);
const probe = fromKernel('tests/interp_probe/check.c');
assert.match(probe, /v \+= argc \+ 1/);
assert.match(probe, /v \+= 3/);
assert.match(probe, /v \+= 2/);
console.log('Verified CUIS constants and configuration, GEMDOS dispatch and SDK slots, console_dim fields, and ELF32 stack and entry roles');

const { nativeCalls } = await import('../src/data/native-calls.ts');
const get = name => nativeCalls.find(call => call.name === name);
const kernelHeaders = {
  'include/pexecve.h': 'Pexecve',
  'include/fpoll_abi.h': 'Fpoll_time64',
  'include/pclone.h': 'Pclone',
  'include/threadcalls.h': ['Pthjoin', 'Ptermgrp'],
  'bdos/mintproc.h': ['Pfork', 'Pvfork', 'Pwait', 'Pwait3', 'Pwaitpid', 'Syield'],
  'include/mman.h': ['Mmap', 'Mprot', 'Munmap'],
};
for (const [path, names] of Object.entries(kernelHeaders)) {
  const header = fromKernel(path);
  for (const name of [names].flat()) assert.equal(define(header, 'GEMDOS_' + name.toUpperCase()), get(name).opcode);
}
const pollHeader = fromKernel('include/fpoll_abi.h');
const sdkPollHeader = fromSdk('include/mint/poll.h');
const pollCall = get('Fpoll_time64');
assert.ok(sdkPollHeader.includes(pollCall.prototype));
assert.equal(define(pollHeader, 'PTOS_POLL_MAX'), 1024);
assert.equal(define(pollHeader, 'GEMDOS_FPOLL'), 0x15a);
assert.equal(define(pollHeader, 'GEMDOS_FSELECT'), 0x11d);
assert.match(pollHeader, /LONG fd;\s+UWORD events;\s+UWORD revents;\s*\} PTOS_POLLFD;/);
assert.match(pollHeader, /sizeof\(PTOS_POLLFD\) == 8/);
assert.match(sdkPollHeader, /int32_t fd;\s+uint16_t events;\s+uint16_t revents;/);
assert.deepEqual(pollCall.layout.fields.map(({ name, offset, bytes }) => [name, offset, bytes]), [
  ['fd', 0, 4], ['events', 4, 2], ['revents', 6, 2],
]);
for (const [name, value] of pollCall.eventFlags) {
  assert.equal(define(pollHeader, `PTOS_${name}`), value, name);
  assert.equal(define(sdkPollHeader, name), value, name);
}
assert.match(dispatch, /#if CONF_WITH_FPOLL_TIME64[\s\S]*?POLL_ARG\(3\) << 32\) \| \(ULONG\)POLL_ARG\(4\)[\s\S]*?#if ARCH_M68K\s+if \(fn == GEMDOS_FPOLL\)[\s\S]*?if \(fn == GEMDOS_FSELECT\)/);
const sdkPoll = fromSdk('sources/fpoll_time64.c');
assert.match(sdkPoll, /trap_1_wllll\(GEMDOS_FPOLL_TIME64,[^;]+\(bits >> 32\), \(long\)\(uint32_t\)bits\)/);
assert.match(sdkPoll, /timeout \? \(int64_t\)timeout : -1/);
assert.match(sdkPoll, /masks\[i\] \|= masks\[j\];\s+output\[j\] = NULL;/);
assert.equal(define(fromKernel('bdos/fs.h'), 'GEMDOS_FCNTL'), 0x104);
assert.equal(define(fromKernel('bdos/fs.h'), 'GEMDOS_F_GETFL'), 3);
assert.match(dispatch, /#if CONF_WITH_USER_ASPACE\s+if \(fn == GEMDOS_FCNTL\)/);
assert.match(fromKernel('bdos/fsclose.c'), /if \(command != GEMDOS_F_GETFL\)\s+return EINVFN;/);
console.log('Verified Fpoll_time64 layout and event masks, polling adapters and Fcntl(F_GETFL)');
assert.ok(m68k.includes(get('Pexecve').prototype.replace(/\s+/g, ' ')));
assert.deepEqual(get('Pexecve').args.map(([, bytes]) => bytes), [2, 4, 4, 4]);
assert.match(fromSdk('sources/pexecve.c'), /trap_1_wwlll\(PEXECVE_NATIVE, mode, \(long\)path, \(long\)argv, \(long\)envp\)/);
assert.match(fromSdk('sources/pexec_compat.c'), /return Pexecve\(mode, prog, classic, environ \? environ : empty_env\)/);
assert.match(fromKernel('include/pexecve.h'), /PEXECVE_PATH_MAX\s+1024UL[\s\S]*PEXECVE_ARG_MAX\s+65536UL[\s\S]*PEXECVE_MAX_ENTRIES\s+1024UL/);
const processExec = fromKernel('include/process_exec.h');
for (const { name, offset } of get('S_PROCEXEC').layout.fields) {
  assert.match(processExec, new RegExp(`offsetof\\(PROCESS_EXEC_REQUEST,${name}\\)==${offset}\\b`), name);
}
assert.equal(define(processExec, 'PROCESS_EXEC_VECTOR_ARGS'), 1);
assert.equal(define(processExec, 'PROCESS_EXEC_ACCESSORY'), 2);
assert.equal(define(cuis, 'CUIS_LAUNCH_VECTORS'), 4);
assert.match(fromKernel('aes/cuis_session.c'), /vectors && \(tail != sizeof\(request\) \|\| environment \|\| directory\)/);
assert.match(fromKernel('aes/cuis_session.c'), /console && \(request.flags & PROCESS_EXEC_ACCESSORY\)/);
assert.match(fromKernel('bdos/process_exec_request.c'), /request->policy \|\| \(request->operation != PROCESS_EXEC_PREPARE &&\s+request->operation != PROCESS_EXEC_START\)/);
assert.equal(define(fromKernel('include/gem_shelw.h'), 'SWM_LAUNCHACC'), 3);
assert.match(fromKernel('lib/aes/shell.c'), /mode == SWM_LAUNCHACC \? SHELL_ACCESSORY/);
assert.match(fromKernel('lib/aes/application.c'), /__ptos_entry_type\(\) == PTOS_ENTRY_ACCESSORY \?\s+APP_ACCESSORY : APP_APPLICATION/);
const launchRecords = fromKernel('lib/ldso/launch.h');
assert.equal(define(launchRecords, 'DL_AT_PTOS_LAUNCH_VECTORS'), 0x5004);
const { aesVectorCalls } = await import('../src/data/aes-vector-calls.ts');
const libaesHeader = fromKernel('include/libaes.h').replace(/\s+/g, ' ');
const libaesExports = fromKernel('lib/aes/exports.map');
for (const { name, prototype } of aesVectorCalls) {
  const declaration = prototype.replace(/\s+/g, ' ').replace(` ${name}(`, ` mt_${name}(`)
    .replace(');', ', AESGLOBAL *global);');
  assert.ok(libaesHeader.includes(declaration), declaration);
  assert.match(libaesExports, new RegExp(`\\bmt_${name};`));
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
const dispatchModes = [...ssystemDispatch.matchAll(/^\s*case ([A-Z][A-Z0-9_]*):/gm)].map(match => match[1]);
assert.deepEqual(documentedModes.map(mode => mode.name).sort(), dispatchModes.sort());
for (const { name, number } of documentedModes) {
  const selector = new RegExp(`^#define ${name}\\s+(?:\\(\\(WORD\\))?(0x[0-9a-f]+|\\d+)\\b`, 'm')
    .exec(consoleHeader)?.[1];
  assert.equal(Number(selector), number & 0xffff, name);
}
console.log(`Verified all ${documentedModes.length} documented Ssystem selectors against the dispatcher and header`);
const { cuisArguments, cuisGroups, cuisImplementation } = await import('../src/data/cuis-calls.ts');
const cuisCalls = cuisGroups.flatMap(group => group.calls);
const cuisTrap = x32Trap.split('case CUIS_SERVICE_CLASS:')[1].split('case VDI_SERVICE_CLASS:')[0];
const dispatchedCuisCalls = new Set([...cuisTrap.matchAll(/fn == (CUIS_\w+)/g)].map(match => match[1]));
const cuisSession = fromKernel('aes/cuis_session.c');
for (const handler of ['cuis_service', 'cuis_window_service', 'cuis_input_config', 'cuis_peer_service', 'cuis_entry_service']) {
  const body = new RegExp(`^LONG ${handler}\\([\\s\\S]*?^\\}`, 'm').exec(cuisSession)?.[0];
  assert.ok(body, handler);
  for (const [, name] of body.matchAll(/(?:case |function\s*(?:==|!=)\s*)(CUIS_\w+)/g)) dispatchedCuisCalls.add(name);
}
assert.deepEqual(cuisCalls.map(call => call.name).sort(), [...dispatchedCuisCalls].sort());
assert.equal(new Set(cuisCalls.map(call => call.opcode)).size, cuisCalls.length);
const cuisDispatch = new Map(Array.from(cuisTrap.matchAll(/(\w+)\((fn,\s*)?(frame->\w+(?:,\s*frame->\w+)*)\)/g),
  ([, handler, shared, args]) => [handler, { shared, registers: Array.from(args.matchAll(/frame->(\w+)/g), match => match[1].toUpperCase()) }]));
const implementationSources = new Map([...new Set(cuisCalls.map(cuisImplementation))].map(path => [path, fromKernel(path)]));
for (const call of cuisCalls) {
  assert.equal(define(cuis, call.name), call.opcode, call.name);
  const dispatch = cuisDispatch.get(call.handler);
  assert.ok(dispatch, call.handler);
  assert.deepEqual(dispatch.registers, cuisArguments.slice(0, dispatch.registers.length), call.name);
  if (dispatch.shared) assert.ok(call.parameters.length <= dispatch.registers.length, call.name);
  else assert.equal(call.parameters.length, dispatch.registers.length, call.name);
  assert.match(implementationSources.get(cuisImplementation(call)), new RegExp(`^LONG ${call.handler}\\(`, 'm'));
}
console.log(`Verified all ${cuisCalls.length} documented CUIS selectors and register slots against the dispatcher and header`);
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
assert.match(configBody('CONF_WITH_STAGED_PEXEC'), /def_bool CONF_WITH_LEGACY_PEXEC \|\| \(!CONF_WITH_USER_ASPACE && !ARCH_ARM\)/);
assert.match(configBody('CONF_WITH_ARM_SHARED_EXEC'), /def_bool ARCH_ARM && !CONF_WITH_USER_ASPACE && CONF_WITH_ELF_LOADER/);
assert.match(configBody('CONF_WITH_M68K_SHARED_EXEC'), /depends on ARCH_M68K_CLASSIC && !CONF_WITH_USER_ASPACE\s+depends on CONF_WITH_PRG_LOADER \|\| CONF_WITH_ELF_LOADER\s+default y/);
assert.match(configBody('CONF_WITH_SHARED_EXEC'), /def_bool CONF_WITH_ARM_SHARED_EXEC \|\| CONF_WITH_M68K_SHARED_EXEC/);
assert.match(configBody('CONF_WITH_PEXECVE'), /def_bool CONF_WITH_SHARED_EXEC \|\| \(CONF_WITH_USER_ASPACE && \(CONF_WITH_MULTITHREADING \|\| CONF_WITH_NATIVE_ABI\)\)/);
assert.match(fromKernel('bdos/proc.c'), /#if CONF_WITH_SHARED_EXEC\s+LONG xpexecve\([^)]*\)[\s\S]*?if \(mode != PE_LOADGO\)\s+return EINVFN;/);
assert.match(configBody('CONF_WITH_MULTITHREADING'), /depends on CONF_WITH_USER_ASPACE && \(!ARCH_ARM \|\| CPU_ARMV7\)\s+default y/);
assert.match(configBody('CONF_WITH_PREEMPTION'), /depends on CONF_WITH_MULTITHREADING[\s\S]+default y/);
assert.match(configBody('CONF_WITH_EXEC_REPLACE'), /depends on CONF_WITH_MULTITHREADING\s+depends on CONF_WITH_ELF_LOADER \|\| \(ARCH_M68K_CLASSIC && CONF_WITH_PRG_LOADER\)\s+default y/);
const fork = configBody('CONF_WITH_FORK');
assert.match(fork, /depends on CONF_WITH_EXEC_REPLACE[\s\S]+!CONF_M68K_ROM_WINDOW && !CONF_WITH_MFASTCALL[\s\S]+default y/);
assert.doesNotMatch(fork, /CONF_WITH_DEMAND_PAGING/);
assert.match(configBody('CONF_WITH_MMAP'), /depends on CONF_WITH_USER_ASPACE && CONF_WITH_DEMAND_PAGING/);
assert.match(configBody('CONF_WITH_PROCESS_EXEC'), /depends on CONF_WITH_USER_ASPACE && CONF_WITH_MULTITHREADING && CONF_WITH_SSYSTEM/);
assert.match(configBody('CONF_WITH_FPOLL_TIME64'), /def_bool CONF_WITH_PROCESS_FILES && CONF_WITH_USER_COPY\s+depends on !TARGET_AMIGA_ROM \|\| CONF_AMIGA_ROM_512K/);
assert.match(fromKernel('bdos/proc.c'), /#if CONF_WITH_EXEC_REPLACE\s+if \(flag == PE_EXEC_REPLACE\) return proc_exec_replace/);
assert.match(fromKernel('lib/aes/application.c'), /global->ap_id = \(short\)identity.client_id/);
assert.match(fromSdk('include/mint/mintbind.h'), /#define Ptermgrp\(status\).*0x192/);
assert.match(show(guest, paratos, 'host/posix/README.md'), /The first staged launch copies the accessible RAM/);
assert.match(show(guest, paratos, 'host/ptos/runtime.c'), /ptos_call\(GEMDOS_OP_PCLONE,/);
assert.match(show(guest, paratos, 'host/ptos/runtime.c'), /ptos_call\(GEMDOS_OP_PEXECVE, mode, \(intptr_t\)path,\s*\(intptr_t\)argv, \(intptr_t\)envp\)/);
assert.match(show(guest, paratos, 'host/ptos/process.c'), /ptos_task_exec\(mode, ptos_executable, options, envp\)/);
assert.match(show(guest, paratos, 'host/ptos/main.c'), /AT_PTOS_LAUNCH_VECTORS = 0x5004/);
assert.match(show(guest, paratos, 'host/ptos/dispatch.c'), /case GEMDOS_OP_PEXEC: \{/);
assert.match(show(guest, paratos, 'host/posix/proc.c'), /NOT_IMPLEMENTED\(GEMDOS, Ptermres, 49\)/);
assert.match(show(guest, paratos, 'host/posix/proc.c'), /int16_t Pvfork \( void \).*?return Pfork\(\);/s);
assert.match(show(guest, paratos, 'host/ptos/dispatch.c'), /case GEMDOS_OP_SYIELD: ptos_task_yield/);
assert.doesNotMatch(show(guest, paratos, 'host/ptos/dispatch.c'), /case GEMDOS_OP_P(?:CLONE|THJOIN|TERMGRP):/);
console.log('Verified pTOS master native opcodes, discovery, ARM and 68k shared launch, and ParaTOS main guest paths');

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
