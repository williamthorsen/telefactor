import { fireEvent, render, screen } from '@testing-library/react';
import { type Job, type TelefactorClient, TelefactorRequestError } from '@williamthorsen/telefactor/client';
import { describe, expect, it, vi } from 'vitest';

import { buildJob, createFakeClient } from '#src/test-utils/create-fake-client.ts';

import { JobPanel } from '../JobPanel.tsx';

describe(JobPanel, () => {
  it('starts without a job', () => {
    renderPanel(createFakeClient());

    expect(screen.getByRole('status')).toHaveTextContent('No job yet.');
  });

  it('disables Run while the prompt is blank or no harness is chosen', () => {
    const { rerender } = render(<JobPanel client={createFakeClient()} harness={undefined} pollIntervalMs={0} />);
    typePrompt('Summarize README.md');
    expect(screen.getByRole('button', { name: 'Run' })).toBeDisabled();

    rerender(<JobPanel client={createFakeClient()} harness="claude-code" pollIntervalMs={0} />);
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

    run('Summarize README.md');

    expect(await screen.findByText('Running on claude-code…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run' })).toHaveAttribute('aria-disabled', 'true');
    expect(await screen.findByText('The README describes telefactor.')).toBeInTheDocument();
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

    run('Summarize README.md');

    expect(await screen.findByText('exit code 1: not signed in')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Failed on claude-code.');
  });

  it('cancels a running job, shows the cancelled job, and stops polling', async () => {
    const getJob = vi.fn<TelefactorClient['getJob']>(() => Promise.resolve(buildJob()));
    const cancelJob = vi.fn(() => Promise.resolve(buildJob({ status: 'cancelled' })));
    renderPanel(createFakeClient({ cancelJob, getJob, startJob: () => Promise.resolve(buildJob()) }), 20);

    run('Summarize README.md');
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

    expect(await screen.findByText('Cancelled on claude-code.')).toBeInTheDocument();
    expect(cancelJob).toHaveBeenCalledWith('job-1');
    const pollsAtCancel = getJob.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(getJob).toHaveBeenCalledTimes(pollsAtCancel);
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
  });

  it('keeps Run focusable and ignores a second press while the job starts', async () => {
    const pendingStart = Promise.withResolvers<Job>();
    const startJob = vi.fn(() => pendingStart.promise);
    renderPanel(createFakeClient({ getJob: () => Promise.resolve(buildJob()), startJob }), 20);

    typePrompt('Summarize README.md');
    const runButton = screen.getByRole('button', { name: 'Run' });
    runButton.focus();
    fireEvent.click(runButton);
    fireEvent.click(runButton);

    expect(runButton).toHaveFocus();
    expect(runButton).toHaveAttribute('aria-disabled', 'true');
    expect(startJob).toHaveBeenCalledTimes(1);
    pendingStart.resolve(buildJob());
    expect(await screen.findByText('Running on claude-code…')).toBeInTheDocument();
  });

  it('moves focus from Cancel to Run once the cancel resolves', async () => {
    const client = createFakeClient({
      cancelJob: () => Promise.resolve(buildJob({ status: 'cancelled' })),
      getJob: () => Promise.resolve(buildJob()),
      startJob: () => Promise.resolve(buildJob()),
    });
    renderPanel(client, 20);

    run('Summarize README.md');
    const cancel = await screen.findByRole('button', { name: 'Cancel' });
    cancel.focus();
    fireEvent.click(cancel);

    await screen.findByText('Cancelled on claude-code.');
    expect(screen.getByRole('button', { name: 'Run' })).toHaveFocus();
  });

  it('moves focus from Cancel to Run when the job finishes on its own', async () => {
    const getJob = vi
      .fn<TelefactorClient['getJob']>()
      .mockResolvedValueOnce(buildJob())
      .mockResolvedValueOnce(buildJob({ status: 'done', result: { output: 'Finished.' } }));
    renderPanel(createFakeClient({ getJob, startJob: () => Promise.resolve(buildJob()) }), 20);

    run('Summarize README.md');
    (await screen.findByRole('button', { name: 'Cancel' })).focus();

    await screen.findByText('Finished.');
    expect(screen.getByRole('button', { name: 'Run' })).toHaveFocus();
  });

  it('leaves focus alone when Cancel did not have it', async () => {
    const getJob = vi
      .fn<TelefactorClient['getJob']>()
      .mockResolvedValueOnce(buildJob())
      .mockResolvedValueOnce(buildJob({ status: 'done', result: { output: 'Finished.' } }));
    renderPanel(createFakeClient({ getJob, startJob: () => Promise.resolve(buildJob()) }), 20);

    run('Summarize README.md');
    await screen.findByRole('button', { name: 'Cancel' });
    screen.getByLabelText('Prompt').focus();

    await screen.findByText('Finished.');
    expect(screen.getByLabelText('Prompt')).toHaveFocus();
  });

  it('stops polling and shows the error when a poll fails', async () => {
    const getJob = vi.fn<TelefactorClient['getJob']>(() =>
      Promise.reject(new TelefactorRequestError(404, 'Job "job-1" not found.')),
    );
    renderPanel(createFakeClient({ getJob, startJob: () => Promise.resolve(buildJob()) }));

    run('Summarize README.md');

    expect(await screen.findByRole('alert')).toHaveTextContent('Job "job-1" not found.');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(getJob).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Run' })).toHaveAttribute('aria-disabled', 'false');
  });

  it("shows a rejected start's problems", async () => {
    const client = createFakeClient({
      startJob: () =>
        Promise.reject(
          new TelefactorRequestError(400, 'Enter a prompt', [{ path: 'prompt', message: 'Enter a prompt' }]),
        ),
    });
    renderPanel(client);

    run('Summarize README.md');

    expect(await screen.findByRole('alert')).toHaveTextContent('prompt: Enter a prompt');
  });
});

// region | Helpers
function renderPanel(client: TelefactorClient, pollIntervalMs = 0): void {
  render(<JobPanel client={client} harness="claude-code" pollIntervalMs={pollIntervalMs} />);
}

function run(prompt: string): void {
  typePrompt(prompt);
  fireEvent.click(screen.getByRole('button', { name: 'Run' }));
}

function typePrompt(prompt: string): void {
  fireEvent.change(screen.getByLabelText('Prompt'), { target: { value: prompt } });
}
// endregion | Helpers
