export const pollConfig = 'CONF_WITH_FPOLL_TIME64';
export const pollPath = '/reference/fpoll-time64/';

export const pollFlags: [name: string, value: number, detail: string][] = [
  ['POLLIN', 0x001, 'Read readiness. Regular files are readable at end of file.'],
  ['POLLPRI', 0x002, 'Priority read readiness when the provider supplies it.'],
  ['POLLOUT', 0x004, 'Write readiness.'],
  ['POLLERR', 0x008, 'Provider error, including a PFS file without a readiness callback. Reported even if unrequested.'],
  ['POLLHUP', 0x010, 'Hangup reported by a provider, even if unrequested.'],
  ['POLLNVAL', 0x020, 'Missing or invalidated descriptor, even if no events were requested.'],
  ['POLLRDNORM', 0x040, 'Normal read readiness. Uses the same readiness check as POLLIN.'],
  ['POLLRDBAND', 0x080, 'Priority read readiness. Uses the same readiness check as POLLPRI.'],
  ['POLLWRNORM', 0x100, 'Normal write readiness. Uses the same readiness check as POLLOUT.'],
  ['POLLWRBAND', 0x200, 'Declared by the SDK. The pTOS poll engine does not report this event.'],
  ['POLLMSG', 0x400, 'Declared by the SDK. The pTOS poll engine does not report this event.'],
];
