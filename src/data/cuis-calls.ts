type Parameter = [name: string, detail: string];

export interface CuisCall {
  name: `CUIS_${string}`;
  opcode: number;
  handler: string;
  title: string;
  parameters: Parameter[];
  result: string;
  detail?: string;
  modes?: Parameter[];
  related?: CuisCall['name'][];
}

export interface CuisGroup {
  slug: string;
  title: string;
  description: string;
  calls: CuisCall[];
}

export const cuisPath = '/subsystems/cuis/';
export const cuisGroupPath = (slug: string) => `${cuisPath}${slug}/`;
export const cuisCallPath = (name: CuisCall['name']) => `/reference/${name.toLowerCase().replaceAll('_', '-')}/`;
export const cuisArguments = ['RDI', 'RSI', 'RDX', 'R10', 'R8', 'R9'];
export const cuisTransport = 'lib/aes/arch/x32/transport.c';
export const cuisPrototype = 'LONG cuis_call6(ULONG function,\n    UQUAD a, UQUAD b, UQUAD c,\n    UQUAD d, UQUAD e, UQUAD f);';

export function cuisImplementation(call: CuisCall) {
  if (call.handler === 'keyboard_map_lookup') return 'bios/ikbd.c';
  if (call.handler === 'cuis_stream_receipt') return 'aes/cuis_receipt.c';
  return 'aes/cuis_session.c';
}

const session: Parameter = ['session', 'An endpoint handle owned by the calling process.'];
const defaultSession: Parameter = ['session', 'The calling process’s default endpoint handle.'];
const window: Parameter = ['window', 'An owned native window handle.'];
const peer: Parameter = ['peer', 'A live endpoint handle.'];
const x: Parameter = ['x', 'Horizontal screen coordinate, a sign-extended LONG.'];
const y: Parameter = ['y', 'Vertical screen coordinate, a sign-extended LONG.'];
const extent: Parameter[] = [['width', 'Positive width in pixels.'], ['height', 'Positive height in pixels.']];
const rectangle: Parameter[] = [
  ['x', 'Output pointer to the left coordinate as a LONG.'], ['y', 'Output pointer to the top coordinate as a LONG.'],
  ['width', 'Output pointer to the width as a LONG.'], ['height', 'Output pointer to the height as a LONG.'],
];

export const cuisGroups: CuisGroup[] = [
  {
    slug: 'sessions', title: 'Sessions and discovery',
    description: 'Endpoint lifetime, client identity, labels and peer selection.',
    calls: [
      {
        name: 'CUIS_SESSION_START', opcode: 0, handler: 'cuis_service', title: 'Open a CUIS endpoint',
        parameters: [['flags', 'Use 0 for the default endpoint or CUIS_SESSION_NEW (1) for a fresh endpoint.']],
        detail: 'Mode 0 reuses an existing default endpoint. A new endpoint belongs to the same PROCESS and preserves its existing default binding.',
        result: 'A nonnegative endpoint handle. EAGAIN if a closed endpoint cohort prevents registration, ENSMEM on capacity or allocation failure, or another negative GEMDOS error.',
      },
      {
        name: 'CUIS_SESSION_QUERY', opcode: 1, handler: 'cuis_service', title: 'Check an owned endpoint',
        parameters: [session],
        result: 'E_OK for a live endpoint owned by the caller, EACCDN if none matches, or EINVAL if the handle exceeds 0x7FFFFFFF.',
        related: ['CUIS_SESSION_START', 'CUIS_SESSION_END'],
      },
      {
        name: 'CUIS_SESSION_END', opcode: 2, handler: 'cuis_service', title: 'Retire an owned endpoint',
        parameters: [session],
        detail: 'Removes the endpoint and releases its GUI state. Other endpoints in the same process retain their own identities.',
        result: 'E_OK after retirement, EACCDN if the endpoint is absent or foreign, or EINVAL if the handle exceeds 0x7FFFFFFF.',
      },
      {
        name: 'CUIS_SESSION_LABEL', opcode: 26, handler: 'cuis_directory_service', title: 'Set an endpoint label',
        parameters: [session, ['bytes', 'Pointer to the opaque label bytes.'], ['length', 'Label length from 0 to 32. Zero clears the label.']],
        detail: 'CUIS stores the exact bytes. libaes supplies the application naming convention.',
        result: 'E_OK on success or a negative GEMDOS error.',
      },
      {
        name: 'CUIS_LABEL_FIND', opcode: 27, handler: 'cuis_directory_service', title: 'Find an endpoint by label',
        parameters: [['bytes', 'Pointer to the exact label to match.'], ['length', 'Label length from 1 to 32.']],
        detail: 'Requires a registered caller. If several endpoints match, returns the smallest matching handle.',
        result: 'The endpoint handle, EFILNF if no label matches, or another negative GEMDOS error.',
      },
      {
        name: 'CUIS_PEER_NEXT', opcode: 75, handler: 'cuis_peer_service', title: 'Enumerate endpoints',
        parameters: [session, ['after', 'Previous handle, or sign-extended −1 to start at the first endpoint.']],
        detail: 'Enumeration uses increasing endpoint handles. The next value may belong to the caller.',
        result: 'The next live handle, EFILNF at the end, or another negative GEMDOS error.',
      },
      {
        name: 'CUIS_PEER_QUERY', opcode: 76, handler: 'cuis_peer_service', title: 'Read peer identity or state',
        parameters: [session, ['peer', 'Handle, client ID or zero according to field.'], ['field', 'Select a field from the modes below.'],
          ['address', 'Output buffer for LABEL or IDENTITY. Zero for scalar fields.'], ['bytes', 'Output capacity for LABEL, 16 for IDENTITY, or zero for scalar fields.']],
        modes: [
          ['CUIS_PEER_LABEL (0)', 'Copy opaque label bytes and return their length.'],
          ['CUIS_PEER_TAG (1)', 'Return the peer’s opaque 31-bit tag.'],
          ['CUIS_PEER_STATE (2)', 'Return CUIS_PEER_HAS_SURFACE and CUIS_PEER_HAS_BACKGROUND flags.'],
          ['CUIS_PEER_BACKGROUND (3)', 'Use peer 0. Return the current background endpoint.'],
          ['CUIS_PEER_ACTIVE (4)', 'Use peer 0. Return the endpoint selected by current focus and surface ownership.'],
          ['CUIS_PEER_IDENTITY (5)', 'Copy CUIS_PEER_IDENTITY_DATA and return 16. At offsets 0, 4, 8 and 12 it contains the GUI client ID, the low and high words of the opaque PROCESS number, and reserved zero. Each field is a little-endian 32-bit value.'],
          ['CUIS_PEER_HANDLE (6)', 'Pass a GUI client ID from 1 to 32767 in peer. Return its endpoint handle.'],
        ],
        result: 'The field value or byte count, EFILNF if no peer matches, or another negative GEMDOS error.',
      },
      {
        name: 'CUIS_SESSION_TAG', opcode: 77, handler: 'cuis_peer_service', title: 'Set an endpoint classification tag',
        parameters: [session, ['tag', 'An opaque value from 0 to 0x7FFFFFFF.']],
        detail: 'libaes assigns meaning to the tag and reads it through CUIS_PEER_QUERY.',
        result: 'E_OK on success or a negative GEMDOS error.',
      },
      {
        name: 'CUIS_PEER_RAISE', opcode: 78, handler: 'cuis_peer_service', title: 'Bring a peer to the foreground',
        parameters: [session, peer],
        detail: 'Raises the peer’s windows together, preserving their internal order. A peer with no visible windows can receive windowless focus.',
        result: 'E_OK, EFILNF if the peer is absent, EAGAIN if a display owner or input capture blocks the transfer, or another negative GEMDOS error.',
      },
    ],
  },
  {
    slug: 'windows', title: 'Windows and stacking',
    description: 'Window lifetime, geometry, visibility, stacking and clipping.',
    calls: [
      {
        name: 'CUIS_WINDOW_CREATE', opcode: 3, handler: 'cuis_window_service', title: 'Allocate a hidden native window',
        parameters: [x, y, ...extent],
        detail: 'Uses the default endpoint. The exclusive right and bottom edges must fit a signed LONG. A new window starts hidden and counts toward the 64-window endpoint quota.',
        result: 'A nonnegative native window handle, ENSMEM on a quota or allocation failure, or another negative GEMDOS error.',
      },
      {
        name: 'CUIS_WINDOW_CONFIGURE', opcode: 4, handler: 'cuis_window_service', title: 'Change window geometry',
        parameters: [window, x, y, ...extent],
        detail: 'The bounds including visual outsets must fit signed LONG coordinates. A change to a visible window updates damage and pointer routing.',
        result: 'E_OK on success or a negative GEMDOS error.',
      },
      {
        name: 'CUIS_WINDOW_DESTROY', opcode: 5, handler: 'cuis_window_service', title: 'Release a native window',
        parameters: [window],
        detail: 'Removes the window from display and input routing, discards its clipping snapshots and releases the handle.',
        result: 'E_OK on success or a negative GEMDOS error.',
      },
      {
        name: 'CUIS_WINDOW_SHOW', opcode: 6, handler: 'cuis_window_service', title: 'Show a window at the front of the stack',
        parameters: [window],
        detail: 'A newly shown window receives focus if its managed activation policy is enabled. An already visible window is left at its current position.',
        result: 'E_OK on success or a negative GEMDOS error.',
      },
      {
        name: 'CUIS_WINDOW_HIDE', opcode: 7, handler: 'cuis_window_service', title: 'Remove a window from the visible stack',
        parameters: [window],
        detail: 'Keeps the window allocated for a subsequent show operation.',
        result: 'E_OK on success or a negative GEMDOS error.',
      },
      {
        name: 'CUIS_WINDOW_RAISE', opcode: 8, handler: 'cuis_window_service', title: 'Move a visible window to the front',
        parameters: [window],
        detail: 'Clears a pending activation notice and updates focus for a managed window.',
        result: 'E_OK on success, EINVAL for a hidden window, or another negative GEMDOS error.',
      },
      {
        name: 'CUIS_WINDOW_LOWER', opcode: 9, handler: 'cuis_window_service', title: 'Move a visible window to the back',
        parameters: [window],
        detail: 'If the managed window held focus, the front window takes focus after the move.',
        result: 'E_OK on success, EINVAL for a hidden window, or another negative GEMDOS error.',
      },
      {
        name: 'CUIS_FOCUS_QUERY', opcode: 15, handler: 'cuis_window_service', title: 'Check whether a window has focus',
        parameters: [window],
        result: '1 for the focused window, 0 for another owned window, or a negative GEMDOS error.',
      },
      {
        name: 'CUIS_WINDOW_IDENTIFY', opcode: 34, handler: 'cuis_window_service', title: 'Translate a native window handle into a window ID',
        parameters: [window],
        detail: 'The small window identifier is used by stack queries and can be reused after the window is destroyed.',
        result: 'The positive window identifier or a negative GEMDOS error.',
      },
      {
        name: 'CUIS_WINDOW_REGION', opcode: 36, handler: 'cuis_region_service', title: 'Enumerate visible window rectangles',
        parameters: [window, ['index', 'Zero-based rectangle index. Zero starts a fresh snapshot while holding the display lock.'], ...rectangle],
        detail: 'CUIS clips the visual footprint to the display and excludes higher windows. Hold CUIS_DISPLAY_LOCK for a stable enumeration across calls.',
        result: '1 for a rectangle, 0 at the end, or a negative GEMDOS error.',
      },
      {
        name: 'CUIS_WINDOW_OUTSET', opcode: 37, handler: 'cuis_window_service', title: 'Extend a window’s visual footprint',
        parameters: [window, ['right', 'Extra pixels at the right edge, from 0 to 65535.'], ['bottom', 'Extra pixels at the bottom edge, from 0 to 65535.']],
        detail: 'Outsets affect clipping and damage. The window’s own geometry and pointer hit bounds stay at its configured size.',
        result: 'E_OK on success or a negative GEMDOS error.',
      },
      {
        name: 'CUIS_WINDOW_POLICY', opcode: 38, handler: 'cuis_window_service', title: 'Select managed window activation',
        parameters: [window, ['managed', '1 to enable managed activation or 0 to disable it.']],
        detail: 'Enabling the policy on a visible window sets a redraw notice. Disabling it clears the window’s notice flags.',
        result: 'E_OK on success or a negative GEMDOS error.',
      },
      {
        name: 'CUIS_STACK_QUERY', opcode: 41, handler: 'cuis_stack_service', title: 'Inspect the front or back of the window stack',
        parameters: [['position', '0 for the front, 1 for the back.'], ['id', 'LONG output for the selected window ID.'],
          ['owner', 'LONG output for the owner’s GUI client ID.'], ['below', 'LONG output for the next lower window ID.']],
        detail: 'A registered caller can query the stack while another endpoint holds the display lock. Empty or missing values are zero.',
        result: 'E_OK after copyout or a negative GEMDOS error.',
      },
      {
        name: 'CUIS_WINDOW_INFO', opcode: 42, handler: 'cuis_stack_service', title: 'Read global window metadata',
        parameters: [['id', 'Positive global window identifier.'], ['owner', 'LONG output for the owner’s GUI client ID.'],
          ['visible', 'LONG output for visibility.'], ['above', 'LONG output for the window ID above.'], ['below', 'LONG output for the window ID below.']],
        detail: 'Stack neighbors are zero for a hidden window or at either end of the visible stack.',
        result: 'E_OK after copyout or a negative GEMDOS error.',
      },
      {
        name: 'CUIS_WINDOW_CONTENT', opcode: 55, handler: 'cuis_window_service', title: 'Set the insets of a window’s content area',
        parameters: [window, ...(['left', 'top', 'right', 'bottom'].map(edge => [edge, 'Inset in pixels from 0 to 32767.'] as Parameter))],
        detail: 'CUIS uses the insets to distinguish the content area from window controls. A window can have an empty content area.',
        result: 'E_OK on success or a negative GEMDOS error.',
      },
      {
        name: 'CUIS_WINDOW_CORNER', opcode: 57, handler: 'cuis_window_service', title: 'Set the bottom-right window control rectangle',
        parameters: [window, ['width', 'Control width in pixels from 0 to 32767.'], ['height', 'Control height in pixels from 0 to 32767.']],
        detail: 'A zero width or height disables the corner control.',
        result: 'E_OK on success or a negative GEMDOS error.',
      },
      {
        name: 'CUIS_WINDOW_AT', opcode: 59, handler: 'cuis_window_at', title: 'Find the visible window at a screen point',
        parameters: [x, y],
        detail: 'Uses the window bounds for hit testing. A registered caller can query windows owned by peers.',
        result: 'A window ID, 0 if no window contains the point, or a negative GEMDOS error.',
      },
      {
        name: 'CUIS_WINDOWS_RESET', opcode: 63, handler: 'cuis_windows_reset', title: 'Reset the default endpoint’s window state',
        parameters: [defaultSession],
        detail: 'Destroys the caller’s windows and releases associated grabs and display coordination. The endpoint and peer windows stay available.',
        result: 'E_OK on success or a negative GEMDOS error.',
      },
    ],
  },
  {
    slug: 'input', title: 'Input and waits',
    description: 'Input routing, event predicates, timers and pointer or keyboard ownership.',
    calls: [
      {
        name: 'CUIS_EVENT_WAIT', opcode: 20, handler: 'cuis_event_service', title: 'Wait for readiness on a native window',
        parameters: [window, ['events', 'Nonzero mask of CUIS_EVENT_KEY (1), POINTER (2), REDRAW (4) and CONTROL (16).'],
          ['timeout', 'Sign-extended LONG in milliseconds. Zero polls and −1 waits indefinitely.']],
        detail: 'The window must stay visible. A key-only wait fails if the window loses focus. The call reports readiness without consuming the pending event.',
        result: '1 when a requested event is ready, 0 on timeout, or a negative GEMDOS error.',
      },
      {
        name: 'CUIS_SESSION_DELAY', opcode: 24, handler: 'cuis_delay_service', title: 'Delay an endpoint without consuming input',
        parameters: [defaultSession, ['milliseconds', 'Unsigned 32-bit interval. Zero yields to the scheduler.']],
        detail: 'A positive wait uses the kernel tick clock. Message and input queues remain available for a later wait.',
        result: 'E_OK after the delay, the scheduler result for a zero interval, or a negative GEMDOS error.',
      },
      {
        name: 'CUIS_SESSION_WAIT', opcode: 32, handler: 'cuis_session_wait', title: 'Wait for one or more endpoint events',
        parameters: [session, ['minimum', 'Stream byte threshold from 1 to 32767 when CUIS_READY_STREAM is selected.'],
          ['events', 'Nonzero mask of CUIS_READY_* sources.'], ['milliseconds', 'Unsigned 32-bit timeout interval when CUIS_READY_TIMER is selected.'],
          ['observers', 'Optional 4-byte-aligned pointer to an array of distinct owned 32-bit PROCESS observation handles.'],
          ['count', 'Number of handles from 0 to 16. An explicit array requires CUIS_READY_CHILD.']],
        detail: 'Waits against one deadline. Input-enabled waits store their result for CUIS_INPUT_RESULT. Without an explicit observer array, a child wait follows the endpoint’s publication receipts.',
        modes: [
          ['Stream and notices', 'CUIS_READY_STREAM (1), CUIS_READY_NOTICE (4).'],
          ['Timer', 'CUIS_READY_TIMER (2). A zero interval can yield when no other requested source is ready.'],
          ['Input', 'CUIS_READY_KEY (8), CUIS_READY_BUTTON (16), CUIS_READY_RECT1 (32), CUIS_READY_RECT2 (64).'],
          ['Display and controls', 'CUIS_READY_SURFACE (128), CUIS_READY_DISPLAY (256), CUIS_READY_CONTROL (512).'],
          ['Coordination', 'CUIS_READY_SERVICE (1024), CUIS_READY_CHILD (2048), CUIS_READY_BATCH (4096).'],
        ],
        result: 'A mask of requested ready sources or a negative GEMDOS error.',
      },
      {
        name: 'CUIS_INPUT_STATE', opcode: 33, handler: 'cuis_state_service', title: 'Sample the current pointer and modifier state',
        parameters: [defaultSession, ...rectangle.slice(0, 2), ['buttons', 'Output pointer to a 32-bit button mask.'],
          ['modifiers', 'Output pointer to a 32-bit modifier mask.']],
        detail: 'Reports a snapshot of the current state. It does not consume an input event.',
        result: 'E_OK after copyout or a negative GEMDOS error.',
      },
      {
        name: 'CUIS_INPUT_RECT', opcode: 43, handler: 'cuis_input_config', title: 'Configure a pointer rectangle predicate',
        parameters: [defaultSession, ['slot_flags', 'Bit 0 selects rectangle 0 or 1. Bit 1 selects outside rather than inside.'],
          x, y, ['width', 'Rectangle width as a sign-extended LONG.'], ['height', 'Rectangle height as a sign-extended LONG.']],
        detail: 'A later CUIS_SESSION_WAIT selects the predicate with CUIS_READY_RECT1 or CUIS_READY_RECT2.',
        result: 'E_OK on success or a negative GEMDOS error.',
      },
      {
        name: 'CUIS_INPUT_BUTTON', opcode: 44, handler: 'cuis_input_config', title: 'Configure a mouse button predicate',
        parameters: [defaultSession, ['mask', 'Unsigned 16-bit mask of buttons to examine.'], ['state', 'Unsigned 16-bit state to match.'],
          ['maximum_count', 'Maximum click count from 0 to 255.'], ['invert', '0 for equality, 1 for inequality.'], ['reserved', 'Pass zero.']],
        detail: 'A subsequent CUIS_SESSION_WAIT can evaluate the predicate. Changing the filter abandons any retained accumulation for the old predicate.',
        result: 'E_OK on success or a negative GEMDOS error.',
      },
      {
        name: 'CUIS_INPUT_RESULT', opcode: 45, handler: 'cuis_input_config', title: 'Read the most recent input wait result',
        parameters: [defaultSession, ['key', 'LONG output for the native BIOS key encoding.'],
          ['count', 'LONG output for the click count.'], ...rectangle.slice(0, 2),
          ['state', 'LONG output with buttons in bits 15–0 and modifiers in bits 31–16.']],
        detail: 'All five output pointers are required. Reading the snapshot does not consume it.',
        result: 'E_OK after copyout or a negative GEMDOS error.',
      },
      {
        name: 'CUIS_INPUT_INTERVAL', opcode: 46, handler: 'cuis_input_config', title: 'Read or set the click interval',
        parameters: [defaultSession, ['milliseconds', 'New interval from 1 to 5000 ms when setting.'],
          ['set', '0 to query or 1 to set.'], ['reserved1', 'Pass zero.'], ['reserved2', 'Pass zero.'], ['reserved3', 'Pass zero.']],
        detail: 'The interval is global. libaes maps the public GEM double-click rate to an interval.',
        result: 'The resulting interval in milliseconds or a negative GEMDOS error.',
      },
      {
        name: 'CUIS_MOUSE_LOCK', opcode: 47, handler: 'cuis_mouse_lock', title: 'Acquire or release a modal mouse grab',
        parameters: [defaultSession, ['acquire', '0 releases, 1 acquires or nests, and CUIS_MOUSE_FRESH (2) starts an isolated grab.'],
          ['block', '0 polls, 1 waits for availability. Use 0 for release.']],
        detail: 'A fresh grab is refused if the caller already holds the mouse. CUIS routes pointer input to the grab owner until its last release.',
        result: 'E_OK, EAGAIN if a nonblocking acquire would wait, or another negative GEMDOS error.',
      },
      {
        name: 'CUIS_KEYBOARD_LOCK', opcode: 48, handler: 'cuis_keyboard_lock', title: 'Acquire or release a modal keyboard grab',
        parameters: [defaultSession, ['acquire', '1 acquires or nests. 0 releases one level.']],
        detail: 'The caller must hold the display and mouse locks. The first acquisition starts a fresh keyboard queue.',
        result: 'E_OK on success, EACCDN if the required ownership is missing, or another negative GEMDOS error.',
      },
      {
        name: 'CUIS_CONTROL_READ', opcode: 56, handler: 'cuis_control_service', title: 'Read one queued window control event',
        parameters: [window, ...rectangle.slice(0, 2), ['buttons', 'Output pointer to the 32-bit button mask.'],
          ['changed', 'Output pointer to the 32-bit control state.']],
        detail: 'The window receives control input while visible, frontmost and focused. The call consumes an event only after successful copyout.',
        result: '1 for a copied event, 0 when no event can be read, ERANGE for a queued overflow report, or another negative GEMDOS error.',
      },
      {
        name: 'CUIS_POINTER_STYLE', opcode: 58, handler: 'cuis_pointer_style', title: 'Set an endpoint’s mouse pointer style',
        parameters: [defaultSession, ['form', 'Pointer to a readable MFORM cursor descriptor.'],
          ['hide_depth', 'Pointer hide depth from 0 to 32767. Zero requests visibility.']],
        detail: 'Copies the cursor form into kernel state. The display uses the style of the endpoint selected by current pointer routing.',
        result: 'E_OK on success or a negative GEMDOS error.',
      },
      {
        name: 'CUIS_KEYMAP_LOOKUP', opcode: 71, handler: 'keyboard_map_lookup', title: 'Read a byte from an active keyboard map',
        parameters: [['scancode', 'Scan code from 0 to 127.'], ['table', '0 for normal, 1 for shifted, 2 for caps lock.']],
        detail: 'Returns the lookup byte directly. This allows separate-address-space callers to look up a key without obtaining a kernel pointer.',
        result: 'The unsigned map byte, EINVAL for an invalid selector or scan code, or EINVFN if the map is unavailable.',
      },
    ],
  },
  {
    slug: 'display', title: 'Display and surfaces',
    description: 'Display updates, shared surfaces, the desktop background and screen metrics.',
    calls: [
      {
        name: 'CUIS_DISPLAY_LOCK', opcode: 35, handler: 'cuis_display_lock', title: 'Acquire or release display update ownership',
        parameters: [defaultSession, ['acquire', '1 acquires or nests. 0 releases one level.'], ['block', '0 polls, 1 waits. Use 0 for release.']],
        detail: 'The final release clears clipping snapshots and ends any staged surface paint for the owner. A mouse owner cannot block behind a foreign display owner.',
        result: 'E_OK, EAGAIN if a nonblocking acquire would wait, or another negative GEMDOS error.',
      },
      {
        name: 'CUIS_DISPLAY_REDRAW', opcode: 49, handler: 'cuis_display_redraw', title: 'Mark a screen rectangle for redraw',
        parameters: [defaultSession, x, y, ['width', 'Width from 0 to 32767.'], ['height', 'Height from 0 to 32767.']],
        detail: 'The caller must own the display lock. CUIS marks intersecting visible windows and the background as dirty. An empty rectangle has no effect.',
        result: 'E_OK on success or a negative GEMDOS error.',
      },
      {
        name: 'CUIS_SURFACE_REGISTER', opcode: 50, handler: 'cuis_surface_service', title: 'Register a top display surface',
        parameters: [defaultSession, ['height', 'Surface height in pixels, smaller than the screen height and at most 32767. Zero unregisters.']],
        detail: 'The surface spans the display width. libaes uses it for the menu bar; the object tree and its rendering policy remain in userspace.',
        result: 'E_OK on success, EAGAIN when foreign display ownership or capture blocks the change, or another negative GEMDOS error.',
      },
      {
        name: 'CUIS_SURFACE_STATUS', opcode: 51, handler: 'cuis_surface_service', title: 'Read or mark pending surface state',
        parameters: [defaultSession, ['action', '0 reads, 1 reads and clears reported events, 2 marks the owned surface dirty.']],
        detail: 'Status uses CUIS_SURFACE_OWNED (1), CUIS_SURFACE_DIRTY (2) and CUIS_SURFACE_POINTER (4). A mouse grab suppresses reporting and clearing pending events.',
        result: 'A status mask for actions 0 and 1, E_OK for action 2, or a negative GEMDOS error.',
      },
      {
        name: 'CUIS_SURFACE_BEGIN', opcode: 53, handler: 'cuis_surface_service', title: 'Stage painting of a top display surface',
        parameters: [defaultSession, ['height', 'Candidate height from 1 to 32767 and smaller than the current screen height.']],
        detail: 'The caller must own the display lock. Complete or cancel the staged paint with CUIS_SURFACE_END.',
        result: 'E_OK on success, EAGAIN if a foreign pointer capture or mouse grab prevents staging, or another negative GEMDOS error.',
      },
      {
        name: 'CUIS_SURFACE_END', opcode: 54, handler: 'cuis_surface_service', title: 'Commit or cancel a staged surface paint',
        parameters: [defaultSession, ['commit', '1 publishes the staged surface. 0 cancels it.']],
        detail: 'The display lock and staged paint must both belong to the caller.',
        result: 'E_OK on success, EAGAIN if committing is blocked by a foreign capture, or another negative GEMDOS error.',
      },
      {
        name: 'CUIS_BACKGROUND', opcode: 60, handler: 'cuis_background', title: 'Manage the desktop background surface',
        parameters: [defaultSession, ['action', 'Select an operation below.']],
        modes: [
          ['0', 'Unregister this endpoint’s background.'],
          ['1', 'Register and select this endpoint’s background.'],
          ['2', 'Query status. Bit 0 means this endpoint is selected and bit 1 means its background is dirty.'],
          ['3', 'Clear the selected background’s dirty flag.'],
          ['4', 'Mark the selected background dirty.'],
        ],
        detail: 'Changes require display ownership. The query can run without the display lock.',
        result: 'The status mask for action 2, E_OK on a successful change, or a negative GEMDOS error.',
      },
      {
        name: 'CUIS_BACKGROUND_REGION', opcode: 61, handler: 'cuis_background_region', title: 'Enumerate visible desktop rectangles',
        parameters: [defaultSession, ['index', 'Zero-based rectangle index.'], ...rectangle],
        detail: 'Enumerates the desktop area clipped against visible windows and the top surface. Hold the display lock for a stable snapshot across calls.',
        result: '1 for a rectangle, 0 at the end, or a negative GEMDOS error.',
      },
      {
        name: 'CUIS_DISPLAY_INFO', opcode: 62, handler: 'cuis_display_info', title: 'Read shared display metadata',
        parameters: [['selector', '0 for screen width, 1 for height, 2 for the top surface height, 3 for the selected background client ID.']],
        detail: 'The caller must have a registered endpoint. A zero background client ID means no selected background.',
        result: 'The selected nonnegative value, EINVFN when no screen dimensions are available, or another negative GEMDOS error.',
      },
    ],
  },
  {
    slug: 'messages', title: 'Messages and notifications',
    description: 'Opaque FIFO transfers, window notices and publication receipts.',
    calls: [
      {
        name: 'CUIS_STREAM_WRITE', opcode: 30, handler: 'cuis_stream_service', title: 'Append bytes to an endpoint’s stream',
        parameters: [peer, ['buffer', 'Pointer to the bytes to send.'], ['length', 'Exact byte count from 0 to 32767.'],
          ['block', '0 polls, 1 waits for space.'], ['sender', '0 uses the default endpoint. Otherwise pass one plus an owned sender endpoint handle.']],
        detail: 'CUIS appends the whole transfer in FIFO order and attaches the authenticated sender’s GUI client ID. The kernel accepts opaque bytes. Blocking mode on an explicit endpoint returns EINVFN.',
        result: 'The requested byte count, EAGAIN if a nonblocking write would wait, or another negative GEMDOS error.',
        related: ['CUIS_STREAM_READ', 'CUIS_STREAM_PENDING'],
      },
      {
        name: 'CUIS_STREAM_READ', opcode: 31, handler: 'cuis_stream_service', title: 'Read and consume bytes from an owned endpoint',
        parameters: [session, ['buffer', 'Output buffer for the requested bytes.'], ['length', 'Exact byte count from 0 to 32767.'],
          ['block', '0 polls, 1 waits, and CUIS_STREAM_READ_ORIGIN (2) polls for receipt provenance.'],
          ['sender', 'Optional LONG output for the first byte’s sender ID. Mode 2 requires an output and writes a receipt indicator instead.']],
        detail: 'Mode 2 writes 1 only for an exact packet committed by a receipt to this endpoint. libaes uses it for CH_EXIT delivery. A failed copyout leaves the bytes queued. Blocking mode on an explicit endpoint returns EINVFN.',
        result: 'The requested byte count, EAGAIN if a nonblocking read lacks enough bytes, or another negative GEMDOS error.',
        related: ['CUIS_STREAM_PEEK', 'CUIS_STREAM_RECEIPT'],
      },
      {
        name: 'CUIS_NOTICE_PEEK', opcode: 39, handler: 'cuis_notice_service', title: 'Inspect a pending window notice',
        parameters: [defaultSession, ['window', 'LONG output for the native window handle.'], ['id', 'LONG output for the small window identifier.']],
        detail: 'Leaves the notice pending. Activation takes precedence over redraw for the same window.',
        result: 'CUIS_NOTICE_REDRAW (1), CUIS_NOTICE_ACTIVATE (2), 0 when no notice is pending, or a negative GEMDOS error.',
      },
      {
        name: 'CUIS_NOTICE_PUBLISH', opcode: 40, handler: 'cuis_notice_service', title: 'Publish a message for a window notice',
        parameters: [defaultSession, window, ['kind', 'The pending REDRAW (1) or ACTIVATE (2) notice.'],
          ['buffer', 'Pointer to an opaque message supplied by libaes.'], ['length', 'Message size from 1 to 32 bytes.']],
        detail: 'Appends the bytes to the caller’s own stream and acknowledges the notice in the same operation. A full stream leaves the notice pending.',
        result: 'E_OK on success, EAGAIN when there is insufficient stream space, or another negative GEMDOS error.',
      },
      {
        name: 'CUIS_STREAM_PEEK', opcode: 88, handler: 'cuis_stream_service', title: 'Read stream bytes without consuming them',
        parameters: [session, ['buffer', 'Output buffer for the requested bytes.'], ['length', 'Exact byte count from 0 to 32767.'],
          ['block', '0 polls, 1 waits.'], ['sender', 'Optional LONG output for the first byte’s sender ID.']],
        detail: 'Leaves bytes queued and records batch read provenance. Buffer validation follows CUIS_STREAM_READ. Blocking mode on an explicit endpoint returns EINVFN.',
        result: 'The requested byte count, EAGAIN if a nonblocking peek lacks enough bytes, or another negative GEMDOS error.',
      },
      {
        name: 'CUIS_STREAM_PENDING', opcode: 89, handler: 'cuis_stream_service', title: 'Count queued stream bytes',
        parameters: [session, ['buffer', 'Pass zero.'], ['length', 'Pass zero.'], ['block', 'Pass zero.'], ['sender', 'Pass zero.']],
        detail: 'Reports the current byte count without consuming data.',
        result: 'The nonnegative byte count or a negative GEMDOS error.',
      },
      {
        name: 'CUIS_STREAM_RECEIPT', opcode: 94, handler: 'cuis_stream_receipt', title: 'Query or advance a stream publication receipt',
        parameters: [session, ['action', 'Select a receipt operation below.'], ['address', 'Pointer to a 4-byte-aligned CUIS_RECEIPT_RECORD.'],
          ['size', 'Pass 64 bytes.']],
        detail: 'The record contains sixteen little-endian 32-bit fields. Its operation word is reserved and must be zero. The source must match the endpoint, and commit checks the exact slot generation before publication.',
        modes: [
          ['CUIS_RECEIPT_QUERY (0)', 'Read the current receipt into the record without consuming it.'],
          ['CUIS_RECEIPT_PREPARE (1)', 'Capture the immutable packet bytes.'],
          ['CUIS_RECEIPT_COMMIT (2)', 'Append the packet and its provenance and record publication atomically.'],
          ['CUIS_RECEIPT_ACK (3)', 'Acknowledge the completed publication.'],
          ['CUIS_RECEIPT_RECLAIM (4)', 'Reclaim an eligible slot after the associated right and transient observation leases are retired.'],
        ],
        result: 'E_OK on success or a negative GEMDOS error.',
      },
    ],
  },
  {
    slug: 'state', title: 'Shared state and directory entries',
    description: 'Display preferences, persistent context bytes and endpoint-owned entries.',
    calls: [
      {
        name: 'CUIS_SETTING', opcode: 64, handler: 'cuis_setting', title: 'Read or update shared UI preferences',
        parameters: [['slot', 'Primary slot from 0 to 63.'], ['value', 'Unsigned 16-bit value for the primary slot.'],
          ['other', 'Second slot from 0 to 63 when updating it.'], ['other_value', 'Unsigned 16-bit value for that slot.'],
          ['mask', '0 queries the primary slot. Bits 0 and 1 select writes to the primary and second slots.']],
        detail: 'Requires a registered caller. Writes require the display lock and apply the selected slots together.',
        result: 'The queried value, EFILNF for an unset slot, E_OK for a write, or another negative GEMDOS error.',
      },
      {
        name: 'CUIS_CONTEXT', opcode: 65, handler: 'cuis_context', title: 'Read or write a shared UI context',
        parameters: [defaultSession, ['slot', 'Context slot from 0 to 3.'], ['action', 'Select a context operation below.'],
          ['address', 'User buffer for reading or writing.'], ['bytes', 'Number of bytes, limited to 32767 minus offset.'],
          ['offset', 'Byte offset from 0 to 32767. Pass zero for the size query.']],
        modes: [
          ['CUIS_CONTEXT_READ (0)', 'Copy the requested range out, zero-filling past the stored extent.'],
          ['CUIS_CONTEXT_WRITE (1)', 'Update the requested range and extend the context if needed.'],
          ['CUIS_CONTEXT_SIZE (2)', 'Return the stored size. Pass zero for address, bytes and offset.'],
        ],
        detail: 'Reads and writes require the display lock. The contents are opaque to CUIS and persist beyond an endpoint’s retirement.',
        result: 'The stored size for a size query, E_OK for a transfer, or a negative GEMDOS error.',
      },
      {
        name: 'CUIS_ENTRY_PUBLISH', opcode: 72, handler: 'cuis_entry_service', title: 'Publish an endpoint-owned directory entry',
        parameters: [defaultSession, ['slot', 'Directory slot from 0 to 63.'], ['reserved', 'Pass zero.'],
          ['address', 'Pointer to the entry bytes.'], ['bytes', 'Entry size from 1 to 128.']],
        detail: 'Copies the bytes into an unclaimed slot. CUIS clears the ownership when the endpoint retires.',
        result: 'The slot number, EAGAIN if the slot is already owned, or another negative GEMDOS error.',
      },
      {
        name: 'CUIS_ENTRY_OWNER', opcode: 73, handler: 'cuis_entry_service', title: 'Get the owner of a directory entry',
        parameters: [defaultSession, ['slot', 'Directory slot from 0 to 63.']],
        detail: 'Pass the returned endpoint handle into CUIS_ENTRY_READ to ensure the entry still has the expected owner.',
        result: 'The owner’s endpoint handle, EFILNF for an unclaimed slot, or another negative GEMDOS error.',
      },
      {
        name: 'CUIS_ENTRY_READ', opcode: 74, handler: 'cuis_entry_service', title: 'Read an endpoint-owned directory entry',
        parameters: [defaultSession, ['slot', 'Directory slot from 0 to 63.'], ['owner', 'Expected owner’s endpoint handle.'],
          ['address', 'Output buffer.'], ['capacity', 'Buffer capacity in bytes, at most 128.']],
        detail: 'Copies the entry only if the slot still belongs to the specified endpoint.',
        result: 'The copied byte count, EFILNF for an unclaimed slot, EAGAIN if the owner changed, ERANGE for insufficient capacity, or another negative GEMDOS error.',
      },
    ],
  },
  {
    slug: 'coordination', title: 'Process launch and coordination',
    description: 'GUI-aware process launch, endpoint barriers and coordinated stream batches.',
    calls: [
      {
        name: 'CUIS_LAUNCH_ATTACH', opcode: 93, handler: 'cuis_launch_attach', title: 'Launch a process with GUI attachments',
        parameters: [defaultSession, ['authorization', 'Nonzero mask of CUIS_LAUNCH_CONSOLE (1) and CUIS_LAUNCH_OBSERVE (2).'],
          ['path', 'User pointer to the executable path.'], ['tail', 'User pointer to the command tail.'],
          ['environment', 'User pointer to the environment, or zero to inherit.'],
          ['directory', 'Optional user pointer to the child’s starting directory.']],
        detail: 'Prepares the native process, installs the requested console lease or observation receipt, and commits the launch. The console lease is tied to the child’s process lifetime.',
        result: 'The child’s positive PID, EAGAIN if console ownership or receipt capacity blocks the launch, or another negative GEMDOS error.',
        related: ['CUIS_STREAM_RECEIPT', 'CUIS_SESSION_WAIT'],
      },
      {
        name: 'CUIS_ENDPOINT_BARRIER', opcode: 95, handler: 'cuis_endpoint_barrier', title: 'Freeze or reopen endpoint registration',
        parameters: [session, ['action', 'CUIS_BARRIER_ACQUIRE (0) or CUIS_BARRIER_RELEASE (1).'],
          ['token', 'Zero for acquire. Pass the generation returned by acquire when releasing.']],
        detail: 'Acquire fixes the set of existing peer endpoints for batch delivery. Release requires the exact owner and generation. Retirement of the owner releases the barrier.',
        result: 'A positive generation on acquire, E_OK on release, EAGAIN when a barrier or GUI operation blocks acquisition, or another negative GEMDOS error.',
      },
      {
        name: 'CUIS_STREAM_BATCH', opcode: 96, handler: 'cuis_stream_batch', title: 'Stage and deliver a coordinated stream batch',
        parameters: [session, ['command', '64-bit CUIS_BATCH_COMMAND value. Bits 63–32 select the operation. Bits 31–0 carry the barrier generation or QUERY field.'],
          ['a', 'First mode-specific argument.'], ['b', 'Second mode-specific argument.'],
          ['c', 'Third mode-specific argument.'], ['d', 'Fourth mode-specific argument.']],
        detail: 'Requests and replies carry at most 128 opaque bytes. CUIS tracks provenance for whole-range stream reads and wakes endpoints through CUIS_READY_BATCH.',
        modes: [
          ['CUIS_BATCH_STAGE (0)', '(peer, address, bytes, wait_for_retirement) stages a request for a peer captured by the barrier.'],
          ['CUIS_BATCH_SEAL (1)', '(result_bytes, reply_publish_bytes, 0, 0) validates staged requests and makes them available. A zero reply_publish_bytes uses the actual reply size.'],
          ['CUIS_BATCH_QUERY (2)', 'Pass four zeros. In the command’s low word, select ID (0), WORK (1), STATE (2), READ_OFFSET (3), READ_BYTES (4), RESULT_ID (5), RESULT_OFFSET (6) or RESULT_BYTES (7).'],
          ['CUIS_BATCH_READ (3)', '(address, capacity, 0, 0) reads the staged request or opaque reply.'],
          ['CUIS_BATCH_PUBLISH (4)', 'A receiving endpoint passes four zeros to append its request. The owner passes (address, bytes, release_barrier, expected_work), with expected_work set to CUIS_BATCH_DRAINED or CUIS_BATCH_REPLY.'],
          ['CUIS_BATCH_SETTLE (5)', 'Four zeros acknowledge a consumed request that can be accepted without retirement. (address, bytes, consumed_bytes, 0) records an opaque reply.'],
        ],
        result: 'A value for QUERY, a byte count for READ, E_OK for state changes, or a negative GEMDOS error. EAGAIN signals pending work, changed state or insufficient stream space.',
      },
    ],
  },
];
