import inventory from './native-inventory.json';
import type { HistoricalPage } from './historical';
import type { Binding, Register } from './overlays';

type NativeCPU = 'arm' | 'x32';
type Result = Binding & { source: string; extraSource?: string };
type Gemdos = { args: string; config?: string; source?: string };
type AesOperation = { opcode: number; config?: string };
const gemdos: Record<number, Gemdos> = inventory.gemdos;
const bios: Record<number, string> = inventory.bios;
const xbios: Record<number, string> = inventory.xbios;
const aesNative: Record<string, AesOperation> = inventory.aesNative;
const aesLibrary: Record<string, string> = inventory.aesLibrary;
const legacyVdi: Record<number, string[]> = inventory.legacyVdi;
const hex = (number: number) => `0x${number.toString(16).toUpperCase()}`;

const argumentRegisters = {
  arm: ['R1', 'R2', 'R3', 'R4', 'R5', 'R6'],
  x32: ['RDI', 'RSI', 'RDX', 'R10', 'R8', 'R9'],
};
const argumentStructs: Record<string, string> = {
  'BIOS:4': 'bios_lrwabs_args',
  'XBIOS:8': 'xbios_flop_io_args', 'XBIOS:9': 'xbios_flop_io_args', 'XBIOS:19': 'xbios_flop_io_args',
  'XBIOS:10': 'xbios_flopfmt_args', 'XBIOS:15': 'xbios_rsconf_args',
};
const biosAliases: Record<string, string> = {
  rwabs: 'lrwabs', initmouse: 'initmous', mon_type: 'vmontype', validmode: 'vfixmode',
  vsetscreen: 'setscreen', setmode: 'setsndmode',
};
const aesAliases: Record<string, string> = {
  'graf_mbox/graf_movebox': 'graf_mbox',
  'graf_rubberbox/graf_rubbox': 'graf_rubbox',
};
const vdiGdp = [
  '', 'v_bar', 'v_arc', 'v_pieslice', 'v_circle', 'v_ellipse',
  'v_ellarc', 'v_ellpie', 'v_rbox', 'v_rfbox', 'v_justified',
];
const vdiEscapes = [
  '', 'vq_chcells', 'v_exit_cur', 'v_enter_cur', 'v_curup', 'v_curdown',
  'v_curright', 'v_curleft', 'v_curhome', 'v_eeos', 'v_eeol',
  'vs_curaddress', 'v_curtext', 'v_rvon', 'v_rvoff', 'vq_curaddress',
  'vq_tabstatus', 'v_hardcopy', 'v_dspcur', 'v_rmcur',
];
const inputVdi: Record<string, string> = {
  vrq_choice: 'v_choice', vsm_choice: 'v_choice', vrq_locator: 'v_locator',
  vsm_locator: 'v_locator', vrq_string: 'v_string', vsm_string: 'v_string',
};

function vdiOperation(name: string, opcode: number, subcode: number) {
  if (opcode === 5) return vdiEscapes[subcode] === name;
  if (opcode === 11) return vdiGdp[subcode] === name;
  if (name === 'vqt_ext_name') return opcode === 130 && subcode === 1;
  if (name === 'vqt_real_extent') return opcode === 240 && subcode === 4200;
  if (name === 'v_get_outline') return opcode === 243 && subcode === 1;
  return subcode === 0 && legacyVdi[opcode]?.includes(inputVdi[name] ?? name);
}

export function historicalBinding(page: HistoricalPage, cpu: NativeCPU): Result {
  const t = (english: string, german: string) => page.language === 'en' ? english : german;
  const cpuName = cpu === 'arm' ? 'ARM' : 'x32';
  const scope = `pTOS · ${cpuName}`;
  const unavailable = (source: string, why?: string): Result => ({
    status: 'unsupported', scope, source,
    detail: why ?? t(`This call is not implemented for native ${cpuName} programs in pTOS.`,
      `Dieser Aufruf ist für native ${cpuName}-Programme in pTOS nicht implementiert.`),
  });
  const name = page.title.toLowerCase();
  const fact = page.facts.find(({ label }) => /opcode|nummer|number/i.test(label));
  const text = fact?.value.replace(/<[^>]*>/g, '') ?? '';
  const leadingNumber = /^\s*(-?\d+)/.exec(text);
  const vt52 = page.path === 'bios/vt52.u' && /\b(Cconout|Cconws|Cursconf)\s*\(/.exec(page.prototype)?.[1];
  const opcode = vt52 ? { Cconout: 2, Cconws: 9, Cursconf: 21 }[vt52]!
    : leadingNumber ? Number(leadingNumber[1]) : NaN;
  const subcode = Number(/(?:sub[- ]?opcode|gdp|escape|unterfunktion|unter-opcode)\s*[:=]?\s*(\d+)/i.exec(text)?.[1] ?? 0);
  const classNumber = vt52 ? vt52 === 'Cursconf' ? 14 : 1 : { GEMDOS: 1, BIOS: 13, XBIOS: 14 }[page.subsystem];
  const trapSource = cpu === 'arm'
    ? classNumber === 1 ? 'bdos/arch/arm/uspace.c' : 'bios/arch/arm/vectorsasm.S'
    : 'bios/arch/x86_64/trap.c';

  function trap(source: string, registerArgs: Register[], note?: string): Result {
    const fn = Number.isFinite(opcode) ? hex(opcode) : t('function number', 'Funktionsnummer');
    const detail = cpu === 'arm'
      ? t(`Enter with SVC #${classNumber}. Native arguments occupy 32-bit slots.`,
        `Aufruf mit SVC #${classNumber}. Native Argumente belegen 32-Bit-Register.`)
      : t('Enter with SYSCALL from ring 3. RCX and R11 are clobbered. User pointers are 32 bits.',
        'Aufruf mit SYSCALL aus Ring 3. RCX und R11 werden überschrieben. Benutzerzeiger sind 32 Bit breit.');
    return {
      status: 'implemented', scope, source, extraSource: trapSource,
      detail: note ? detail + ' ' + note : detail,
      registers: [
        cpu === 'arm'
          ? ['R0', `${fn} · ${t('function on entry, result on return', 'Funktionsnummer beim Aufruf, Ergebnis bei Rückkehr')}`]
          : ['RAX', `(${classNumber} << 32) | ${fn} · ${t('selector on entry, result on return', 'Selektor beim Aufruf, Ergebnis bei Rückkehr')}`],
        ...registerArgs,
      ],
    };
  }

  if (vt52) {
    const args: Register[] = [[argumentRegisters[cpu][0], vt52 === 'Cconws' ? 'String pointer' : vt52 === 'Cconout' ? 'Character' : 'Mode']];
    if (vt52 === 'Cursconf') args.push([argumentRegisters[cpu][1], 'Rate']);
    return trap('bios/vt52.c', args, t(
      `Use the C macro shown above with the native ${vt52} binding. Escape sequences require a VT52-compatible console.`,
      `Das C-Makro oben verwendet die native ${vt52}-Bindung. Escapesequenzen erfordern eine VT52-kompatible Konsole.`));
  }

  if (page.subsystem === 'GEMDOS') {
    const entry = gemdos[opcode];
    if (!entry || name === 'srealloc') return unavailable('bdos/bdosmain.c');
    const config = entry.config && t(`Requires ${entry.config}.`, `Erfordert ${entry.config}.`);
    const notes: Record<string, string> = {
      super: cpu === 'arm'
        ? t('On address-space builds Super(1) reports user mode; attempts to switch privilege return EACCDN. Single-address-space builds retain the supervisor-mode binding.',
          'Mit getrennten Adressräumen meldet Super(1) den Benutzermodus. Ein Privilegwechsel liefert EACCDN. Ohne getrennte Adressräume ist der Wechsel verfügbar.')
        : t('The x32 address-space kernel returns zero without changing privilege levels. The historical supervisor switch is not implemented.',
          'Der x32-Kernel liefert null und wechselt die Privilegstufe nicht. Der historische Wechsel in den Supervisormodus ist nicht implementiert.'),
      dgetcwd: t('Returns ERANGE if the current directory path does not fit in the buffer.',
        'Liefert ERANGE, wenn der Pfad des aktuellen Verzeichnisses nicht in den Puffer passt.'),
      mvalidate: t('Checks the current address space only. If the flags pointer is non-null, writes a 32-bit zero to it.',
        'Prüft nur den aktuellen Adressraum. Ist der Flags-Zeiger nicht null, wird dort ein 32-Bit-Nullwert abgelegt.'),
    };
    const types: Record<string, string> = {
      W: t('16-bit word', '16-Bit-Wort'), L: t('32-bit long', '32-Bit-Langwort'),
      P: t('32-bit pointer', '32-Bit-Zeiger'),
    };
    const args = [...entry.args].map((type, index): Register =>
      [argumentRegisters[cpu][index], `${t('Argument', 'Argument')} ${index + 1} · ${types[type]}`]);
    return trap(entry.source ?? 'bdos/bdosmain.c', args, [config, notes[name]].filter(Boolean).join(' '));
  }

  if (page.subsystem === 'BIOS' || page.subsystem === 'XBIOS') {
    const isBios = page.subsystem === 'BIOS';
    const source = isBios ? 'bios/bios.c' : 'bios/xbios.c';
    const slotName = (isBios ? bios : xbios)[opcode];
    const hardwareOnly = [0x0d, 0x1a, 0x1b, 0x1f, 0x21, 0x2e].includes(opcode) || opcode >= 0x50;
    const generic = name === 'bios-trap' || name === 'xbios-trap';
    if (!generic && (name === 'vsetscreen' || slotName !== (biosAliases[name] ?? name) ||
      !isBios && (cpu === 'x32' ? !inventory.x32Xbios.includes(opcode) : hardwareOnly || opcode === 0x26))) {
      return unavailable(source);
    }
    const refused = isBios ? [0, 7].includes(opcode) : [0x0e, 0x22].includes(opcode);
    if (cpu === 'x32' && refused) return unavailable('bios/biosaccess.c', t(
      'The kernel handler exists, but this call is not exposed to native x32 programs. The ring-3 call returns EACCDN.',
      'Der Kernel-Handler ist vorhanden, der Aufruf ist für native x32-Programme gesperrt. Der Ring-3-Aufruf liefert EACCDN.'));
    const argStruct = argumentStructs[`${page.subsystem}:${opcode}`];
    const count = generic ? 4 : (/^\s*[^()]+\(([^()]*)\)/.exec(page.prototype)?.[1]?.split(',')
      .filter(arg => !/^\s*(?:void)?\s*$/i.test(arg)).length ?? 4);
    const args: Register[] = argStruct
      ? [[argumentRegisters[cpu][0], `${t('Pointer to', 'Zeiger auf')} struct ${cpu === 'x32' ? 'x32_' : ''}${argStruct}`]]
      : Array.from({ length: Math.min(count, 4) }, (_, index): Register => [argumentRegisters[cpu][index], `Argument ${index + 1}`]);
    const restriction = refused
      ? t('Address-space builds refuse this call with EACCDN. Available on single-address-space builds.',
        'Mit getrennten Adressräumen liefert der Aufruf EACCDN. Ohne getrennte Adressräume ist er verfügbar.')
      : name === 'keytbl'
        ? t('Available only on single-address-space builds.', 'Nur ohne getrennte Adressräume verfügbar.')
        : isBios && opcode === 5
          ? t('User address-space callers may query a vector with argument 2 = −1, but may not install one.',
            'Programme mit eigenem Adressraum dürfen den Vektor mit Argument 2 = −1 abfragen, aber keinen installieren.')
          : t('Hardware-dependent operations require a matching device. User address-space builds restrict privileged arguments.',
            'Hardwareabhängige Operationen erfordern ein passendes Gerät. In getrennten Adressräumen sind privilegierte Argumente eingeschränkt.');
    const binding = trap(source, args, restriction);
    if (argStruct) {
      binding.source = trapSource;
      binding.extraSource = `include/arch/${cpu === 'arm' ? 'arm' : 'x86_64'}/biosargs.h`;
    } else {
      binding.extraSource = 'bios/biosaccess.c';
    }
    return binding;
  }

  if (page.subsystem === 'AES') {
    const symbol = aesAliases[name] ?? name;
    if (cpu === 'x32') {
      const publicSymbol = symbol === 'graf_rubbox' ? 'graf_rubberbox' : symbol;
      const entry = aesLibrary[publicSymbol];
      const source = 'doc/libaes-compatibility.md';
      if (!entry) return unavailable(source, t(
        'This function has no x32 libaes export. The legacy GEM trap is unavailable to ring-3 callers.',
        'Diese Funktion wird von x32-libaes nicht exportiert. Der historische GEM-Trap steht Ring-3-Programmen nicht zur Verfügung.'));
      return {
        status: 'experimental', scope: scope + ' · CONF_WITH_LIBAES', source,
        extraSource: 'include/libaes.h',
        detail: t(`Use GEMlib ${publicSymbol}() or call libaes mt_${publicSymbol}() with caller-owned AESGLOBAL. Link GEMlib before libaes.`,
          `GEMlib ${publicSymbol}() oder libaes mt_${publicSymbol}() mit eigenem AESGLOBAL aufrufen. GEMlib vor libaes linken.`)
          + (entry === 'partial' ? ' ' + t('Only a subset of the historical modes is implemented. See the compatibility matrix.',
            'Nur ein Teil der historischen Modi ist implementiert. Siehe Kompatibilitätsmatrix.') : ''),
      };
    }
    const entry = aesNative[symbol];
    const source = 'aes/gemsuper.c';
    if (!entry || entry.opcode !== opcode) return unavailable(source);
    return {
      status: 'implemented', scope: scope + ' · CONF_WITH_AES', source, extraSource: 'aes/arch/arm/gemdosif.S',
      detail: t('Enter with SVC #2. Use a native AES parameter block. Kernel AES requires a single address space.',
        'Aufruf mit SVC #2 und nativem AES-Parameterblock. Kernel-AES benötigt einen gemeinsamen Adressraum.')
        + (entry.config ? ' ' + t(`This operation also requires ${entry.config}.`, `Für diese Operation ist auch ${entry.config} erforderlich.`) : ''),
      registers: [['R0', '0xC8'], ['R1', t('Pointer to AESPB', 'Zeiger auf AESPB')], ['AESPB.control[0]', String(opcode)]],
    };
  }

  if (page.subsystem === 'VDI') {
    const source = cpu === 'arm' ? 'vdi/vdi_main.c' : 'vdi/x32/vdi_client.c';
    const vdiSubcode = name === 'vqt_real_extent' ? 4200 : subcode;
    if (!vdiOperation(name, opcode, vdiSubcode) ||
      cpu === 'x32' && (!inventory.x32Vdi.includes(opcode) || vdiSubcode !== (opcode === 11 ? 1 : 0))) {
      return unavailable(source);
    }
    const control: Register[] = [['control[0]', String(opcode)], ['control[5]', String(vdiSubcode)]];
    if (cpu === 'x32') return {
      status: 'implemented', scope: scope + ' · CONF_WITH_X32_VDI', source, extraSource: 'doc/vdi-x32.txt',
      detail: t('Call the x32 SDK wrapper or vdi(VDIPB *) from libptos-vdi.a. The client translates the parameter block to typed class 0x100 requests. The legacy GEM trap is unavailable to ring-3 callers.',
        'SDK-Bindung oder vdi(VDIPB *) aus libptos-vdi.a aufrufen. Der Client übersetzt den Parameterblock in typisierte Aufrufe der Klasse 0x100. Der alte GEM-Trap ist in Ring 3 nicht verfügbar.')
        + ([118, 125, 126, 127, 134].includes(opcode)
          ? ' ' + t('Installing a callback requires CONF_WITH_USER_CALLBACKS.', 'Callbacks erfordern CONF_WITH_USER_CALLBACKS.') : '')
        + (opcode === 102 ? ' ' + t('The x32 client implements vq_extnd(1) only (intin[0] = 1).',
          'Der x32-Client implementiert nur vq_extnd(1) (intin[0] = 1).') : ''),
      registers: control,
    };
    return {
      status: 'implemented', scope, source, extraSource: 'bios/arch/arm/vectorsasm.S',
      detail: t('Enter with SVC #2. Pass a native VDI parameter block, and read results from its output arrays.',
        'Aufruf mit SVC #2 und nativem VDI-Parameterblock. Die Ergebnisse stehen in dessen Ausgabefeldern.')
        + (opcode === 190 || opcode >= 229 ? ' ' + t('Requires active built-in GDOS and CONF_WITH_VDI_SCALABLE_FONTS.',
          'Erfordert aktives integriertes GDOS und CONF_WITH_VDI_SCALABLE_FONTS.') : ''),
      registers: [['R0', '0x73'], ['R1', t('Pointer to VDIPB', 'Zeiger auf VDIPB')], ...control],
    };
  }

  if (page.path.startsWith('linea/')) return unavailable('bios/bios.c', t(
    'The historical Line-A instruction entry is specific to 68k. There is no native pTOS binding for this instruction.',
    'Der historische Line-A-Befehl ist 68k-spezifisch. In pTOS gibt es dafür keine native Bindung.'));
  if (page.path.includes('/xhdi/')) return unavailable('bios/arch/m68k/natfeat.S', t(
    'The historical XHDI cookie entry uses a 68k call frame. pTOS does not expose it as a native ARM or x32 call.',
    'Der historische XHDI-Cookie-Einsprung verwendet einen 68k-Aufrufrahmen. pTOS stellt ihn nicht als nativen ARM- oder x32-Aufruf bereit.'));
  if (page.path.startsWith('protokol/')) return unavailable('doc/libaes-compatibility.md', t(
    'This entry describes an application message. It has no system-call binding of its own.',
    'Dieser Eintrag beschreibt eine Anwendungsnachricht. Sie hat keine eigene Systemaufrufbindung.'));
  return unavailable('bios/arch/x86_64/trap.c', t(
    'This historical interface has no native pTOS system-call binding.',
    'Diese historische Schnittstelle hat keine native pTOS-Systemaufrufbindung.'));
}
