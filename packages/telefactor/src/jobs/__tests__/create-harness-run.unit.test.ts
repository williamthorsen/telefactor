import { describe, expect, it } from 'vitest';

import { describeRunFailure, MAX_OUTPUT_BYTES } from '../create-harness-run.ts';

const SUCCESS = { code: 0, signal: null, stdout: 'ok', stderrTail: '', exceeded: false };

describe(describeRunFailure, () => {
  it('returns undefined for a run that exits with code 0', () => {
    expect(describeRunFailure('codex', SUCCESS, MAX_OUTPUT_BYTES)).toBeUndefined();
  });

  it('describes a non-zero exit with the stderr tail', () => {
    expect(describeRunFailure('codex', { ...SUCCESS, code: 2, stderrTail: 'not signed in' }, MAX_OUTPUT_BYTES)).toBe(
      'The harness codex exited with code 2.\nnot signed in',
    );
  });

  it('describes a run that exceeded the output cap', () => {
    const run = { ...SUCCESS, code: null, signal: 'SIGTERM' as const, exceeded: true };

    expect(describeRunFailure('codex', run, MAX_OUTPUT_BYTES)).toBe(
      'The harness codex wrote more than 1 MiB of output and was stopped.',
    );
  });
});
