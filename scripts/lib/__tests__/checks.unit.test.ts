import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { z } from 'zod';

import {
  DEFAULT_CHECKS,
  discoverCheckNames,
  extractCheckNames,
  extractHeadSha,
  joinRequiredState,
  parseRequestedChecks,
  resolveChecks,
} from '../checks.ts';

const AVAILABLE = ['audit / pr-audit', 'audit / scheduled-audit', 'code-quality / Code quality', 'e2e'];

describe('DEFAULT_CHECKS', () => {
  it('names one context per leg that the code-quality workflow declares', () => {
    expect(DEFAULT_CHECKS).toEqual(readWorkflowLegNames().map((name) => `code-quality / ${name}`));
  });
});

describe(discoverCheckNames, () => {
  it('collapses repeated check-runs to one entry per name', () => {
    const runs = [
      { name: 'audit / scheduled-audit' },
      { name: 'audit / scheduled-audit' },
      { name: 'audit / pr-audit' },
      { name: 'code-quality / Code quality' },
    ];

    expect(discoverCheckNames(runs)).toEqual([
      'audit / pr-audit',
      'audit / scheduled-audit',
      'code-quality / Code quality',
    ]);
  });

  it('returns an empty array when there are no runs', () => {
    expect(discoverCheckNames([])).toEqual([]);
  });

  it('orders mixed-case names by localeCompare, placing "apple" before "Zebra"', () => {
    expect(discoverCheckNames([{ name: 'Zebra' }, { name: 'apple' }])).toEqual(['apple', 'Zebra']);
  });
});

describe(extractCheckNames, () => {
  it('extracts and dedupes names from a check-runs response', () => {
    const payload = {
      check_runs: [{ name: 'audit / pr-audit' }, { name: 'audit / pr-audit' }, { name: 'e2e' }],
    };

    expect(extractCheckNames(payload)).toEqual(['audit / pr-audit', 'e2e']);
  });

  it('ignores entries without a string name', () => {
    const payload = { check_runs: [{ name: 'e2e' }, {}, { name: 5 }] };

    expect(extractCheckNames(payload)).toEqual(['e2e']);
  });

  it.each([{ payload: {} }, { payload: null }, { payload: { check_runs: 'nope' } }])(
    'returns an empty array for a malformed response ($payload)',
    ({ payload }) => {
      expect(extractCheckNames(payload)).toEqual([]);
    },
  );
});

describe(extractHeadSha, () => {
  it('returns the head sha shared by the check-runs', () => {
    const payload = { check_runs: [{ name: 'e2e', head_sha: '3e61d26d74fc' }] };

    expect(extractHeadSha(payload)).toBe('3e61d26d74fc');
  });

  it('returns null when no check-run carries a head sha', () => {
    expect(extractHeadSha({ check_runs: [{ name: 'e2e' }] })).toBeNull();
    expect(extractHeadSha({})).toBeNull();
  });
});

describe(joinRequiredState, () => {
  it('marks a discovered check as required when it is in the required set', () => {
    expect(joinRequiredState(['code-quality / Code quality', 'e2e'], ['code-quality / Code quality'])).toEqual([
      { name: 'code-quality / Code quality', required: true },
      { name: 'e2e', required: false },
    ]);
  });

  it('includes required checks that are absent from the discovered set', () => {
    expect(joinRequiredState(['a'], ['b'])).toEqual([
      { name: 'a', required: false },
      { name: 'b', required: true },
    ]);
  });

  it('marks every discovered check not required when the required set is empty', () => {
    expect(joinRequiredState(['a', 'b'], [])).toEqual([
      { name: 'a', required: false },
      { name: 'b', required: false },
    ]);
  });
});

describe(parseRequestedChecks, () => {
  it('splits a comma list into trimmed tokens, dropping the empty token from a trailing comma', () => {
    expect(parseRequestedChecks('code-quality, e2e,', ['default'])).toEqual(['code-quality', 'e2e']);
  });

  it('returns the default checks when no value is given', () => {
    expect(parseRequestedChecks(undefined, DEFAULT_CHECKS)).toEqual(DEFAULT_CHECKS);
  });
});

describe(resolveChecks, () => {
  it.each([
    { token: 'code-quality', expected: 'code-quality / Code quality' },
    { token: 'CODE-QUALITY', expected: 'code-quality / Code quality' },
    { token: 'e2e', expected: 'e2e' },
    { token: 'code-quality / Code quality', expected: 'code-quality / Code quality' },
  ])('resolves "$token" to the unique matching context', ({ token, expected }) => {
    expect(resolveChecks([token], AVAILABLE)).toEqual({ ok: true, matched: [expected] });
  });

  it('resolves multiple tokens preserving request order', () => {
    expect(resolveChecks(['code-quality', 'e2e'], AVAILABLE)).toEqual({
      ok: true,
      matched: ['code-quality / Code quality', 'e2e'],
    });
  });

  it('prefers an exact match over a substring of longer names', () => {
    expect(resolveChecks(['e2e'], ['e2e', 'e2e-extended'])).toEqual({ ok: true, matched: ['e2e'] });
  });

  it('reports an ambiguous token with its candidate contexts', () => {
    expect(resolveChecks(['audit'], AVAILABLE)).toEqual({
      ok: false,
      reason: 'ambiguous',
      token: 'audit',
      candidates: ['audit / pr-audit', 'audit / scheduled-audit'],
    });
  });

  it('reports an unknown token with the available contexts', () => {
    expect(resolveChecks(['nope'], AVAILABLE)).toEqual({
      ok: false,
      reason: 'unknown',
      token: 'nope',
      candidates: AVAILABLE,
    });
  });

  it('returns the first failing token when later tokens are unresolvable', () => {
    expect(resolveChecks(['code-quality', 'audit'], AVAILABLE)).toEqual({
      ok: false,
      reason: 'ambiguous',
      token: 'audit',
      candidates: ['audit / pr-audit', 'audit / scheduled-audit'],
    });
  });
});

// region | Helpers

/** Reads the leg names from the `check-commands` input of `.github/workflows/code-quality.yaml`. */
function readWorkflowLegNames(): string[] {
  const workflowUrl = new URL('../../../.github/workflows/code-quality.yaml', import.meta.url);
  const workflow = z
    .object({ jobs: z.object({ 'code-quality': z.object({ with: z.object({ 'check-commands': z.string() }) }) }) })
    .parse(parse(readFileSync(workflowUrl, 'utf8')));
  const legs = z
    .array(z.object({ name: z.string() }))
    .parse(JSON.parse(workflow.jobs['code-quality'].with['check-commands']));
  return legs.map((leg) => leg.name);
}

// endregion | Helpers
