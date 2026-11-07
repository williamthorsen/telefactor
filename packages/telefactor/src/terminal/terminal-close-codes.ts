/** The WebSocket close codes with which a session's socket ends, each with a reason that the page can show. */
export const TERMINAL_CLOSE_CODES = {
  /** The process exited; the reason describes the exit. */
  exited: 4000,
  /** Another socket attached to the session. */
  replaced: 4001,
  /** The session was ended through `close` or `closeAll`. */
  ended: 4003,
  /** The session does not exist. */
  unknown: 4004,
} as const;
