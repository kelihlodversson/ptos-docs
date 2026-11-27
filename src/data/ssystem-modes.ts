import { nativeCalls, nativePath } from './native-calls.ts';

export const ssystemDescription = 'Query the kernel, manage cookies and system variables, and access native pTOS services.';
export const ssystemModePath = (name: string) => `/reference/ssystem/#${name}`;

interface Mode {
  name: string;
  number: number;
  args: [string, string];
  result: string;
  condition?: string;
  href?: string;
  description?: string[];
}

export const ssystemModeGroups: { title: string; modes: Mode[] }[] = [
  { title: 'Discovery and build information', modes: [
    { name: 'S_INQUIRE', number: -1, args: ['selector', '0'],
      result: 'Returns E_OK if pTOS advertises the signed 16-bit selector in arg1, or EINVFN otherwise.' },
    { name: 'S_OSNAME', number: 0, args: ['0', '0'],
      result: 'Returns the four ASCII bytes pTOS packed most significant byte first (0x70544F53).' },
    { name: 'S_OSXNAME', number: 1, args: ['0', '0'],
      result: 'Returns the EmuT subtype identifier (0x456D7554), packed most significant byte first.' },
    { name: 'S_OSVERSION', number: 2, args: ['0', '0'],
      result: 'Returns the unreleased marker 0x00000061. The major, minor and patch bytes are zero and the release character is a.' },
    { name: 'S_OSBUILDDATE', number: 4, args: ['0', '0'],
      result: 'Returns the build date in binary. Bits 31–24 hold the day, 23–16 the month and 15–0 the year.' },
    { name: 'S_OSFEATURES', number: 7, args: ['0', '0'],
      result: 'Returns a bit mask. Bit 0 is set with CONF_WITH_USER_ASPACE. The swapping and storage encryption bits are clear.' },
    { name: 'S_KNAME', number: 900, args: ['buffer', 'bytes'],
      result: 'Copies the NUL-terminated string pTOS. Returns E_OK or ERANGE for a buffer shorter than five bytes.' },
    { name: 'S_CNAME', number: 910, args: ['buffer', 'bytes'],
      result: 'Copies the NUL-terminated compiler name (gcc or clang). Returns E_OK, or ERANGE if it cannot fit the whole string.' },
    { name: 'S_CVERSION', number: 911, args: ['buffer', 'bytes'],
      result: 'Copies the NUL-terminated compiler version string (__VERSION__). Returns E_OK, or ERANGE if it cannot fit the whole string.' },
  ] },
  { title: 'Cookies and system variables', modes: [
    { name: 'S_GETCOOKIE', number: 8, args: ['tag, slot, or 0', 'out or 0'],
      result: 'A key above 0xFFFF looks up a cookie value. A key from 1 through 0xFFFF reads the tag at a one-based slot. Zero queries jar capacity. With out = 0 the value is returned directly. A non-null out receives a 32-bit value and the call returns E_OK. Missing tags or out-of-range slots return ERR (−1).',
      condition: 'On CONF_WITH_USER_ASPACE builds, a lookup by tag treats cookies containing kernel pointers as missing.' },
    { name: 'S_SETCOOKIE', number: 9, args: ['tag', 'value'],
      result: 'Sets or inserts a 32-bit cookie value. Returns E_OK or ENSMEM if the jar has no room for a new entry.' },
    { name: 'S_DELCOOKIE', number: 26, args: ['tag', '0'],
      result: 'Removes a cookie. Returns E_OK or ERR (−1) if the tag is absent.' },
    { name: 'S_GETLVAL', number: 10, args: ['TOS address', '0'],
      result: 'Reads a mapped 32-bit system variable. Returns zero for a kernel pointer on CONF_WITH_USER_ASPACE builds.' },
    { name: 'S_GETWVAL', number: 11, args: ['TOS address', '0'],
      result: 'Returns a mapped 16-bit system variable, zero-extended.' },
    { name: 'S_GETBVAL', number: 12, args: ['TOS address', '0'],
      result: 'Returns a mapped 8-bit system variable, zero-extended.' },
    ...([['S_SETLVAL', 13, 32], ['S_SETWVAL', 14, 16], ['S_SETBVAL', 15, 8]] as const).map(([name, number, bits]) => ({
      name, number, args: ['TOS address', 'value'],
      result: `Writes the low ${bits} bits of value to a mapped system variable and returns E_OK.`,
      condition: 'Returns EACCDN on CONF_WITH_USER_ASPACE builds.',
    } satisfies Mode)),
  ] },
  { title: 'pTOS extensions', modes: [
    { name: 'S_CONSOLE_DIM', number: -2, args: ['console_dim *', 'bytes'],
      result: 'Copies columns, rows and font cell dimensions in pixels as four unsigned 16-bit fields. Returns the byte count or the kernel structure size when bytes is −1.' },
    ...nativeCalls.filter(call => call.opcode === 0x154 && call.mode !== undefined).map(call => ({
      name: call.name, number: call.mode!, args: [call.args[1][0], call.args[2][0]],
      result: call.title + '. ' + call.result,
      condition: call.status === 'experimental' ? `Experimental. ${call.config}` : call.config,
      ...(call.embeddedInSsystem
        ? { description: call.description }
        : { href: nativePath(call.name) }),
    } satisfies Mode)).sort((a, b) => b.number - a.number),
  ] },
];
