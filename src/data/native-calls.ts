import type { CPU, Source } from './catalog';

type Argument = [name: string, bytes: 2 | 4, meaning: string];
export interface NativeCall {
  name: string;
  title: string;
  opcode: number;
  prototype: string;
  args: Argument[];
  description: string[];
  result: string;
  config: string;
  paraTos: string;
  sources: Source[];
  related: string[];
  historical?: string;
  mode?: number;
  targets?: Partial<Record<CPU, string>>;
  status?: 'experimental';
  layout?: {
    caption: string;
    bytes: number;
    alignment: number;
    align68k?: number;
    fields: { name: string; offset: number; bytes: number; detail: string }[];
  };
}

const processConfig = 'Managed user process with CONF_WITH_KPROC and CONF_WITH_NATIVE_SCHED on a supported MMU build.';
const paraPosix: Source = ['paratos', 'host/posix/README.md', 'ParaTOS POSIX backend contract'];
const paraTests: Source = ['paratos', 'tests/posix/pexec.py', 'ParaTOS PR #27 execution and fork tests'];
const paraDispatch: Source = ['paratos', 'host/ptos/dispatch.c', 'pTOS-hosted guest GEMDOS dispatcher'];
const paraPosixDispatch: Source = ['paratos', 'gemdos/gemdos_dispatch.c', 'POSIX guest GEMDOS dispatcher'];
const paraPosixProcess: Source = ['paratos', 'host/posix/proc.c', 'POSIX guest fork, exit and residency'];
const paraSsystem: Source = ['paratos', 'host/posix/sys.c', 'POSIX guest Ssystem mode dispatch'];
const noGuestOpcode = 'Neither the POSIX nor the pTOS-hosted 68k guest dispatcher exposes this opcode in ParaTOS PR #27.';
const noGuestMode = 'This native Ssystem mode is unsupported in the POSIX and pTOS-hosted guest dispatchers in ParaTOS PR #27.';
const sdk: Source = ['libcmini', 'include/mint/mintbind.h', 'SDK GEMDOS bindings'];
const mintDispatcher: Source = ['ptos', 'bdos/mintproc.c', 'GEMDOS process dispatcher'];
const procConfig: Source = ['ptos', 'bdos/Kconfig', 'Configuration gates'];
const processTests: Source = ['ptos', 'tests/pclone/process_wait.h', 'Native wait regression'];
const historical = (name: string) => `/historical/en/${name.toLowerCase()}/`;
const forkConfig = 'CONF_WITH_PFORK on supported demand-paging MMU builds. The saved-return path requires x32 without FS/GS bases, ARMv7 A32 with idle VFP, or a non-fastcall 68040 format-0 trap frame with idle FPU. Other contexts return EINVFN.';
const forkCommon = [
  'Creates a distinct PROCESS and PID with a private copy-on-write address space and user stack. It inherits open file bindings with shared file positions, current directories, DTA and search state, environment and limits.',
  'A shared-root or multithreaded caller is refused. The native caller needs a managed scheduler anchor and an admitted user-return context.',
];
const forkSources: Source[] = [
  ['ptos', 'bdos/mintproc.h', 'MiNT opcode constants'],
  ['ptos', 'doc/freemint-compatibility.txt', 'Native fork compatibility and admitted CPU state'],
  ['ptos', 'tests/pclone/fork_parent_native.c', 'Native fork and exact-child synchronization tests'],
  procConfig, sdk, paraPosix, paraTests, paraPosixProcess, paraDispatch,
];
const paraFork = 'On the POSIX backend, private guest RAM uses host copy-on-write. After staged Pexec enables shared guest RAM, an ordinary fork creates a private snapshot before the parent returns. The pTOS-hosted 68k guest dispatcher does not expose this call.';
const waitArgs: Argument[] = [
  ['flags', 2, 'Bit 0 is WNOHANG. Bit 1 is accepted for compatibility with stopped-child reporting. Other bits return EINVAL.'],
  ['usage', 4, 'Null, or a writable array of two 32-bit words for approximate user time in milliseconds and zero system time.'],
];
const waitResult = 'A successful reap consumes one completion. Bits 31–16 are PID, bits 15–8 are the fault signal, and bits 7–0 are the normal exit code. Failed usage copyout leaves the completion available. No matching unreaped child returns EFILNF.';
const waitDescription = 'The caller can reap direct children once. A public wait cannot consume the child claimed by synchronous managed Pexec(0). An optional CUIS notification keeps its independent completion.';
const waitSources: Source[] = [mintDispatcher, ['ptos', 'doc/mint-calls.txt', 'Native PROCESS wait ABI'], processTests, sdk,
  paraPosix, paraDispatch, ['paratos', 'test_programs/syscalls/pfork_waitpid.c', 'ParaTOS guest fork and wait test']];
const paraWait = 'The POSIX backend collects eligible staged and native children. Synchronous Pexec reserves its own child. Staged waits report zero resource usage. The pTOS-hosted guest dispatcher handles this call through its guest task wait path.';
const ssystemSource: Source = ['ptos', 'bdos/ssystem.c', 'Ssystem dispatch and discovery'];
const ssystemHeader: Source = ['ptos', 'bdos/ssystem.h', 'Mode constants and structure declarations'];

export const nativeCalls: NativeCall[] = [
  {
    name: 'Pclone', title: 'Create a managed process or thread sharing an address space', opcode: 0x190,
    prototype: 'long Pclone(const struct ptos_clone_args *args, unsigned long size);',
    args: [['args', 4, 'Pointer to the native 32-bit argument record.'], ['size', 4, 'Byte size. The original prefix is 28 bytes. The optional PID output starts at size 32.']],
    description: [
      'CLONE_VM (bit 0) starts a distinct PROCESS in the same ASPACE. CLONE_VM | CLONE_SAME_PROCESS (bit 1) adds a THREAD to the same PROCESS. Private-VM function-entry startup returns EINVFN.',
      'In a new PROCESS, CLONE_COPY_STANDARD_HANDLES (bit 2) copies standard bindings, CLONE_COPY_CWD (bit 3) copies current directories and CLONE_COPY_ALL_HANDLES (bit 4) copies every descriptor binding when CONF_WITH_PROCESS_FILES is enabled. The latter includes standard handles. Independent descriptor tables share underlying open files and file positions. Resource-copy flags are invalid with CLONE_SAME_PROCESS. A new shared-VM process starts with no selected DTA or search state.',
      'The entry function takes the opaque argument. A normal return terminates its THREAD with status zero. Set tls to null. Output words must be writable, native-aligned and disjoint from one another and from the entry, return-bridge and startup-stack areas.',
      'Each field occupies four bytes, including pointer values on x32. Structure alignment is two on 68k and four on ARM/x32. Entry address and startup stack have additional architecture constraints. The configured stack alignment/minimum is 2/16 bytes on 68k, 8/16 on ARM and 16/256 on x32. Entry address alignment is 2, 4 and 1 bytes respectively.',
    ],
    result: 'Returns a positive TID. Optional child_tid and child_pid stores publish initial identities only. Invalid flags, size, alignment or TLS return EINVAL. Bad ranges return EIMBA. Allocation and backing failures can return ENSMEM or EREADF. An exhausted identity or task limit can return EAGAIN. Unsupported policies return EINVFN without publication.',
    config: processConfig + ' Requires CONF_WITH_PCLONE and usable architecture startup. The function signature describes the GEMDOS wrapper ABI.',
    paraTos: 'The pTOS-hosted ParaTOS backend uses this native call internally to run a staged 68k guest in a distinct PROCESS sharing guest mappings. The guest GEMDOS dispatchers do not expose the opcode.',
    sources: [['ptos', 'include/pclone.h', 'Structure, flags and opcode'],
      ['ptos', 'doc/clone-public-integration.txt', 'Publication and public startup contract'],
      ['ptos', 'tests/clone/abi_layout.c', 'Cross-ABI structure checks'], mintDispatcher, procConfig,
      ['ptos', 'tests/pclone/public_contract.h', 'Native runtime contract fixture'],
      ['paratos', 'host/ptos/runtime.c', 'ParaTOS native host clone consumer'],
      ['paratos', 'tests/ptos/pclone_guest.c', 'ParaTOS guest clone fixture'], paraDispatch, paraPosixDispatch],
    related: ['Pthjoin', 'Ptermgrp', 'Pexec', 'Pfork'],
    layout: { caption: 'ptos_clone_args with optional child_pid', bytes: 32, alignment: 4, align68k: 2, fields: [
      { name: 'flags', offset: 0, bytes: 4, detail: 'Unsigned CLONE_* mask.' },
      { name: 'entry', offset: 4, bytes: 4, detail: 'Pointer to void entry(void *).' },
      { name: 'argument', offset: 8, bytes: 4, detail: 'Opaque argument value.' },
      { name: 'stack_base', offset: 12, bytes: 4, detail: 'Start of user-provided stack.' },
      { name: 'stack_size', offset: 16, bytes: 4, detail: 'Stack capacity in bytes.' },
      { name: 'tls', offset: 20, bytes: 4, detail: 'Reserved. Must be zero.' },
      { name: 'child_tid', offset: 24, bytes: 4, detail: 'Optional int32_t output pointer.' },
      { name: 'child_pid', offset: 28, bytes: 4, detail: 'Optional int32_t output pointer, present at size 32 or larger.' },
    ] },
  },
  {
    name: 'Pthjoin', title: 'Join a managed thread in the calling process', opcode: 0x191,
    prototype: 'long Pthjoin(long tid, int32_t *status);',
    args: [['tid', 4, 'Published TID belonging to the current PROCESS.'], ['status', 4, 'Optional writable native-aligned word. Null discards status.']],
    description: [
      'Waits until the THREAD has stopped and its execution resources have been reclaimed. A successful caller can then reuse the user-supplied stack. Only one waiter consumes the completion.',
      'A failed output copy leaves the completion available to a subsequent join. Joining a THREAD leaves PROCESS child status and GUI notifications independent.',
    ],
    result: 'Zero on success. The optional output zero-extends the raw 16-bit THREAD status, including 0xFFFF for a fault. ESRCH covers unknown or foreign TIDs, EDEADLK covers self or cyclic joins, EACCDN covers a competing claim, and EIMBA covers invalid output.',
    config: processConfig + ' Requires CONF_WITH_PCLONE and CONF_WITH_PTHJOIN. Unmanaged or disabled calls return EINVFN.',
    paraTos: noGuestOpcode,
    sources: [['ptos', 'include/threadcalls.h', 'Join opcode and result ABI'],
      ['ptos', 'doc/thread-joining.txt', 'Join behavior and error contract'],
      ['ptos', 'tests/kthread_join.c', 'Join completion and consumption regression'], mintDispatcher, procConfig, paraDispatch, paraPosixDispatch],
    related: ['Pclone', 'Ptermgrp', 'Pwaitpid'],
  },
  {
    name: 'Ptermgrp', title: 'Terminate all managed threads of the calling process', opcode: 0x192,
    prototype: 'long Ptermgrp(short status);',
    args: [['status', 2, 'Raw 16-bit PROCESS termination status.']],
    description: [
      'The first accepted request latches the status. Siblings terminate at safe kernel boundaries. Syield, Pthjoin and PROCESS waits can reach cancellation checkpoints. Nested synchronous children and separate PROCESSes sharing the ASPACE retain their own lifetimes.',
      'Cancellation is cooperative. A sibling that never reaches a safe boundary can delay final completion. PROCESS resources and public wait status settle only after the last THREAD retires.',
    ],
    result: 'Success does not return. Disabled or unmanaged requests return EINVFN. A reentrant termination-hook request can return EACCDN.',
    config: processConfig + ' Requires CONF_WITH_PCLONE and CONF_WITH_PTERMGRP.',
    paraTos: noGuestOpcode,
    sources: [['ptos', 'include/threadcalls.h', 'Public opcode'], ['ptos', 'doc/group-exit.txt', 'Cancellation and PROCESS completion'],
      ['ptos', 'tests/pclone/group_child.c', 'Nested child cancellation fixture'], mintDispatcher, procConfig, sdk, paraDispatch, paraPosixDispatch],
    related: ['Pclone', 'Pthjoin', 'Pterm', 'Pwaitpid'],
  },
  ...([['Pfork', 0x11b, 'Fork a private copy-on-write process', false],
    ['Pvfork', 0x113, 'Fork and suspend the calling parent thread', true]] as const).map(([name, opcode, title, suspended]): NativeCall => ({
    name, title, opcode, prototype: `long ${name}(void);`, args: [], historical: historical(name),
    description: [...forkCommon, suspended
      ? 'The calling parent THREAD resumes only after the exact child completes or commits Pexec(200) in the same PROCESS. Failed replacement or another child’s exit leaves it suspended. Ordinary private child writes are isolated from the parent.'
      : 'The parent can run immediately after successful publication. Both continuations resume after the original trap.'],
    result: 'Parent receives the child PID, child receives zero, and failure returns a negative GEMDOS error.',
    config: forkConfig,
    paraTos: suspended ? 'POSIX Pvfork calls Pfork, so the parent does not wait for exact-child exit or committed replacement. With shared guest RAM, it still waits for the child to acknowledge its private snapshot. The pTOS-hosted guest dispatcher does not expose Pvfork.' : paraFork,
    sources: forkSources,
    related: [suspended ? 'Pfork' : 'Pvfork', 'Pexec', 'Pwaitpid'],
  })),
  ...([
    ['Pwait', 0x109, 'long Pwait(void);', [], 'Equivalent to Pwaitpid(-1, 2, NULL).'],
    ['Pwait3', 0x11c, 'long Pwait3(short flags, long *usage);', waitArgs, 'Equivalent to Pwaitpid(-1, flags, usage).'],
    ['Pwaitpid', 0x13a, 'long Pwaitpid(short pid, short flags, long *usage);',
      [['pid', 2, 'Positive direct-child PID or −1 for any direct child. Group selectors return EINVFN.'], ...waitArgs],
      'WNOHANG returns zero for an eligible child that is still running. An exact wait claimed by another THREAD returns EACCDN. pTOS has no stopped-child states.'],
  ] satisfies [string, number, string, Argument[], string][]).map(([name, opcode, prototype, args, detail]): NativeCall => ({
    name, title: 'Wait for and reap a child process', opcode, prototype, args, historical: historical(name),
    description: [detail, waitDescription], result: waitResult, config: processConfig, paraTos: paraWait,
    sources: waitSources, related: ['Pexec', 'Pfork', 'Pvfork'].concat(name === 'Pwaitpid' ? [] : ['Pwaitpid']),
  })),
  ...([
    ['Pterm', 0x4c, 'void Pterm(short status);', [['status', 2, 'Raw 16-bit exit status.']]],
    ['Pterm0', 0x00, 'void Pterm0(void);', []],
    ['Ptermres', 0x31, 'void Ptermres(long keep, short status);', [['keep', 4, 'Byte count to keep resident.'], ['status', 2, 'Raw 16-bit exit status.']]],
  ] satisfies [string, number, string, Argument[]][]).map(([name, opcode, prototype, args]): NativeCall => ({
    name, title: name === 'Ptermres' ? 'Terminate and retain resident memory' : 'Terminate the calling thread',
    opcode, prototype, args, historical: historical(name),
    description: name === 'Ptermres'
      ? ['A managed process with live sibling THREADs is refused before residency changes. A sole THREAD can use the existing residency path.']
      : [`${name === 'Pterm0' ? 'Uses status zero. ' : ''}Managed termination stops the calling THREAD, including when the caller was the initial THREAD. The final THREAD owns PROCESS completion and resource cleanup.`],
    result: name === 'Ptermres' ? 'Success does not return. The native dispatcher can return EACCDN when live sibling THREADs prevent residency.'
      : 'Does not return. A join can observe THREAD status, and the PROCESS wait becomes eligible after the final THREAD exits.',
    config: 'The ordinary GEMDOS calls are available on the legacy ABI. The THREAD distinctions apply in managed native builds.',
    paraTos: name === 'Ptermres' ? 'Ptermres is unimplemented in the POSIX backend and unavailable in the pTOS-hosted guest dispatcher.'
      : 'ParaTOS POSIX Pterm ends the calling guest and closes its descriptors. The initial guest waits for staged descendants before returning its status.',
    sources: [['ptos', 'bdos/proc.c', 'GEMDOS termination handlers'], ['ptos', 'doc/thread-group-execution.txt', 'THREAD and PROCESS lifetime'],
      ['ptos', 'tests/pclone/public_contract.h', 'Native lifecycle fixture'], paraPosix,
      paraPosixProcess, paraDispatch],
    related: ['Ptermgrp', 'Pthjoin', 'Pwaitpid'],
  })),
  {
    name: 'Syield', title: 'Yield the managed execution slot', opcode: 0xff, prototype: 'int Syield(void);', args: [], historical: historical('Syield'),
    description: ['Gives runnable managed peers an opportunity to run and checks pending group cancellation at a safe boundary. The independent timer-preemption capability is configuration-gated.'],
    result: 'Returns the scheduler result as an int in the SDK. A THREAD cancelled at the boundary does not resume.',
    config: processConfig, paraTos: 'The pTOS-hosted guest dispatcher yields its guest task. The POSIX backend leaves Syield unimplemented.',
    sources: [mintDispatcher, ['ptos', 'bdos/native_sched.c', 'Native yield implementation'], sdk, paraDispatch, paraSsystem],
    related: ['Ptermgrp', 'Pthjoin', 'Pause', 'Fselect'],
  },
  {
    name: 'S_PROCNAME', title: 'Read the current native process image name', opcode: 0x154, mode: -7,
    prototype: 'long Ssystem(short mode, long buffer, long capacity);',
    args: [['mode', 2, 'S_PROCNAME (−7).'], ['buffer', 4, 'Address of a writable character buffer.'], ['capacity', 4, 'Capacity including the terminating NUL.']],
    description: ['Copies the current PROCESS loaded-image basename as a NUL-terminated string. The result is taken from the PROCESS identity independently of GEM client registration or naming.'],
    result: 'Returns the name length excluding NUL, at most 32 bytes. Insufficient capacity returns ERANGE without copying. An invalid destination returns EIMBA. No current identity returns EFILNF.',
    config: 'Requires CONF_WITH_SSYSTEM and CONF_WITH_KPROC. S_INQUIRE discovers the mode.',
    paraTos: noGuestMode,
    sources: [ssystemSource, ssystemHeader, ['ptos', 'doc/mint-calls.txt', 'Native identity information contract'],
      ['ptos', 'tests/pclone/process_search.h', 'Native identity and name probes'], sdk, paraDispatch, paraSsystem],
    related: ['Ssystem', 'S_PROCIDENT', 'appl_init'],
  },
  {
    name: 'S_PROCIDENT', title: 'Read a process identity snapshot', opcode: 0x154, mode: -8,
    prototype: 'long Ssystem(short mode, long identity, long size);',
    args: [['mode', 2, 'S_PROCIDENT (−8).'], ['identity', 4, 'Address of a writable PROCESS_IDENTITY.'], ['size', 4, 'Exactly 16 bytes.']],
    description: [
      'Select current PROCESS (selector 0, number and PID zero), a nonzero PROCESS number (selector 1, PID zero), or a PID 1–32767 (selector 2, number zero). The copyout contains the number, PID and zero selector.',
      'The PROCESS number is non-recycled. Its two 32-bit words are low then high in both byte orders. The snapshot grants no ownership or wait rights and can describe a retained, retired identity.',
    ],
    result: 'Zero on success. ESRCH indicates an unknown identity, EINVAL a malformed key or wrong size, and EIMBA a copy fault.',
    config: 'Requires CONF_WITH_SSYSTEM and CONF_WITH_KPROC. S_INQUIRE discovers the mode.',
    paraTos: noGuestMode,
    sources: [ssystemSource, ssystemHeader, ['ptos', 'include/process_identity.h', 'Fixed layout and query selectors'],
      ['ptos', 'tests/process_identity_layout.c', 'ABI layout checks'], ['ptos', 'tests/pclone/process_search.h', 'Native identity probes'], sdk, paraDispatch, paraSsystem],
    related: ['Ssystem', 'S_PROCNAME', 'S_PROCEXEC', 'appl_init'],
    layout: { caption: 'PROCESS_IDENTITY', bytes: 16, alignment: 4, fields: [
      { name: 'number_low', offset: 0, bytes: 4, detail: 'Low 32 bits of the PROCESS number.' },
      { name: 'number_high', offset: 4, bytes: 4, detail: 'High 32 bits of the PROCESS number.' },
      { name: 'pid', offset: 8, bytes: 4, detail: 'Recyclable signed MiNT PID.' },
      { name: 'selector', offset: 12, bytes: 4, detail: 'Selects input key. The returned selector is zero.' },
    ] },
  },
  {
    name: 'S_PROCEXEC', title: 'Private native process launch and observation transport', opcode: 0x154, mode: -9,
    prototype: 'long Ssystem(short mode, long request, long size);',
    args: [['mode', 2, 'S_PROCEXEC (−9).'], ['request', 4, 'Address of a 4-aligned PROCESS_EXEC_REQUEST.'], ['size', 4, 'Exactly 72 bytes.']],
    description: [
      'This private PROCESS transport is used by native libaes and headless consumers. PREPARE (0) stores a private launch and returns a positive owned handle. COMMIT (1) publishes the child, returns its PID and retains the handle for observation. A failed replacement preserves an earlier deferred successor.',
      'SNAPSHOT (2) copies non-consuming completion state. CLOSE (3) consumes the handle, including after a cleanup error, and leaves a committed child running. CANCEL_DEFERRED (4) cancels only the caller’s unpublished successor. DEFER (5) commits a deferred successor and closes the temporary right. START (6) launches an unobserved asynchronous child and returns its PID.',
      'PREPARE accepts policy 0 for asynchronous launch or 1 for deferred replacement. DEFER and START use zero policy and handle. Other unused or reserved values must be zero. SNAPSHOT is the only operation that copies out. A failed SNAPSHOT leaves completion available for retry.',
    ],
    result: 'A scalar status, handle or PID according to operation. Unsupported builds return EINVFN. Invalid requests or unreadable input return a negative GEMDOS error. A SNAPSHOT copy fault can modify part of the output without consuming it.',
    config: 'CONF_WITH_PROCESS_EXEC requires CONF_WITH_USER_ASPACE, CONF_WITH_SSYSTEM and native scheduling. S_INQUIRE reports availability. The separate CONF_WITH_PROCESS_EXEC_TEST profile keeps dispatch enabled while suppressing discovery.',
    status: 'experimental', paraTos: noGuestMode,
    sources: [ssystemSource, procConfig, ['ptos', 'include/process_exec.h', 'Transport operations and fixed-size argument'],
      ['ptos', 'include/process_completion.h', 'Completion fields'], ['ptos', 'doc/process-exec.txt', 'Source-level transport contract'],
      ['ptos', 'tests/process_exec_dispatch.c', 'Dispatch and validation tests'], sdk, paraDispatch, paraSsystem],
    related: ['Ssystem', 'S_PROCIDENT', 'Pexec', 'Pwaitpid'],
    layout: { caption: 'PROCESS_EXEC_REQUEST', bytes: 72, alignment: 4, fields: [
      { name: 'operation', offset: 0, bytes: 4, detail: 'Operation number 0 through 6.' },
      { name: 'handle', offset: 4, bytes: 4, detail: 'Owned observation or admission handle.' },
      { name: 'policy', offset: 8, bytes: 4, detail: 'Asynchronous or deferred replacement.' },
      { name: 'reserved', offset: 12, bytes: 4, detail: 'Zero.' },
      { name: 'path', offset: 16, bytes: 4, detail: 'Executable pathname address.' },
      { name: 'tail', offset: 20, bytes: 4, detail: 'Command-tail address.' },
      { name: 'environment', offset: 24, bytes: 4, detail: 'Environment address or zero to inherit.' },
      { name: 'directory', offset: 28, bytes: 4, detail: 'Working-directory address or zero to inherit.' },
      { name: 'completion', offset: 32, bytes: 32, detail: 'PROCESS_COMPLETION, filled by SNAPSHOT.' },
      { name: 'reserved_tail', offset: 64, bytes: 8, detail: 'Two zero words.' },
    ] },
  },
];

const memoryConfig = 'Requires CONF_WITH_MMAP and isolated, demand-paged user address spaces. Verified configurations include x32, ARM MMU and 68040 MMU. Flat-address-space builds return EINVFN.';
const memorySources: Source[] = [
  ['ptos', 'include/mman.h', 'Mapping opcodes and flags'],
  ['ptos', 'doc/mmap.txt', 'Private mapping, byte widths and error rules'],
  ['ptos', 'bdos/bdosmain.c', 'GEMDOS mapping dispatch'],
  ['ptos', 'tests/mmap/mmap.c', 'Native mapping and protection regression'], paraDispatch, paraPosixDispatch,
];
const regionArgs: Argument[] = [
  ['address', 4, 'User virtual address. Exact ranges for Mprot and Munmap are page-aligned.'],
  ['length', 4, 'Nonzero byte count, rounded up to the page size.'],
];
const protArg: Argument = ['protection', 4, 'PROT_NONE (0), PROT_READ (1), PROT_WRITE (2) and PROT_EXEC (4). WRITE | EXEC is rejected.'];
const paraMemory = noGuestOpcode + ' The pTOS-hosted emulator uses native mappings internally.';
nativeCalls.push(
  {
    name: 'Mmap', title: 'Reserve a private mapping', opcode: 0x17e,
    prototype: 'long Mmap(uint32_t address, uint32_t length, uint32_t protection,\n          uint32_t flags, uint32_t fd, uint32_t offset);',
    args: [
      ['address', 4, 'Advisory address hint or exact page-aligned address with MAP_FIXED_NOREPLACE.'],
      regionArgs[1], protArg,
      ['flags', 4, 'MAP_PRIVATE (0x02) is required. Add MAP_ANONYMOUS (0x20) for zero fill or MAP_FIXED_NOREPLACE (0x100000) for exact placement.'],
      ['fd', 4, 'Readable native FAT file descriptor. Ignored for anonymous mappings.'],
      ['offset', 4, 'Page-aligned file offset, or zero for anonymous mappings.'],
    ],
    description: [
      'The reservation counts against native process data and total-memory limits immediately. Physical backing is allocated on demand.',
      'Native FAT-backed read mappings can share clean pages. Writes to a permitted private mapping copy pages and leave the file unchanged. Closing the original file handle leaves the retained mapping usable.',
      'Use MAP_FIXED_NOREPLACE for exact placement with collision detection. MAP_SHARED and replacing MAP_FIXED are unsupported. Full-width trap arguments are checked before narrowing.',
    ],
    result: 'Returns a positive base address. Invalid flags return EOPNOTSUPP. An exact-placement collision returns EACCDN. Invalid lengths or alignment can return EINVAL, and unavailable memory or metadata can return ENSMEM.',
    config: memoryConfig, paraTos: paraMemory, sources: memorySources, related: ['Munmap', 'Mprot'],
  },
  {
    name: 'Munmap', title: 'Remove private mappings within a range', opcode: 0x17f,
    prototype: 'long Munmap(uint32_t address, uint32_t length);', args: regionArgs,
    description: ['Removes owned mapping reservations and releases backing references over the specified page-aligned range. Holes are allowed. Kernel-loaded image pages, ordinary allocation and stack reservations are excluded.'],
    result: 'Zero on success. Invalid alignment or length returns EINVAL. Out-of-range or reserved non-mapping memory can return EIMBA.',
    config: memoryConfig, paraTos: paraMemory, sources: memorySources, related: ['Mmap', 'Mprot'],
  },
  {
    name: 'Mprot', title: 'Change permissions on a mapped range', opcode: 0x17c,
    prototype: 'long Mprot(uint32_t address, uint32_t length, uint32_t protection);',
    args: [...regionArgs, protArg],
    description: [
      'Changes the permissions of an entire validated range of caller-owned mappings. Eligible PT_INTERP ELF image segment pages can also be protected in shared-ELF builds.',
      'An unbacked reservation stays unbacked. Hardware execute-disable is absent on 68040, so readable or writable pages there can still be executable.',
    ],
    result: 'Zero on success. Unknown protection bits return EINVAL, WRITE | EXEC returns EACCDN, and holes or ranges outside the caller’s mappings return EIMBA.',
    config: memoryConfig, paraTos: paraMemory, sources: memorySources, related: ['Mmap', 'Munmap'],
  },
);

const standardSizeResult = 'Returns the copied byte count. Pass size −1 to query the kernel structure size without writing. The caller should check the returned count before reading a field.';
const modeSources: Source[] = [ssystemSource, ssystemHeader, sdk, paraDispatch, paraSsystem];
const ssystemModes = [
  {
    name: 'S_MEMINFO', mode: -3, title: 'Read kernel memory counters',
    description: 'Returns seven consecutive unsigned 32-bit words for page size in bytes, total pages, free pages, process records, shared clean pages, shared mappings and cumulative cross-process sharing. A counter unavailable in the running configuration is 0xFFFFFFFF.',
    result: standardSizeResult, config: 'Requires CONF_WITH_SSYSTEM.',
  },
  {
    name: 'S_DESKINFO', mode: -4, title: 'Read native desktop capabilities',
    description: 'Returns a 32-bit boot flag word followed by six 16-bit fields for resolution change, alternative RAM, cache control, shutdown, VIDEL and TT shifter availability. The fields describe the active kernel and machine.',
    result: standardSizeResult, config: 'Requires CONF_WITH_SSYSTEM. Intended for the external desktop.',
  },
  {
    name: 'S_DESKSET', mode: -5, title: 'Set a legacy desktop option',
    description: 'Item 1 sets the critical error alert, item 2 sets the AES background, and item 3 changes CPU cache settings where available. These options operate through the kernel AES path.',
    result: 'Zero for a supported item. An unknown or unavailable setting returns EINVFN. User processes on address-space builds receive EACCDN.',
    config: 'Requires CONF_WITH_SSYSTEM and kernel AES. Background or cache options also require their corresponding build features.',
  },
  {
    name: 'S_MMUPROBE', mode: -6, title: 'Inspect a 68k MMU translation in regression builds',
    description: 'Takes a struct mmu_probe with the virtual address and access flags, then reports translation and MMU state. The layout is defined in include/mmuprobe.h.',
    result: standardSizeResult, config: 'Test-only ABI for 68k builds with CONF_WITH_MMU_PROBE. Other targets return EINVFN.',
  },
];
for (const entry of ssystemModes) {
  const setting = entry.name === 'S_DESKSET';
  const probe = entry.name === 'S_MMUPROBE';
  nativeCalls.push({
    ...entry,
    opcode: 0x154,
    prototype: setting ? 'long Ssystem(short mode, long item, long value);'
      : 'long Ssystem(short mode, long buffer, long size);',
    args: [
      ['mode', 2, `${entry.name} (${entry.mode}).`],
      setting ? ['item', 4, 'Desktop setting number.'] : ['buffer', 4, 'Address of the native result structure.'],
      setting ? ['value', 4, 'New setting value.'] : ['size', 4, 'Buffer size in bytes or −1 for a size query.'],
    ],
    description: [entry.description],
    paraTos: noGuestMode,
    sources: probe ? [...modeSources, ['ptos', 'include/mmuprobe.h', 'MMU probe fields'], ['ptos', 'tests/mmu_state/mmu_state.c', 'MMU state regression']]
      : modeSources,
    related: ['Ssystem', 'S_PROCIDENT'],
    status: probe ? 'experimental' : undefined,
    targets: probe ? { arm: entry.config, x32: entry.config } : undefined,
  });
}

export const nativePath = (name: string) => `/reference/${name.toLowerCase().replaceAll('_', '-')}/`;
