// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TelefactorClient } from '#src/client/create-telefactor-client.ts';
import { TelefactorRequestError } from '#src/client/telefactor-request-error.ts';
import { TERMINAL_CLOSE_CODES } from '#src/terminal/terminal-close-codes.ts';

import { HarnessTerminal } from '../HarnessTerminal.tsx';

const terminalProps = vi.hoisted(() => {
  const props: { url: string; onClose: ((event: CloseEvent) => void) | undefined } = { url: '', onClose: undefined };
  return props;
});

// xterm needs a canvas, which jsdom lacks; the mock records what the component passes to it.
vi.mock('@williamthorsen/terminal-react', () => ({
  Terminal: ({ url, onClose }: { url: string; onClose?: (event: CloseEvent) => void }) => {
    terminalProps.url = url;
    terminalProps.onClose = onClose;
    return <div data-testid="terminal">{url}</div>;
  },
}));

const STORAGE_KEY = 'telefactor:terminal:/api/telefactor';

describe(HarnessTerminal, () => {
  beforeEach(() => {
    sessionStorage.clear();
    terminalProps.url = '';
    terminalProps.onClose = undefined;
  });

  afterEach(cleanup);

  it('starts a session of the chosen harness and attaches to its socket', async () => {
    const client = createClient();
    render(<HarnessTerminal client={client} harness="codex" />);

    fireEvent.click(screen.getByRole('button', { name: 'Start session' }));

    expect(await screen.findByTestId('terminal')).toHaveProperty('textContent', 'ws://test/session-1');
    expect(client.createTerminalSession).toHaveBeenCalledWith({ harness: 'codex' });
    expect(sessionStorage.getItem(STORAGE_KEY)).toBe('session-1');
  });

  it('reattaches to the session that the tab stored', () => {
    sessionStorage.setItem(STORAGE_KEY, 'stored');
    render(<HarnessTerminal client={createClient()} />);

    expect(screen.getByTestId('terminal')).toHaveProperty('textContent', 'ws://test/stored');
    expect(screen.getByRole('button', { name: 'End session' })).toBeDefined();
  });

  it.each([
    [TERMINAL_CLOSE_CODES.exited, 'exited with code 0', 'The session ended: exited with code 0.'],
    [TERMINAL_CLOSE_CODES.replaced, 'The session was opened elsewhere.', 'This session is open in another tab.'],
    [TERMINAL_CLOSE_CODES.ended, 'The session was ended.', 'The session ended.'],
    [TERMINAL_CLOSE_CODES.unknown, 'The session does not exist.', 'The session no longer exists.'],
    [1006, '', 'The connection to the dev server closed.'],
  ])('reports a close with code %i and forgets the session', (code, reason, message) => {
    sessionStorage.setItem(STORAGE_KEY, 'stored');
    render(<HarnessTerminal client={createClient()} />);

    act(() => terminalProps.onClose?.(new CloseEvent('close', { code, reason })));

    expect(screen.getByRole('status')).toHaveProperty('textContent', message);
    expect(screen.queryByTestId('terminal')).toBeNull();
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('ends the session through the client', () => {
    sessionStorage.setItem(STORAGE_KEY, 'stored');
    const client = createClient();
    render(<HarnessTerminal client={client} />);

    fireEvent.click(screen.getByRole('button', { name: 'End session' }));

    expect(client.closeTerminalSession).toHaveBeenCalledWith('stored');
  });

  it('offers no session while one cannot start, and still shows a running one', () => {
    render(<HarnessTerminal client={createClient()} unavailableReason="No recipe." />);

    expect(screen.getByRole('button', { name: 'Start session' })).toHaveProperty('disabled', true);
    expect(screen.getByText('No recipe.')).toBeDefined();
    cleanup();
    sessionStorage.setItem(STORAGE_KEY, 'stored');
    render(<HarnessTerminal client={createClient()} unavailableReason="No recipe." />);

    expect(screen.getByTestId('terminal')).toBeDefined();
    expect(screen.queryByText('No recipe.')).toBeNull();
  });

  it('shows why a session could not start', async () => {
    const client = createClient({
      createTerminalSession: vi.fn(() =>
        Promise.reject(new TelefactorRequestError(409, 'The harness rovo-dev has no interactive command.')),
      ),
    });
    render(<HarnessTerminal client={client} harness="rovo-dev" />);

    fireEvent.click(screen.getByRole('button', { name: 'Start session' }));

    expect(await screen.findByText('The harness rovo-dev has no interactive command.')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Start session' })).toHaveProperty('disabled', false);
  });
});

// region | Helpers
function createClient(overrides: Partial<TelefactorClient> = {}): TelefactorClient {
  return {
    basePath: '/api/telefactor',
    cancelJob: vi.fn(),
    closeTerminalSession: vi.fn((id: string) => Promise.resolve({ id, harness: 'codex' })),
    createTerminalSession: vi.fn(() => Promise.resolve({ id: 'session-1', harness: 'codex' })),
    getJob: vi.fn(),
    listHarnesses: vi.fn(),
    startJob: vi.fn(),
    terminalSocketUrl: (id) => `ws://test/${id}`,
    testHarness: vi.fn(),
    ...overrides,
  };
}
// endregion | Helpers
