// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { type ReactElement, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { TelefactorClient } from '#src/client/create-telefactor-client.ts';
import { TelefactorRequestError } from '#src/client/telefactor-request-error.ts';
import type { HarnessEntry, HarnessTestResult } from '#src/http/route-schemas.ts';

import { HarnessPicker } from '../HarnessPicker.tsx';
import { createFakeTelefactorClient, HARNESS_LIST } from '../test-utils/create-fake-telefactor-client.ts';

afterEach(cleanup);

describe(HarnessPicker, () => {
  it('preselects the default harness and reports it', async () => {
    const onHarnessChange = vi.fn();
    renderPicker(createFakeTelefactorClient(), onHarnessChange);

    expect(await screen.findByLabelText('Harness')).toHaveProperty('value', 'claude-code');
    expect(onHarnessChange).toHaveBeenCalledWith(HARNESS_LIST.harnesses[0]);
    expect(screen.getByRole('option', { name: 'Codex' })).toBeDefined();
  });

  it('reports the entry of the harness that the user selects', async () => {
    const onHarnessChange = vi.fn();
    renderPicker(createFakeTelefactorClient(), onHarnessChange);

    fireEvent.change(await screen.findByLabelText('Harness'), { target: { value: 'codex' } });

    expect(onHarnessChange).toHaveBeenLastCalledWith(HARNESS_LIST.harnesses[1]);
  });

  it('loads the list once when the callback changes identity', async () => {
    const listHarnesses = vi.fn(() => Promise.resolve(HARNESS_LIST));
    const client = createFakeTelefactorClient({ listHarnesses });
    const { rerender } = render(<HarnessPicker client={client} harness={undefined} onHarnessChange={() => {}} />);
    await screen.findByLabelText('Harness');

    rerender(<HarnessPicker client={client} harness="claude-code" onHarnessChange={() => {}} />);

    expect(listHarnesses).toHaveBeenCalledTimes(1);
  });

  it("shows the config file's problems and reports that no harness can run", async () => {
    const onHarnessChange = vi.fn();
    const client = createFakeTelefactorClient({
      listHarnesses: () =>
        Promise.resolve({
          source: 'file',
          configPath: '/app/telefactor.config.json',
          problems: [{ path: 'default', message: 'Name a harness that `harnesses` defines.' }],
        }),
    });
    renderPicker(client, onHarnessChange);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('/app/telefactor.config.json');
    expect(alert.textContent).toContain('default: Name a harness that `harnesses` defines.');
    expect(onHarnessChange).toHaveBeenCalledWith(undefined);
    expect(screen.queryByLabelText('Harness')).toBeNull();
  });

  it('shows why the list could not be loaded', async () => {
    const client = createFakeTelefactorClient({
      listHarnesses: () => Promise.reject(new TelefactorRequestError(403, 'Forbidden.')),
    });
    renderPicker(client);

    expect((await screen.findByRole('alert')).textContent).toContain('Forbidden.');
  });

  it('disables the test button for a harness without a test command', async () => {
    renderPicker(createFakeTelefactorClient());

    fireEvent.change(await screen.findByLabelText('Harness'), { target: { value: 'codex' } });

    expect(screen.getByRole('button', { name: 'Test' })).toHaveProperty('disabled', true);
    expect(screen.getByText('This harness does not define a test command.')).toBeDefined();
  });

  it("tests the selected harness and shows the test's result", async () => {
    const testHarness = vi.fn(() =>
      Promise.resolve({ ok: false, durationMs: 12, exit: 'exit code 1', output: 'not signed in' }),
    );
    renderPicker(createFakeTelefactorClient({ testHarness }));

    fireEvent.click(await screen.findByRole('button', { name: 'Test' }));

    expect(await screen.findByText('Test failed: exit code 1, in 12 ms.')).toBeDefined();
    expect(screen.getByText('not signed in')).toBeDefined();
    expect(testHarness).toHaveBeenCalledWith('claude-code');
  });

  it('disables the picker and keeps the test button focusable while a test runs', async () => {
    const pendingTest = Promise.withResolvers<HarnessTestResult>();
    const client = createFakeTelefactorClient({ testHarness: () => pendingTest.promise });
    renderPicker(client);

    const testButton = await screen.findByRole('button', { name: 'Test' });
    testButton.focus();
    fireEvent.click(testButton);

    expect(screen.getByLabelText('Harness')).toHaveProperty('disabled', true);
    expect(document.activeElement).toBe(testButton);
    expect(testButton.getAttribute('aria-disabled')).toBe('true');
    pendingTest.resolve({ ok: true, durationMs: 5, exit: 'exit code 0', output: '' });
    await screen.findByText('Test passed: exit code 0, in 5 ms.');
    expect(screen.getByLabelText('Harness')).toHaveProperty('disabled', false);
  });

  it('clears the test result when the selection changes', async () => {
    const client = createFakeTelefactorClient({
      testHarness: () => Promise.resolve({ ok: true, durationMs: 5, exit: 'exit code 0', output: '' }),
    });
    renderPicker(client);

    fireEvent.click(await screen.findByRole('button', { name: 'Test' }));
    await screen.findByText('Test passed: exit code 0, in 5 ms.');
    fireEvent.change(screen.getByLabelText('Harness'), { target: { value: 'codex' } });

    expect(screen.queryByText(/Test passed/)).toBeNull();
  });

  it('shows why a test request failed', async () => {
    const client = createFakeTelefactorClient({
      testHarness: () => Promise.reject(new TelefactorRequestError(404, 'Harness "claude-code" not found.')),
    });
    renderPicker(client);

    fireEvent.click(await screen.findByRole('button', { name: 'Test' }));

    expect((await screen.findByRole('alert')).textContent).toContain('Harness "claude-code" not found.');
  });
});

// region | Helpers
function renderPicker(
  client: TelefactorClient,
  onHarnessChange: (harness: HarnessEntry | undefined) => void = () => {},
): void {
  function Harness(): ReactElement {
    const [harness, setHarness] = useState<HarnessEntry>();
    return (
      <HarnessPicker
        client={client}
        harness={harness?.name}
        onHarnessChange={(next) => {
          onHarnessChange(next);
          setHarness(next);
        }}
      />
    );
  }
  render(<Harness />);
}
// endregion | Helpers
