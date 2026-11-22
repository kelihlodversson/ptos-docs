import type { CPU, Source, Status } from './catalog';
import abi from './abi.json';

export type Register = [register: string, meaning: string];
export type Binding = {
  status: Status;
  scope: string;
  detail: string;
  registers?: Register[];
  code?: string;
  stack?: typeof abi.fclose;
};
type Overlay = {
  params: [string, string][];
  targets: Record<CPU, Binding>;
  sources: Source[];
  paraTos: string;
};

const gemdosSources: Source[] = [
  ['ptos', 'bdos/bdosmain.c', 'GEMDOS dispatch and argument widths'],
  ['ptos', 'bdos/arch/m68k/rwa.S', '68k trap entry'],
  ['ptos', 'bdos/arch/arm/uspace.c', 'ARM user-mode GEMDOS dispatch'],
  ['ptos', 'bios/arch/x86_64/trap.c', 'x32 syscall entry and class dispatch'],
  ['libcmini', 'include/mint/osbind.h', 'SDK GEMDOS bindings'],
];

function gemdos(opcode: string, args: Register, rest: string[] = []): Record<'arm' | 'x32', Binding> {
  const [description, first] = args;
  const values = [first, ...rest];
  return {
    arm: {
      status: 'implemented',
      scope: 'Native pTOS GEMDOS',
      detail: 'SVC #1 enters the GEMDOS handler. Scalar arguments occupy 32-bit slots. The SDK inline binding declares IP, LR, condition codes and memory clobbered, as well as unused argument registers through R4.',
      registers: [['R0', `Function ${opcode} on entry, result on return`],
        ...values.map((value, index): Register => [`R${index + 1}`, value])],
      code: `; R0 = ${opcode}, R1 = ${description}\nsvc #1`,
    },
    x32: {
      status: 'implemented',
      scope: 'Native pTOS x32 GEMDOS',
      detail: 'SYSCALL enters ring 0 from ring 3. The instruction clobbers RCX and R11. Pointers are 32-bit user addresses in 64-bit register slots.',
      registers: [['RAX', `Selector (1 << 32) | ${opcode} on entry, result on return`],
        ...values.map((value, index): Register => [['RDI', 'RSI', 'RDX', 'R10'][index], value])],
      code: `; RAX = (1 << 32) | ${opcode}, RDI = ${description}\nsyscall`,
    },
  };
}

const legacyAES: Binding = {
  status: 'implemented',
  scope: 'Single-address-space pTOS with CONF_WITH_AES',
  detail: 'The GEM binding supplies an AES parameter block. The control array begins with 10, and int_out[0] receives the application ID. Builds with CONF_WITH_USER_ASPACE or CONF_WITH_PROCESS_ASPACES exclude kernel AES. Native libaes ports to those configurations are architecture follow-ups.',
};

export const overlays: Record<string, Overlay> = {
  Fclose: {
    params: [['handle', 'Signed 16-bit file handle to close.']],
    targets: {
      '68k': { status: 'implemented', scope: 'Native pTOS GEMDOS',
        detail: 'TRAP #1 uses the caller’s word-aligned argument stack and returns through D0. Adjust SP by four bytes after return.',
        stack: abi.fclose },
      ...gemdos('0x3E', ['handle', 'File handle, signed 16-bit input']),
    },
    sources: [
      ...gemdosSources, ['ptos', 'bdos/fsopnclo.c', 'File-close implementation and errors'],
      ['ptos', 'tests/open_unlink/open_unlink.c', 'Native close and file lifetime regression'],
      ['paratos', 'tests/ptos/filesystem.c', 'ParaTOS guest filesystem regression'],
    ],
    paraTos: 'Verified for the pTOS-hosted ParaTOS 68k guest filesystem path. The regression opens and closes files from a guest program.',
  },
  Pexec: {
    params: [
      ['mode', 'Execution mode word. The mode selects the interpretation and ownership of the following three arguments.'],
      ['prog', 'Path for modes 0 and 3, zero for 4, 5 and 6, PRG flags for 7.'],
      ['tail', 'Command tail or a basepage pointer for modes 4 and 6.'],
      ['env', 'Environment argument for modes 0, 3, 5 and 7. Pass zero in modes 4 and 6.'],
    ],
    targets: {
      '68k': { status: 'implemented', scope: 'Native pTOS GEMDOS, modes 0, 3, 4, 5, 6 and 7',
        detail: 'TRAP #1 uses the caller’s stack. D0 holds the result. Layout is shown for the four-argument binding. Interpret the long slots by mode.',
        stack: abi.pexec },
      ...gemdos('0x4B', ['mode', '16-bit mode'], ['Path pointer, flags or zero', 'Tail or basepage pointer', 'Environment pointer or zero']),
    },
    sources: [
      ...gemdosSources, ['ptos', 'bdos/proc.c', 'Native Pexec mode dispatch and ownership'],
      ['ptos', 'bdos/uaccess.c', 'Address-space argument checks'],
      ['ptos', 'include/bdosdefs.h', 'Mode constants'],
      ['ptos', 'tests/x32_probe/x32_probe.c', 'x32 launch and argument probes'],
      ['paratos', 'tests/ptos/semantics.c', 'ParaTOS launch and overlay regression'],
    ],
    paraTos: 'The pTOS-hosted ParaTOS regression exercises native and guest launches and retained/consumed overlays. It also checks that mode 200 returns EINVFN in that runtime.',
  },
  appl_init: {
    params: [['void', 'The standard GEMlib call takes no arguments. The historical X_BUF_V2 form is a FreeGEM extension.']],
    targets: {
      '68k': { ...legacyAES, detail: legacyAES.detail + ' Enter TRAP #2 with D0 = 0xC8 and D1 pointing to AESPB.',
        registers: [['D0', 'GEM AES selector 0xC8'], ['D1', '32-bit AESPB pointer'], ['int_out[0]', 'Application ID or failure']] },
      arm: { ...legacyAES, detail: legacyAES.detail + ' The traditional ARM binding uses SVC #2.',
        registers: [['R0', 'AES selector 0xC8'], ['R1', 'AESPB pointer'], ['int_out[0]', 'Application ID or failure']] },
      x32: { status: 'experimental', scope: 'Native x32 GEMlib and CONF_WITH_LIBAES',
        detail: 'GEMlib appl_init() calls the userspace libaes mt_appl_init(AESGLOBAL *). libaes manages caller-owned initialization state and uses private CUIS calls internally. The returned application ID uses the PID namespace and differs from the private session handle. Ring-3 generic GEM class 2 is unsupported.' },
    },
    sources: [
      ['ptos', 'aes/Kconfig', 'Kernel AES and experimental libaes configuration'],
      ['ptos', 'doc/libaes-compatibility.md', 'Supported library and architecture configurations'],
      ['ptos', 'desk/gembind.c', 'Legacy GEM binding'],
      ['ptos', 'bios/arch/arm/vectorsasm.S', 'ARM AES/VDI trap dispatcher'],
      ['ptos', 'bios/arch/x86_64/trap.c', 'Ring-3 class 2 rejection'],
      ['gemlib', 'ptos/a_appl_init.c', 'Public appl_init wrapper'],
      ['ptos', 'lib/aes/application.c', 'Userspace mt_appl_init implementation'],
      ['ptos', 'tests/x32_desktop/cuis_client.c', 'Native desktop client regression'],
    ],
    paraTos: 'ParaTOS appl_init coverage is unverified in this edition.',
  },
  Ssystem: {
    params: [
      ['mode', 'S_CONSOLE_DIM, the signed word value −2 (0xFFFE).'],
      ['arg1', 'Address of the caller’s console_dim output buffer, cast to long. May be zero for a size query.'],
      ['arg2', 'Buffer length in bytes. Use −1 to query the kernel’s structure size.'],
    ],
    targets: {
      '68k': { status: 'implemented', scope: 'pTOS builds with CONF_WITH_SSYSTEM',
        detail: 'Use GEMDOS TRAP #1. Push the 32-bit size, 32-bit pointer, 16-bit mode and 16-bit opcode in that order. The result is in D0. Remove 12 argument bytes after return.' },
      ...gemdos('0x154', ['mode', 'S_CONSOLE_DIM (−2)'], ['Destination pointer', 'Size or −1']),
    },
    sources: [
      ...gemdosSources, ['ptos', 'bdos/ssystem.h', 'S_CONSOLE_DIM contract and console_dim layout'],
      ['ptos', 'bdos/ssystem.c', 'Console query implementation'],
      ['ptos', 'tests/ssystem_info/ssystem_info.c', 'Ssystem mode discovery regression'],
      ['ptos', 'tests/x32_probe/x32_probe.c', 'x32 console pointer and size checks'],
      ['libcmini', 'include/mint/mintbind.h', 'Public Ssystem macro'],
    ],
    paraTos: 'This pTOS extension has unverified coverage under ParaTOS.',
  },
};

for (const cpu of ['arm', 'x32'] as const) {
  overlays.Pexec.targets[cpu].scope += ', modes 0, 3, 4, 5, 6 and 7';
  overlays.Ssystem.targets[cpu].scope += ' with CONF_WITH_SSYSTEM';
}

export const pexecModes: [mode: string, args: string, meaning: string][] = [
  ['0', 'path, cmdline, env', 'Load and run synchronously.'],
  ['3', 'path, cmdline, env', 'Load and return a basepage. Caller owns the retained image.'],
  ['4', '0L, basepage, 0L', 'Run a retained image without transferring ownership.'],
  ['5', '0L, cmdline, env', 'Create and return a basepage.'],
  ['6', '0L, basepage, 0L', 'Transfer ownership and run the image.'],
  ['7', 'prgflags, cmdline, env', 'Create a basepage with program flags.'],
  ['100', 'path, cmdline, env', 'Load and schedule a child with CONF_WITH_NATIVE_SCHED.'],
  ['106', '0L, basepage, 0L', 'Transfer the image and schedule it with CONF_WITH_NATIVE_SCHED. Native pTOS uses the basepage argument.'],
];

export const nativeRevisionLabel = 'pTOS 1.4 development tree';
