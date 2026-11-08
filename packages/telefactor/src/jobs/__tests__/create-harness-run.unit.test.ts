import { describe, expect, it } from 'vitest';

import { describeRunFailure, MAX_OUTPUT_BYTES } from '../create-harness-run.ts';

const SUCCESS = { code: 0, signal: null, stdout: '', stderrTail: '', exceeded: false };

describe(describeRunFailure, () => {
  it('returns undefined for a run that exits with code 0', () => {
    expect(describeRunFailure('codex', { ...SUCCESS, stdout: 'ok' }, MAX_OUTPUT_BYTES)).toBeUndefined();
  });

  it('describes a non-zero exit with the stderr tail', () => {
    expect(describeRunFailure('codex', { ...SUCCESS, code: 2, stderrTail: 'not signed in' }, MAX_OUTPUT_BYTES)).toBe(
      'The harness codex exited with code 2.\nnot signed in',
    );
  });

  it('describes a non-zero exit with a failure reported only on stdout', () => {
    const run = { ...SUCCESS, code: 1, stdout: 'Invalid API key · Please run /login\n' };

    expect(describeRunFailure('claude-code', run, MAX_OUTPUT_BYTES)).toBe(
      'The harness claude-code exited with code 1.\nInvalid API key · Please run /login',
    );
  });

  it('quotes stdout before the stderr tail', () => {
    const run = { ...SUCCESS, code: 1, stdout: 'out', stderrTail: 'err' };

    expect(describeRunFailure('codex', run, MAX_OUTPUT_BYTES)).toBe('The harness codex exited with code 1.\nout\nerr');
  });

  it('describes a run that exceeded the output cap', () => {
    const run = { ...SUCCESS, code: null, signal: 'SIGTERM' as const, exceeded: true };

    expect(describeRunFailure('codex', run, MAX_OUTPUT_BYTES)).toBe(
      'The harness codex wrote more than 1 MiB of output and was stopped.',
    );
  });

  it('quotes the end of stdout for a run that exceeded the output cap', () => {
    const run = { ...SUCCESS, code: null, signal: 'SIGTERM' as const, stdout: 'first\nlast', exceeded: true };

    expect(describeRunFailure('codex', run, MAX_OUTPUT_BYTES)).toBe(
      'The harness codex wrote more than 1 MiB of output and was stopped.\nfirst\nlast',
    );
  });
});
