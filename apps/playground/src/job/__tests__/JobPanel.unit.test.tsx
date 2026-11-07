import { act, fireEvent, render, screen } from '@testing-library/react';
import { type Job, type TelefactorClient, TelefactorRequestError } from '@williamthorsen/telefactor/client';
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import { buildJob, createFakeClient } from '#src/test-utils/create-fake-client.ts';

import { JobPanel } from '../JobPanel.tsx';

const POLL_INTERVAL_MS = 100;

describe(JobPanel, () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts without a job', () => {
    renderPanel(createFakeClient());

    expect(screen.getByRole('status')).toHaveTextContent('No job yet.');
  });

  it('disables Run while the prompt is blank or no harness is chosen', () => {
    const { rerender } = render(
      <JobPanel client={createFakeClient()} harness={undefined} pollIntervalMs={POLL_INTERVAL_MS} />,
    );
    typePrompt('Summarize README.md');
    expect(screen.getByRole('button', { name: 'Run' })).toBeDisabled();

    rerender(<JobPanel client={createFakeClient()} harness="claude-code" pollIntervalMs={POLL_INTERVAL_MS} />);
    expect(screen.getByRole('button', { name: 'Run' })).toBeEnabled();

    typePrompt(' '.repeat(3));
    expect(screen.getByRole('button', { name: 'Run' })).toBeDisabled();
  });

  it('starts a job on the chosen harness and polls it until it is done', async () => {
    const startJob = vi.fn(() => Promise.resolve(buildJob()));
    const getJob = vi
      .fn<TelefactorClient['getJob']>()
      .mockResolvedValueOnce(buildJob())
      .mockResolvedValueOnce(buildJob({ status: 'done', result: { output: 'The README describes telefactor.' } }));
    renderPanel(createFakeClient({ getJob, startJob }));

    await start('Summarize README.md');

    expect(screen.getByText('Running on claude-code…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run' })).toHaveAttribute('aria-disabled', 'true');
    await advance(POLL_INTERVAL_MS);
    await advance(POLL_INTERVAL_MS);
    expect(screen.getByText('The README describes telefactor.')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Done on claude-code.');
    expect(startJob).toHaveBeenCalledWith({ prompt: 'Summarize README.md', harness: 'claude-code' });
    expect(getJob).toHaveBeenCalledTimes(2);
  });

  it("shows a failed job's error", async () => {
    const client = createFakeClient({
      startJob: () => Promise.resolve(buildJob()),
      getJob: () => Promise.resolve(buildJob({ status: 'failed', error: 'exit code 1: not signed in' })),
    });
    renderPanel(client);

    await start('Summarize README.md');
    await advance(POLL_INTERVAL_MS);

    expect(screen.getByText('exit code 1: not signed in')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Failed on claude-code.');
  });

  it('cancels a running job, shows the cancelled job, and stops polling', async () => {
    const getJob = vi.fn<TelefactorClient['getJob']>(() => Promise.resolve(buildJob()));
    const cancelJob = vi.fn(() => Promise.resolve(buildJob({ status: 'cancelled' })));
    renderPanel(createFakeClient({ cancelJob, getJob, startJob: () => Promise.resolve(buildJob()) }));

    await start('Summarize README.md');
    await advance(POLL_INTERVAL_MS);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await advance(0);

    expect(screen.getByText('Cancelled on claude-code.')).toBeInTheDocument();
    expect(cancelJob).toHaveBeenCalledWith('job-1');
    const pollsAtCancel = getJob.mock.calls.length;
    await advance(POLL_INTERVAL_MS * 3);
    expect(getJob).toHaveBeenCalledTimes(pollsAtCancel);
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
  });

  it('keeps Run focusable and ignores a second press while the job starts', async () => {
    const pendingStart = Promise.withResolvers<Job>();
    const startJob = vi.fn(() => pendingStart.promise);
    renderPanel(createFakeClient({ getJob: () => Promise.resolve(buildJob()), startJob }));

    typePrompt('Summarize README.md');
    const runButton = screen.getByRole('button', { name: 'Run' });
    runButton.focus();
    fireEvent.click(runButton);
    fireEvent.click(runButton);

    expect(runButton).toHaveFocus();
    expect(runButton).toHaveAttribute('aria-disabled', 'true');
    expect(startJob).toHaveBeenCalledTimes(1);
    pendingStart.resolve(buildJob());
    await advance(0);
    expect(screen.getByText('Running on claude-code…')).toBeInTheDocument();
  });

  it('moves focus from Cancel to Run once the cancel resolves', async () => {
    const client = createFakeClient({
      cancelJob: () => Promise.resolve(buildJob({ status: 'cancelled' })),
      getJob: () => Promise.resolve(buildJob()),
      startJob: () => Promise.resolve(buildJob()),
    });
    renderPanel(client);

    await start('Summarize README.md');
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    cancel.focus();
    fireEvent.click(cancel);
    await advance(0);

    expect(screen.getByText('Cancelled on claude-code.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run' })).toHaveFocus();
  });

  it('moves focus from Cancel to Run when the job finishes on its own', async () => {
    const getJob = vi.fn<TelefactorClient['getJob']>(() =>
      Promise.resolve(buildJob({ status: 'done', result: { output: 'Finished.' } })),
    );
    renderPanel(createFakeClient({ getJob, startJob: () => Promise.resolve(buildJob()) }));

    await start('Summarize README.md');
    screen.getByRole('button', { name: 'Cancel' }).focus();
    await advance(POLL_INTERVAL_MS);

    expect(screen.getByText('Finished.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run' })).toHaveFocus();
  });

  it('leaves focus alone when Cancel did not have it', async () => {
    const getJob = vi.fn<TelefactorClient['getJob']>(() =>
      Promise.resolve(buildJob({ status: 'done', result: { output: 'Finished.' } })),
    );
    renderPanel(createFakeClient({ getJob, startJob: () => Promise.resolve(buildJob()) }));

    await start('Summarize README.md');
    screen.getByLabelText('Prompt').focus();
    await advance(POLL_INTERVAL_MS);

    expect(screen.getByText('Finished.')).toBeInTheDocument();
    expect(screen.getByLabelText('Prompt')).toHaveFocus();
  });

  it('stops polling and shows the error when a poll fails', async () => {
    const getJob = vi.fn<TelefactorClient['getJob']>(() =>
      Promise.reject(new TelefactorRequestError(404, 'Job "job-1" not found.')),
    );
    renderPanel(createFakeClient({ getJob, startJob: () => Promise.resolve(buildJob()) }));

    await start('Summarize README.md');
    await advance(POLL_INTERVAL_MS);

    expect(screen.getByRole('alert')).toHaveTextContent('Job "job-1" not found.');
    await advance(POLL_INTERVAL_MS * 3);
    expect(getJob).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Run' })).toHaveAttribute('aria-disabled', 'false');
  });

  describe('when a poll settles after the cancel resolves, before React commits the cancelled job', () => {
    it('keeps the cancelled job and stops polling when the poll reports the job running', async () => {
      const getJob = await startWithHeldPoll((inFlight) => inFlight.resolve(buildJob()));

      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      await advance(POLL_INTERVAL_MS * 3);

      expect(screen.getByRole('status')).toHaveTextContent('Cancelled on claude-code.');
      expect(getJob).toHaveBeenCalledTimes(1);
    });

    it('keeps the cancelled job and shows no error when the poll fails', async () => {
      const getJob = await startWithHeldPoll((inFlight) =>
        inFlight.reject(new TelefactorRequestError(500, 'Server error.')),
      );

      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      await advance(POLL_INTERVAL_MS * 3);

      expect(screen.getByRole('status')).toHaveTextContent('Cancelled on claude-code.');
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(getJob).toHaveBeenCalledTimes(1);
    });
  });

  it("shows a rejected start's problems", async () => {
    const client = createFakeClient({
      startJob: () =>
        Promise.reject(
          new TelefactorRequestError(400, 'Enter a prompt', [{ path: 'prompt', message: 'Enter a prompt' }]),
        ),
    });
    renderPanel(client);

    await start('Summarize README.md');

    expect(screen.getByRole('alert')).toHaveTextContent('prompt: Enter a prompt');
  });
});

// region | Helpers
/** Advances fake time inside `act`, so that React commits and runs its effects before the test asserts. */
async function advance(ms: number): Promise<void> {
  await act(() => vi.advanceTimersByTimeAsync(ms));
}

function renderPanel(client: TelefactorClient): void {
  render(<JobPanel client={client} harness="claude-code" pollIntervalMs={POLL_INTERVAL_MS} />);
}

/** Types the prompt, presses Run, and lets the start settle, which arms the first poll when the job runs. */
async function start(prompt: string): Promise<void> {
  typePrompt(prompt);
  fireEvent.click(screen.getByRole('button', { name: 'Run' }));
  await advance(0);
}

/**
 * Starts a job whose first poll is held open until `settle` settles it, one microtask after `cancelJob` resolves:
 * before React can commit the cancelled job.
 */
async function startWithHeldPoll(
  settle: (inFlight: PromiseWithResolvers<Job>) => void,
): Promise<Mock<TelefactorClient['getJob']>> {
  const inFlight = Promise.withResolvers<Job>();
  const getJob = vi.fn<TelefactorClient['getJob']>(() => inFlight.promise);
  const cancelJob = vi.fn(() => {
    queueMicrotask(() => settle(inFlight));
    return Promise.resolve(buildJob({ status: 'cancelled' }));
  });
  renderPanel(createFakeClient({ cancelJob, getJob, startJob: () => Promise.resolve(buildJob()) }));
  await start('Summarize README.md');
  await advance(POLL_INTERVAL_MS);
  expect(getJob).toHaveBeenCalledTimes(1);
  return getJob;
}

function typePrompt(prompt: string): void {
  fireEvent.change(screen.getByLabelText('Prompt'), { target: { value: prompt } });
}
// endregion | Helpers
