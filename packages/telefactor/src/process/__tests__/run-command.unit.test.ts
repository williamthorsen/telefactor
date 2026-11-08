import { describe, expect, it } from 'vitest';

import { quoteOutput } from '../run-command.ts';

describe(quoteOutput, () => {
  it('quotes stdout alone', () => {
    expect(quoteOutput({ stdout: 'Not logged in\n', stderrTail: '' })).toBe('Not logged in');
  });

  it('quotes the stderr tail alone', () => {
    expect(quoteOutput({ stdout: '  \n', stderrTail: 'not signed in' })).toBe('not signed in');
  });

  it('quotes stdout before the stderr tail', () => {
    expect(quoteOutput({ stdout: 'out\n', stderrTail: 'err' })).toBe('out\nerr');
  });

  it('returns an empty quote for a run without output', () => {
    expect(quoteOutput({ stdout: '', stderrTail: '' })).toBe('');
  });

  it('keeps the last 20 lines', () => {
    const stdout = Array.from({ length: 30 }, (_, index) => `line ${index}`).join('\n');

    expect(quoteOutput({ stdout, stderrTail: 'err' }).split('\n')).toStrictEqual([
      ...Array.from({ length: 19 }, (_, index) => `line ${index + 11}`),
      'err',
    ]);
  });

  it('keeps the end of a line longer than 4096 characters', () => {
    const quote = quoteOutput({ stdout: `${'a'.repeat(10_000)}end`, stderrTail: '' });

    expect(quote).toHaveLength(4096);
    expect(quote.endsWith('aend')).toBe(true);
  });
});
