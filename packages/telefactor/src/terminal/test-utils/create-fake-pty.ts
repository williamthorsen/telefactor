import type { PtyProcess, SpawnPty } from '../create-terminal-sessions.ts';

/** A pty whose output and exit the test drives, and which records what the session sends it. */
export interface FakePty extends PtyProcess {
  readonly file: string;
  readonly args: readonly string[];
  readonly options: Parameters<SpawnPty>[2];
  readonly written: string[];
  readonly sizes: { cols: number; rows: number }[];
  readonly isPaused: boolean;
  emitData(data: string): void;
  emitExit(event: { exitCode: number; signal?: number }): void;
}

/** Returns a pty factory that creates fake ptys and the list of those that it created. */
export function createFakeSpawnPty(): { spawnPty: SpawnPty; ptys: FakePty[] } {
  const ptys: FakePty[] = [];
  let nextPid = 900_000;

  function spawnPty(file: string, args: readonly string[], options: Parameters<SpawnPty>[2]): FakePty {
    const dataListeners: ((data: string) => void)[] = [];
    const exitListeners: ((event: { exitCode: number; signal?: number }) => void)[] = [];
    const written: string[] = [];
    const sizes: { cols: number; rows: number }[] = [];
    let isPaused = false;
    const pty: FakePty = {
      pid: nextPid++,
      file,
      args,
      options,
      written,
      sizes,
      get isPaused() {
        return isPaused;
      },
      onData: (listener) => {
        dataListeners.push(listener);
      },
      onExit: (listener) => {
        exitListeners.push(listener);
      },
      write: (data) => {
        written.push(data.toString('utf8'));
      },
      resize: (cols, rows) => {
        sizes.push({ cols, rows });
      },
      pause: () => {
        isPaused = true;
      },
      resume: () => {
        isPaused = false;
      },
      emitData: (data) => {
        for (const listener of dataListeners) listener(data);
      },
      emitExit: (event) => {
        for (const listener of exitListeners) listener(event);
      },
    };
    ptys.push(pty);
    return pty;
  }

  return { spawnPty, ptys };
}
