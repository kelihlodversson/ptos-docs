export interface AesVectorCall {
  name: 'shel_readve' | 'shel_writeve';
  title: string;
  prototype: string;
  parameters: [name: string, description: string][];
  description: string[];
  result: string;
}

export const aesVectorCalls: AesVectorCall[] = [
  {
    name: 'shel_readve', title: 'Read the application’s startup path and vectors',
    prototype: 'short shel_readve(const char **path,\n    const char *const **argv,\n    const char *const **envp);',
    parameters: [
      ['path', 'Receives the qualified executable pathname saved at launch.'],
      ['argv', 'Receives the original NULL-terminated argument vector.'],
      ['envp', 'Receives the original NULL-terminated environment vector.'],
    ],
    description: [
      'The application needs a live AES registration from appl_init. libaes obtains the launch snapshot from AT_PTOS_LAUNCH_VECTORS. The snapshot retains the caller’s original argv[0] and vectors even when binfmt gives the interpreter different entry arguments.',
      'The three returned pointers are borrowed and read-only. Repeated reads and aliases share the same snapshot. The pointers remain valid until appl_exit retires the application context.',
    ],
    result: 'Returns 1 on success. A null output pointer, missing launch metadata or invalid registration returns 0 and preserves all output values.',
  },
  {
    name: 'shel_writeve', title: 'Launch a program or accessory with explicit vectors',
    prototype: 'short shel_writeve(short mode,\n    short graphical,\n    short execution,\n    const void *command,\n    char *const argv[],\n    char *const envp[]);',
    parameters: [
      ['mode', 'SWM_LAUNCH (0), SWM_LAUNCHNOW (1) or SWM_LAUNCHACC (3), optionally with SW_DEFDIR.'],
      ['graphical', 'With SWM_LAUNCHNOW, use GEMAPP or TOSAPP. SWM_LAUNCH derives the kind from the file extension. SWM_LAUNCHACC selects the accessory role for any pathname. Modes 0 and 3 ignore this parameter.'],
      ['execution', 'Use CL_NORMAL with SWM_LAUNCH and SWM_LAUNCHACC. SWM_LAUNCHNOW accepts SHW_IMMED, SHW_PARALLEL or SHW_CHAIN. SHW_CHAIN requires GEMAPP.'],
      ['command', 'Executable pathname, or a SHELW pointer with newcmd and defdir when using SW_DEFDIR.'],
      ['argv', 'Readable NULL-terminated argument vector including argv[0], which may be an empty string.'],
      ['envp', 'Readable NULL-terminated environment vector. A null pointer inherits the current environment and a vector with just NULL selects an empty environment.'],
    ],
    description: [
      'Pass separated arguments directly. SW_ENVIRON and CL_PARSE are invalid for vector launch. The library resolves the executable against the caller before applying an explicit child directory. The PROCESS launch transaction copies the vectors and attaches any required console or child-completion state before the child starts.',
      'SWM_LAUNCH starts .ACC files as ELF accessories and uses the suffix to classify other files. SWM_LAUNCHACC selects ELF accessory startup regardless of suffix. Both modes default to the executable directory and send CH_EXIT when the child exits. SWM_LAUNCHNOW selects program startup even for a .ACC file.',
      'SHW_CHAIN prepares a GEM successor to run after the calling application exits. The prepared image retains the copied arguments, environment and directory.',
    ],
    result: 'Returns the positive child PID for an ordinary successful launch, 1 for an accepted SHW_CHAIN, or 0 on failure.',
  },
];
