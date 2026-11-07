import { type ITheme, Terminal } from '@williamthorsen/terminal-react';
import { type ReactElement, useState } from 'react';

import type { TelefactorClient } from '#src/client/create-telefactor-client.ts';
import { describeError } from '#src/portable/describe-error.ts';
import { TERMINAL_CLOSE_CODES } from '#src/terminal/terminal-close-codes.ts';

export interface HarnessTerminalProps {
  client: TelefactorClient;
  /** The harness to start; the settings' default when omitted. */
  harness?: string | undefined;
  /** Why no session can start, such as a harness without an interactive command; disables Start session. */
  unavailableReason?: string | undefined;
  theme?: ITheme | undefined;
  className?: string | undefined;
}

/**
 * The harness's interactive session in an embedded terminal, with the controls that start and end it. The tab keeps the
 * session's id, so that a reload reattaches to the running session. The terminal's height is the custom property
 * `--telefactor-terminal-height`, `20rem` by default.
 */
export function HarnessTerminal({
  client,
  harness,
  unavailableReason,
  theme,
  className,
}: HarnessTerminalProps): ReactElement {
  type View = { kind: 'idle'; message?: string } | { kind: 'starting' } | { kind: 'running'; id: string };
  const storageKey = `telefactor:terminal:${client.basePath}`;
  const [view, setView] = useState<View>(() => {
    const id = readStoredId(storageKey);
    return id === undefined ? { kind: 'idle' } : { kind: 'running', id };
  });

  async function startSession(): Promise<void> {
    setView({ kind: 'starting' });
    try {
      const { id } = await client.createTerminalSession(harness === undefined ? {} : { harness });
      writeStoredId(storageKey, id);
      setView({ kind: 'running', id });
    } catch (error: unknown) {
      setView({ kind: 'idle', message: describeError(error) });
    }
  }

  async function endSession(id: string): Promise<void> {
    try {
      await client.closeTerminalSession(id);
    } catch {
      // The session has already ended; the socket's close reports why.
      endView('The session ended.');
    }
  }

  function endView(message: string): void {
    writeStoredId(storageKey, undefined);
    setView({ kind: 'idle', message });
  }

  return (
    <div className={className}>
      <div>
        {view.kind === 'running' ? (
          <button type="button" onClick={() => void endSession(view.id)}>
            End session
          </button>
        ) : (
          <button
            type="button"
            disabled={view.kind === 'starting' || unavailableReason !== undefined}
            onClick={() => void startSession()}
          >
            Start session
          </button>
        )}
      </div>
      {view.kind !== 'running' && unavailableReason !== undefined && <p>{unavailableReason}</p>}
      <p role="status">{view.kind === 'idle' ? view.message : undefined}</p>
      {view.kind === 'running' && (
        <div style={{ height: 'var(--telefactor-terminal-height, 20rem)' }}>
          <Terminal
            url={client.terminalSocketUrl(view.id)}
            theme={theme}
            onClose={(event) => endView(describeClose(event.code, event.reason))}
          />
        </div>
      )}
    </div>
  );
}

// region | Helpers
/** Describes why the socket closed, from the code and reason that the server sent. */
function describeClose(code: number, reason: string): string {
  if (code === TERMINAL_CLOSE_CODES.exited && reason !== '') return `The session ended: ${reason}.`;
  if (code === TERMINAL_CLOSE_CODES.replaced) return 'This session is open in another tab.';
  return 'The session ended.';
}

/** Returns the tab's session storage, or `undefined` where the page cannot reach it. */
function readStorage(): Storage | undefined {
  try {
    const storage: unknown = Reflect.get(globalThis, 'sessionStorage');
    return storage instanceof Storage ? storage : undefined;
  } catch {
    return undefined;
  }
}

function readStoredId(key: string): string | undefined {
  try {
    return readStorage()?.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
}

/** Stores the id, or removes it when `id` is undefined; a page without storage loses the session on reload. */
function writeStoredId(key: string, id: string | undefined): void {
  try {
    if (id === undefined) readStorage()?.removeItem(key);
    else readStorage()?.setItem(key, id);
  } catch {
    // Storage is unavailable or full.
  }
}
// endregion | Helpers
