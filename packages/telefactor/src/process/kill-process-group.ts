/** The time between the first signal and the SIGKILL sent to a stopped process group. */
export const KILL_GRACE_MS = 5000;

/** Sends a signal to the process group led by `pid`, which contains every process that the leader started. */
export function killProcessGroup(pid: number | undefined, signal: NodeJS.Signals): void {
  if (pid === undefined) return;
  try {
    process.kill(-pid, signal);
  } catch {
    // The group has already ended.
  }
}
