import { fireEvent, render, screen } from '@testing-library/react';
import { type HarnessTestResult, TelefactorRequestError } from '@williamthorsen/telefactor/client';
import { type ReactElement, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { createFakeClient } from '#src/test-utils/create-fake-client.ts';

import { HarnessPanel } from '../HarnessPanel.tsx';

describe(HarnessPanel, () => {
  it('preselects the default harness and reports it', async () => {
    const onHarnessChange = vi.fn();
    renderPanel(createFakeClient(), onHarnessChange);

    expect(await screen.findByLabelText('Harness')).toHaveValue('claude-code');
    expect(onHarnessChange).toHaveBeenCalledWith('claude-code');
    expect(screen.getByRole('option', { name: 'Codex' })).toBeInTheDocument();
  });

  it("shows the config file's problems and reports that no harness can run", async () => {
    const onHarnessChange = vi.fn();
    const client = createFakeClient({
      listHarnesses: () =>
        Promise.resolve({
          source: 'file',
          configPath: '/app/telefactor.config.json',
          problems: [{ path: 'default', message: 'Name a harness that `harnesses` defines.' }],
        }),
    });
    renderPanel(client, onHarnessChange);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('/app/telefactor.config.json');
    expect(alert).toHaveTextContent('default: Name a harness that `harnesses` defines.');
    expect(onHarnessChange).toHaveBeenCalledWith(undefined);
    expect(screen.queryByLabelText('Harness')).not.toBeInTheDocument();
  });

  it('shows why the list could not be loaded', async () => {
    const client = createFakeClient({
      listHarnesses: () => Promise.reject(new TelefactorRequestError(403, 'Forbidden.')),
    });
    renderPanel(client);

    expect(await screen.findByRole('alert')).toHaveTextContent('Forbidden.');
  });

  it('disables the test button for a harness without a test command', async () => {
    renderPanel(createFakeClient());

    fireEvent.change(await screen.findByLabelText('Harness'), { target: { value: 'codex' } });

    expect(screen.getByRole('button', { name: 'Test' })).toBeDisabled();
    expect(screen.getByText('This harness does not define a test command.')).toBeInTheDocument();
  });

  it("tests the selected harness and shows the test's result", async () => {
    const testHarness = vi.fn(() =>
      Promise.resolve({ ok: false, durationMs: 12, exit: 'exit code 1', output: 'not signed in' }),
    );
    renderPanel(createFakeClient({ testHarness }));

    fireEvent.click(await screen.findByRole('button', { name: 'Test' }));

    expect(await screen.findByText('Test failed: exit code 1, in 12 ms.')).toBeInTheDocument();
    expect(screen.getByText('not signed in')).toBeInTheDocument();
    expect(testHarness).toHaveBeenCalledWith('claude-code');
  });

  it('disables the picker and keeps the test button focusable while a test runs', async () => {
    const pendingTest = Promise.withResolvers<HarnessTestResult>();
    const client = createFakeClient({ testHarness: () => pendingTest.promise });
    renderPanel(client);

    const testButton = await screen.findByRole('button', { name: 'Test' });
    testButton.focus();
    fireEvent.click(testButton);

    expect(screen.getByLabelText('Harness')).toBeDisabled();
    expect(testButton).toHaveFocus();
    expect(testButton).toHaveAttribute('aria-disabled', 'true');
    pendingTest.resolve({ ok: true, durationMs: 5, exit: 'exit code 0', output: '' });
    await screen.findByText('Test passed: exit code 0, in 5 ms.');
    expect(screen.getByLabelText('Harness')).toBeEnabled();
  });

  it('clears the test result when the selection changes', async () => {
    const client = createFakeClient({
      testHarness: () => Promise.resolve({ ok: true, durationMs: 5, exit: 'exit code 0', output: '' }),
    });
    renderPanel(client);

    fireEvent.click(await screen.findByRole('button', { name: 'Test' }));
    await screen.findByText('Test passed: exit code 0, in 5 ms.');
    fireEvent.change(screen.getByLabelText('Harness'), { target: { value: 'codex' } });

    expect(screen.queryByText(/Test passed/)).not.toBeInTheDocument();
  });

  it('shows why a test request failed', async () => {
    const client = createFakeClient({
      testHarness: () => Promise.reject(new TelefactorRequestError(404, 'Harness "claude-code" not found.')),
    });
    renderPanel(client);

    fireEvent.click(await screen.findByRole('button', { name: 'Test' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Harness "claude-code" not found.');
  });
});

// region | Helpers
function renderPanel(
  client: ReturnType<typeof createFakeClient>,
  onHarnessChange: (harness: string | undefined) => void = () => {},
): void {
  function Harness(): ReactElement {
    const [harness, setHarness] = useState<string>();
    // Keep the callback's identity stable, as `HarnessPanel` requires.
    const [report] = useState(() => (next: string | undefined) => {
      onHarnessChange(next);
      setHarness(next);
    });
    return <HarnessPanel client={client} harness={harness} onHarnessChange={report} />;
  }
  render(<Harness />);
}
// endregion | Helpers
