import inventory from './native-inventory.json';
import abi from './abi.json';
import type { HistoricalPage } from './historical';
import type { Binding, Register } from './overlays';
import type { CPU } from './targets';

type Result = Binding & { source: string; extraSource?: string; limitation?: string };
type Gemdos = { args: string; config?: string; source?: string };
type AesOperation = { opcode: number; config?: string };
const gemdos: Record<number, Gemdos> = inventory.gemdos;
const bios: Record<number, string> = inventory.bios;
const xbios: Record<number, string> = inventory.xbios;
const xbiosConfig: Partial<Record<number, string>> = inventory.xbiosConfig;
const xhdi: Record<number, string> = inventory.xhdi;
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

export function historicalBinding(page: HistoricalPage, cpu: CPU): Result {
  const t = (english: string, german: string) => page.language === 'en' ? english : german;
  const cpuName = cpu === 'arm' ? 'ARM' : cpu;
  const scope = `pTOS · ${cpuName}`;
  const unavailable = (source: string, why?: string): Result => ({
    status: 'unsupported', scope, source, limitation: why,
    detail: why ?? t(`This call is not implemented for native ${cpuName} programs in pTOS.`,
      `Dieser Aufruf ist für native ${cpuName}-Programme in pTOS nicht implementiert.`),
  });
  const requires = (flag: string) => t(`Requires ${flag}.`, `Erfordert ${flag}.`);
  const singleSpace = t('Requires a single address space.', 'Nur ohne getrennte Adressräume verfügbar.');
  const name = page.title.toLowerCase();
  const fact = page.facts.find(({ label }) => /opcode|nummer|number/i.test(label));
  const text = fact?.value.replace(/<[^>]*>/g, '') ?? '';
  const leadingNumber = /^\s*(-?\d+)/.exec(text);
  const vt52 = page.path === 'bios/vt52.u' && /\b(Cconout|Cconws|Cursconf)\s*\(/.exec(page.prototype)?.[1];
  const opcode = vt52 ? { Cconout: 2, Cconws: 9, Cursconf: 21 }[vt52]!
    : leadingNumber ? Number(leadingNumber[1]) : NaN;
  const subcode = Number(/(?:sub[- ]?opcode|gdp|escape|unterfunktion|unter-opcode)\s*[:=]?\s*(\d+)/i.exec(text)?.[1] ?? 0);
  const classes: Partial<Record<string, number>> = abi.x32.classes;
  const classNumber = classes[vt52 ? vt52 === 'Cursconf' ? 'XBIOS' : 'GEMDOS' : page.subsystem];
  const trapSource = cpu === 'arm'
    ? classNumber === 1 ? 'bdos/arch/arm/uspace.c' : 'bios/arch/arm/vectorsasm.S'
    : 'bios/arch/x86_64/trap.c';

  function trap(source: string, registerArgs: Register[], limitation?: string, note?: string): Result {
    if (cpu === '68k') return {
      status: 'implemented', scope, source, limitation,
      detail: [`TRAP #${classNumber}.`, limitation, note].filter(Boolean).join(' '),
    };
    const fn = Number.isFinite(opcode) ? hex(opcode) : t('function number', 'Funktionsnummer');
    const detail = cpu === 'arm'
      ? t(`Enter with SVC #${classNumber}. Native arguments occupy 32-bit slots.`,
        `Aufruf mit SVC #${classNumber}. Native Argumente belegen 32-Bit-Register.`)
      : t('Enter with SYSCALL from ring 3. RCX and R11 are clobbered. User pointers are 32 bits.',
        'Aufruf mit SYSCALL aus Ring 3. RCX und R11 werden überschrieben. Benutzerzeiger sind 32 Bit breit.');
    return {
      status: 'implemented', scope, source, extraSource: trapSource, limitation,
      detail: [detail, limitation, note].filter(Boolean).join(' '),
      x32Selector: cpu === 'x32' && classNumber !== undefined
        ? { trapClass: classNumber, functionNumber: Number.isFinite(opcode) ? opcode : undefined } : undefined,
      registers: [
        cpu === 'arm'
          ? ['R0', `${fn} · ${t('function on entry, result on return', 'Funktionsnummer beim Aufruf, Ergebnis bei Rückkehr')}`]
          : ['RAX', t('64-bit selector on entry, result on return', '64-Bit-Selektor beim Aufruf, Ergebnis bei Rückkehr')],
        ...registerArgs,
      ],
    };
  }

  if (vt52) {
    const args: Register[] = cpu === '68k' ? [] : [[argumentRegisters[cpu][0],
      vt52 === 'Cconws' ? 'String pointer' : vt52 === 'Cconout' ? 'Character' : 'Mode']];
    if (cpu !== '68k' && vt52 === 'Cursconf') args.push([argumentRegisters[cpu][1], 'Rate']);
    return trap('bios/vt52.c', args,
      t('Requires a compatible console.', 'Erfordert eine kompatible Konsole.'),
      t(`Use the C macro shown above with the ${vt52} binding.`, `Das C-Makro oben verwendet die ${vt52}-Bindung.`));
  }

  if (page.subsystem === 'GEMDOS') {
    const entry = gemdos[opcode];
    if (opcode === 0x4b && cpu !== '68k') return unavailable('bdos/bdosmain.c', t(
      'Raw Pexec returns EINVFN before reading its arguments. Use Pexecve for native launch.',
      'Der direkte Pexec-Aufruf liefert EINVFN, bevor er die Argumente liest. Native Programme verwenden Pexecve.'));
    if (!entry || name === 'srealloc' && cpu !== '68k') return unavailable('bdos/bdosmain.c');
    if (name === 'maddalt' && cpu === 'x32') return unavailable('bdos/uaccess.c', t(
      'The kernel can add alternate RAM, but the ring-3 call returns EACCDN.',
      'Der Kernel kann Alternate RAM hinzufügen, aber der Aufruf aus Ring 3 liefert EACCDN.'));
    if (name === 'super' && cpu === 'x32') return unavailable('bdos/bdosmain.c', t(
      'Compatibility stub. Returns zero and leaves the caller in user mode.',
      'Kompatibilitätsstub. Liefert null und lässt den Aufrufer im Benutzermodus.'));
    const config = entry.config && requires(entry.config);
    const notes: Record<string, string> = {
      dgetcwd: t('Returns ERANGE if the current directory path does not fit in the buffer.',
        'Liefert ERANGE, wenn der Pfad des aktuellen Verzeichnisses nicht in den Puffer passt.'),
      mvalidate: t('Checks the current address space only. If the flags pointer is non-null, writes a 32-bit zero to it.',
        'Prüft nur den aktuellen Adressraum. Ist der Flags-Zeiger nicht null, wird dort ein 32-Bit-Nullwert abgelegt.'),
    };
    const limitations: Record<string, string> = {
      super: t('Switching to supervisor mode requires a single address space. Otherwise Super(1) reports user mode and attempts to switch return EACCDN.',
        'Der Wechsel in den Supervisormodus ist nur ohne getrennte Adressräume verfügbar. Andernfalls meldet Super(1) den Benutzermodus und ein Wechsel liefert EACCDN.'),
      maddalt: singleSpace,
      srealloc: t('Requires Falcon VIDEL hardware. Refused for Atari higher-half user programs.',
        'Erfordert Falcon-VIDEL-Hardware. Für Atari-Programme im höheren Adressraum gesperrt.'),
      psetlimit: t('Requires a process with a private heap.', 'Erfordert einen Prozess mit eigenem Heap.'),
      mvalidate: t('Requires a private heap and checks the caller’s address space.', 'Erfordert einen eigenen Heap und prüft den Adressraum des Aufrufers.'),
      maccess: t('Requires a process with a private heap.', 'Erfordert einen Prozess mit eigenem Heap.'),
    };
    const types: Record<string, string> = {
      W: t('16-bit word', '16-Bit-Wort'), L: t('32-bit long', '32-Bit-Langwort'),
      P: t('32-bit pointer', '32-Bit-Zeiger'),
    };
    const args = cpu === '68k' ? [] : [...entry.args].map((type, index): Register =>
      [argumentRegisters[cpu][index], `${t('Argument', 'Argument')} ${index + 1} · ${types[type]}`]);
    return trap(entry.source ?? 'bdos/bdosmain.c', args, [config, limitations[name]].filter(Boolean).join(' '), notes[name]);
  }

  if (page.subsystem === 'BIOS' || page.subsystem === 'XBIOS') {
    const isBios = page.subsystem === 'BIOS';
    const source = isBios ? 'bios/bios.c' : 'bios/xbios.c';
    const slotName = (isBios ? bios : xbios)[opcode];
    const gate = name === 'vsetscreen' ? 'CONF_WITH_VIDEL' : xbiosConfig[opcode];
    const generic = name === 'bios-trap' || name === 'xbios-trap';
    if (!generic && (slotName !== (biosAliases[name] ?? name) || !isBios &&
      (cpu === 'x32' ? !inventory.x32Xbios.includes(opcode) || name === 'vsetscreen'
        : cpu === 'arm' && (gate || opcode === 0x26)))) {
      return unavailable(source);
    }
    const refused = isBios ? [0, 7].includes(opcode) : [0x0e, 0x22].includes(opcode);
    if (cpu === 'x32' && refused) return unavailable('bios/biosaccess.c', t(
      'The kernel handler exists, but this call is not exposed to native x32 programs. The ring-3 call returns EACCDN.',
      'Der Kernel-Handler ist vorhanden, der Aufruf ist für native x32-Programme gesperrt. Der Ring-3-Aufruf liefert EACCDN.'));
    const privileged = isBios ? (opcode === 5
      ? t('With separate address spaces, programs can query vectors but cannot install them.',
        'Mit getrennten Adressräumen dürfen Programme Vektoren abfragen, aber keine installieren.')
      : '') : ({
        0x00: t('With separate address spaces, the callback pointer must be null.', 'Mit getrennten Adressräumen muss der Callback-Zeiger null sein.'),
        0x02: t('With separate address spaces, returns zero.', 'Mit getrennten Adressräumen liefert der Aufruf null.'),
        0x03: t('With separate address spaces, returns zero.', 'Mit getrennten Adressräumen liefert der Aufruf null.'),
        0x05: t('With separate address spaces, screen addresses cannot be set.', 'Mit getrennten Adressräumen können Bildschirmadressen nicht gesetzt werden.'),
        0x20: t('With separate address spaces, a sound table cannot be installed.', 'Mit getrennten Adressräumen kann keine Sound-Tabelle installiert werden.'),
        0x2c: t('Requires CONF_WITH_SCC or CONF_WITH_TT_MFP. With separate address spaces, selector −2 is refused.',
          'Erfordert CONF_WITH_SCC oder CONF_WITH_TT_MFP. Mit getrennten Adressräumen wird Selektor −2 abgewiesen.'),
      } as Partial<Record<number, string>>)[opcode];
    const atariRestriction = !isBios && cpu === '68k' && (
      opcode === 5 || opcode === 0x58
        ? t('Atari higher-half user programs can only query the screen mode.', 'Atari-Programme im höheren Adressraum können den Bildschirmmodus nur abfragen.')
        : !generic && !inventory.higherHalfXbios.includes(opcode) && !refused && opcode !== 0x10 && opcode !== 0x26
          ? t('Refused for Atari higher-half user programs.', 'Für Atari-Programme im höheren Adressraum gesperrt.')
          : ''
    );
    const floppy = !isBios && [8, 9, 10, 19, 41].includes(opcode) &&
      t('Requires a supported floppy device.', 'Erfordert ein unterstütztes Diskettenlaufwerk.');
    const restriction = [!isBios && gate && requires(gate),
      refused || !isBios && [0x10, 0x26].includes(opcode) ? singleSpace : privileged, atariRestriction, floppy].filter(Boolean).join(' ');
    if (cpu === '68k') return trap(refused || privileged ? 'bios/biosaccess.c'
      : atariRestriction ? 'bios/arch/m68k/m68kusertrap.c' : source, [], restriction);
    const argStruct = argumentStructs[`${page.subsystem}:${opcode}`];
    const count = generic ? 4 : (/^\s*[^()]+\(([^()]*)\)/.exec(page.prototype)?.[1]?.split(',')
      .filter(arg => !/^\s*(?:void)?\s*$/i.test(arg)).length ?? 4);
    const args: Register[] = argStruct
      ? [[argumentRegisters[cpu][0], `${t('Pointer to', 'Zeiger auf')} struct ${cpu === 'x32' ? 'x32_' : ''}${argStruct}`]]
      : Array.from({ length: Math.min(count, 4) }, (_, index): Register => [argumentRegisters[cpu][index], `Argument ${index + 1}`]);
    const binding = trap(source, args, restriction, t('Hardware-dependent operations require a matching device.',
      'Hardwareabhängige Operationen erfordern ein passendes Gerät.'));
    if (argStruct) {
      binding.source = trapSource;
      binding.extraSource = `include/arch/${cpu === 'arm' ? 'arm' : 'x86_64'}/biosargs.h`;
    } else {
      binding.extraSource = 'bios/biosaccess.c';
    }
    return binding;
  }

  if (page.subsystem === 'AES') {
    const symbol = name === '_appl_yield' ? 'appl_yield' : aesAliases[name] ?? name;
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
        limitation: [requires('CONF_WITH_LIBAES'), entry === 'partial' && t('Only some historical modes are implemented.',
          'Nur ein Teil der historischen Modi ist implementiert.')].filter(Boolean).join(' '),
        detail: t(`Use GEMlib ${publicSymbol}() or call libaes mt_${publicSymbol}() with caller-owned AESGLOBAL. Link GEMlib before libaes.`,
          `GEMlib ${publicSymbol}() oder libaes mt_${publicSymbol}() mit eigenem AESGLOBAL aufrufen. GEMlib vor libaes linken.`)
          + (entry === 'partial' ? ' ' + t('Only a subset of the historical modes is implemented. See the compatibility matrix.',
            'Nur ein Teil der historischen Modi ist implementiert. Siehe Kompatibilitätsmatrix.') : ''),
      };
    }
    const entry = aesNative[symbol];
    const source = 'aes/gemsuper.c';
    const yieldCall = name === '_appl_yield';
    if (!yieldCall && (!entry || entry.opcode !== opcode)) return unavailable(source);
    const trapEntry = cpu === '68k' ? 'TRAP #2' : 'SVC #2';
    const [selector, param] = cpu === '68k' ? ['D0', 'D1'] : ['R0', 'R1'];
    return {
      status: 'implemented', scope: scope + ' · CONF_WITH_AES', source,
      extraSource: `aes/arch/${cpu === '68k' ? 'm68k' : 'arm'}/gemdosif.S`,
      limitation: [singleSpace, requires('CONF_WITH_AES'), entry?.config && requires(entry.config)].filter(Boolean).join(' '),
      detail: yieldCall
        ? t(`Enter with ${trapEntry}. Selector 0xC9 runs the AES dispatcher without a parameter block.`,
          `Aufruf mit ${trapEntry}. Selektor 0xC9 startet den AES-Dispatcher ohne Parameterblock.`)
        : t(`Enter with ${trapEntry}. Use a native AES parameter block. Kernel AES requires a single address space.`,
          `Aufruf mit ${trapEntry} und nativem AES-Parameterblock. Kernel-AES benötigt einen gemeinsamen Adressraum.`)
          + (entry?.config ? ' ' + requires(entry.config) : ''),
      registers: yieldCall ? [[selector, '0xC9']]
        : [[selector, '0xC8'], [param, t('Pointer to AESPB', 'Zeiger auf AESPB')], ['AESPB.control[0]', String(opcode)]],
    };
  }

  if (page.subsystem === 'VDI') {
    const source = cpu === 'x32' ? 'vdi/x32/vdi_client.c' : 'vdi/vdi_main.c';
    const vdiSubcode = name === 'vqt_real_extent' ? 4200 : subcode;
    if (cpu !== 'x32' && ['v_get_outline', 'v_getoutline', 'v_savecache', 'v_loadcache'].includes(name)) {
      return unavailable('vdi/vdi_speedo.c', opcode === 243
        ? t('The handler returns zero points.', 'Der Handler liefert null Punkte.')
        : t('The handler returns −1. There is no on-disk cache.', 'Der Handler liefert −1. Es gibt keine Cache-Datei.'));
    }
    if (!vdiOperation(name, opcode, vdiSubcode) ||
      cpu === 'x32' && (!inventory.x32Vdi.includes(opcode) || vdiSubcode !== (opcode === 11 ? 1 : 0))) {
      return unavailable(source);
    }
    const control: Register[] = [['control[0]', String(opcode)], ['control[5]', String(vdiSubcode)]];
    const callback = [118, 125, 126, 127, 134].includes(opcode)
      ? t('Installing a callback requires CONF_WITH_USER_CALLBACKS.', 'Callbacks erfordern CONF_WITH_USER_CALLBACKS.') : '';
    const mode = opcode === 102 ? t('Only vq_extnd(1) is implemented (intin[0] = 1).',
      'Nur vq_extnd(1) ist implementiert (intin[0] = 1).') : '';
    if (cpu === 'x32') return {
      status: 'implemented', scope: scope + ' · CONF_WITH_X32_VDI', source, extraSource: 'doc/vdi-x32.txt',
      limitation: [requires('CONF_WITH_X32_VDI'), callback, mode].filter(Boolean).join(' '),
      detail: [t('Call the x32 SDK wrapper or vdi(VDIPB *) from libptos-vdi.a. The client translates the parameter block to typed class 0x100 requests. The legacy GEM trap is unavailable to ring-3 callers.',
        'SDK-Bindung oder vdi(VDIPB *) aus libptos-vdi.a aufrufen. Der Client übersetzt den Parameterblock in typisierte Aufrufe der Klasse 0x100. Der alte GEM-Trap ist in Ring 3 nicht verfügbar.'),
        callback, mode].filter(Boolean).join(' '),
      registers: control,
    };
    const font = (name === 'vqt_ext_name' || opcode === 190 || opcode >= 229) &&
      t('Requires active built-in GDOS and CONF_WITH_VDI_SCALABLE_FONTS.',
        'Erfordert aktives integriertes GDOS und CONF_WITH_VDI_SCALABLE_FONTS.');
    const wheel = opcode === 134 && requires('CONF_WITH_EXTENDED_MOUSE');
    const trapEntry = cpu === '68k' ? 'TRAP #2' : 'SVC #2';
    const [selector, param] = cpu === '68k' ? ['D0', 'D1'] : ['R0', 'R1'];
    return {
      status: 'implemented', scope,
      source: font && name === 'vqt_ext_name' ? 'vdi/vdi_text.c' : source,
      extraSource: `bdos/arch/${cpu === '68k' ? 'm68k' : 'arm'}/uspaceasm.S`,
      limitation: [singleSpace, font, wheel].filter(Boolean).join(' '),
      detail: [t(`Enter with ${trapEntry} on single-address-space builds. Pass a native VDI parameter block and read results from its output arrays.`,
        `Aufruf mit ${trapEntry} ohne getrennte Adressräume. Die Ergebnisse stehen in den Ausgabefeldern des nativen VDI-Parameterblocks.`),
        font, wheel].filter(Boolean).join(' '),
      registers: [[selector, '0x73'], [param, t('Pointer to VDIPB', 'Zeiger auf VDIPB')], ...control],
    };
  }

  if (page.path.startsWith('linea/')) {
    const source = 'bios/arch/m68k/linea.S';
    const selector = /\$A00([\dA-F])\b/i.exec(text);
    if (cpu !== '68k' || !selector || parseInt(selector[1], 16) >= inventory.lineACount) return unavailable(source);
    return {
      status: 'implemented', scope, source,
      detail: t('Use the documented Line-A instruction.', 'Den dokumentierten Line-A-Befehl verwenden.'),
      limitation: [requires('CONF_WITH_LINEA'), t(
        'With separate address spaces, Line-A requires supervisor mode. ColdFire uses 0xA92x encodings.',
        'Mit getrennten Adressräumen benötigt Line-A den Supervisormodus. ColdFire verwendet 0xA92x-Codes.')].join(' '),
    };
  }
  if (page.path.includes('/xhdi/')) {
    const source = 'bios/xhdi.c';
    if (cpu !== '68k' || xhdi[opcode] !== name) return unavailable('bios/arch/m68k/natfeat.S');
    if (inventory.xhdiDriverOnly.includes(opcode)) return unavailable(source, t(
      'The built-in handler does not implement this operation. A chained XHDI driver can supply it where applicable.',
      'Der integrierte Handler implementiert diese Funktion nicht. Ein eingebundener XHDI-Treiber kann sie gegebenenfalls bereitstellen.'));
    return {
      status: 'implemented', scope, source,
      detail: t('Use the XHDI cookie entry.', 'Den XHDI-Cookie-Einsprung verwenden.'),
      limitation: [requires('CONF_WITH_XHDI'), t(
        'With separate address spaces, the cookie entry is available only in supervisor mode.',
        'Mit getrennten Adressräumen ist der Cookie-Einsprung nur im Supervisormodus verfügbar.'),
        opcode === 17 && t('The built-in handler only reads limits.', 'Der integrierte Handler liest die Grenzwerte nur.')].filter(Boolean).join(' '),
    };
  }
  if (page.path.startsWith('protokol/')) return unavailable('doc/libaes-compatibility.md', t(
    'This entry describes an application message. It has no system-call binding of its own.',
    'Dieser Eintrag beschreibt eine Anwendungsnachricht. Sie hat keine eigene Systemaufrufbindung.'));
  if (page.path === 'gem/cpxdoku.u') return unavailable('doc/libaes-compatibility.md', t(
    'A CPX host supplies this interface. It is outside the pTOS system-call ABI.',
    'Ein CPX-Host stellt diese Schnittstelle bereit. Sie gehört nicht zur pTOS-Systemaufruf-ABI.'));
  if (cpu === '68k' && page.path === 'anhang/anhang/pmmu.u') return {
    status: 'unverified', scope, source: 'doc/mmu-address-space.txt',
    limitation: t('Requires the external PMMU functions-handler.', 'Erfordert den externen PMMU-Funktionshandler.'),
    detail: t('Requires the external PMMU functions-handler. Compatibility with pTOS is unverified.',
      'Erfordert den externen PMMU-Funktionshandler. Die Kompatibilität mit pTOS wurde nicht geprüft.'),
  };
  if (page.path.startsWith('xaaes/')) return unavailable('aes/gemsuper.c', t(
    'Legacy XaAES interface. The pTOS kernel and libaes do not supply it.',
    'Historische XaAES-Schnittstelle. Der pTOS-Kernel und libaes stellen sie nicht bereit.'));
  return unavailable('bios/arch/x86_64/trap.c', t(
    'This historical interface has no native pTOS system-call binding.',
    'Diese historische Schnittstelle hat keine native pTOS-Systemaufrufbindung.'));
}
