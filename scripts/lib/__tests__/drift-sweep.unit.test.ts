import { describe, expect, it } from 'vitest';

import {
  combineKitRuns,
  formatSweepTable,
  parseFleetManifest,
  type RepoSummary,
  summarizeRdyReport,
} from '../drift-sweep.ts';

const MANIFEST = JSON.stringify({
  ignore: ['courses.meta.react'],
  repos: [
    { name: 'codeassembly', path: '~/repos/projects/codeassembly' },
    { name: 'workbench', path: null },
  ],
});

// Shaped as `thor-repo list --stack nmr --json` emits it: every entry carries `repo`, `tags`, and
// `stack` alongside the two keys the sweep reads, and the payload has no `ignore` key at all.
const REGISTRY_PAYLOAD = JSON.stringify({
  repos: [
    {
      name: 'toolbelt',
      path: '~/repos/packages/toolbelt',
      repo: 'williamthorsen/toolbelt',
      tags: ['live'],
      stack: ['nmr'],
    },
  ],
});

// Shaped as `rdy run --json` emits it: the tallies sit under `counts`, and the top-level `warnings` key
// carries warnings about the run itself.
const RDY_REPORT = JSON.stringify({
  counts: { errors: 1, passed: 1, warnings: 1 },
  kits: [
    {
      checklists: [
        {
          checks: [
            { name: 'passing check', status: 'passed' },
            {
              checks: [{ name: 'nested failing check', status: 'failed' }],
              name: 'failing check',
              status: 'failed',
            },
            { name: 'skipped check', status: 'skipped' },
          ],
          name: 'example',
        },
      ],
      name: 'default',
    },
  ],
  schemaVersion: 1,
  warnings: [{ code: 'version-skew', message: 'kit "default" was compiled against readyup 0.22.0' }],
});

describe(combineKitRuns, () => {
  const CLEAN_REPORT = JSON.stringify({ counts: { errors: 0, warnings: 0 }, kits: [] });

  it('reports a repo as aligned when every kit is clean', () => {
    expect(
      combineKitRuns([
        { kit: 'template', stdout: CLEAN_REPORT },
        { kit: 'williamthorsen/.github', stdout: CLEAN_REPORT },
      ]),
    ).toEqual({ errors: 0, failingChecks: [], status: 'checked', warnings: 0 });
  });

  it('sums failures across kits', () => {
    expect(
      combineKitRuns([
        { kit: 'template', stdout: RDY_REPORT },
        { kit: 'williamthorsen/.github', stdout: RDY_REPORT },
      ]),
    ).toEqual({
      errors: 2,
      failingChecks: ['failing check', 'nested failing check', 'failing check', 'nested failing check'],
      status: 'checked',
      warnings: 2,
    });
  });

  it('reports a kit that rdy could not load as an error, although its report carries zero counts', () => {
    const loadFailure = JSON.stringify({
      counts: { errors: 0, warnings: 0 },
      kits: [{ error: { code: 'kit-load', message: 'fetch failed' }, name: 'default' }],
    });
    expect(
      combineKitRuns([
        { kit: 'template', stdout: CLEAN_REPORT },
        { kit: 'williamthorsen/.github', stdout: loadFailure },
      ]),
    ).toMatchObject({ detail: 'williamthorsen/.github: fetch failed', status: 'error' });
  });

  it('reports the repo as an error naming the kit that failed to run, so a partial count never reads as aligned', () => {
    expect(
      combineKitRuns([
        { kit: 'template', stdout: RDY_REPORT },
        { failure: 'could not fetch kit', kit: 'williamthorsen/.github' },
      ]),
    ).toEqual({
      detail: 'williamthorsen/.github: could not fetch kit',
      errors: 0,
      failingChecks: [],
      status: 'error',
      warnings: 0,
    });
  });
});

describe(formatSweepTable, () => {
  const summaries: RepoSummary[] = [
    { errors: 0, failingChecks: [], name: 'codeassembly', status: 'checked', warnings: 0 },
    { errors: 1, failingChecks: ['typescript 6.0.3+ is installed'], name: 'toolbelt', status: 'checked', warnings: 2 },
    { errors: 0, failingChecks: [], name: 'workbench', status: 'no-path', warnings: 0 },
    { detail: '/gone', errors: 0, failingChecks: [], name: 'eso-tools', status: 'missing', warnings: 0 },
  ];

  it('renders one row per repo with counts, failing checks, and skip reasons', () => {
    const table = formatSweepTable(summaries);
    const lines = table.split('\n');
    expect(lines).toHaveLength(5);
    expect(lines[1]).toContain('aligned');
    expect(lines[2]).toContain('typescript 6.0.3+ is installed');
    expect(lines[3]).toContain('no local path configured');
    expect(lines[4]).toContain('path not found: /gone');
  });
});
describe(parseFleetManifest, () => {
  it('parses repos and the ignore list', () => {
    const manifest = parseFleetManifest(MANIFEST);
    expect(manifest.repos).toEqual([
      { name: 'codeassembly', path: '~/repos/projects/codeassembly' },
      { name: 'workbench', path: null },
    ]);
    expect(manifest.ignore).toEqual(['courses.meta.react']);
  });

  it('treats a missing or non-string path as null, so the repo is reported rather than swept', () => {
    const manifest = parseFleetManifest(JSON.stringify({ repos: [{ name: 'cli-news' }] }));
    expect(manifest.repos).toEqual([{ name: 'cli-news', path: null }]);
    expect(manifest.ignore).toEqual([]);
  });

  it('drops non-string entries from the ignore list, keeping the rest', () => {
    const manifest = parseFleetManifest(JSON.stringify({ ignore: ['courses.meta.react', 5, null], repos: [] }));
    expect(manifest.ignore).toEqual(['courses.meta.react']);
  });

  it("accepts the repo registry's own payload, whose entries carry extra keys and whose ignore key is absent", () => {
    const manifest = parseFleetManifest(REGISTRY_PAYLOAD);
    expect(manifest.repos).toEqual([{ name: 'toolbelt', path: '~/repos/packages/toolbelt' }]);
    expect(manifest.ignore).toEqual([]);
  });

  it('throws a descriptive error on invalid JSON', () => {
    expect(() => parseFleetManifest('not json')).toThrow(/not valid JSON/);
  });

  it('throws when the repos array is missing or an entry has no name', () => {
    expect(() => parseFleetManifest('{}')).toThrow(/"repos" array/);
    expect(() => parseFleetManifest(JSON.stringify({ repos: [{ path: '~/x' }] }))).toThrow(/repos\[0]/);
  });
});

describe(summarizeRdyReport, () => {
  it('reads failure counts and collects failed check names, nested checks included', () => {
    expect(summarizeRdyReport(RDY_REPORT)).toEqual({
      errors: 1,
      failingChecks: ['failing check', 'nested failing check'],
      warnings: 1,
    });
  });

  it('reads zero counts from a report carrying none, rather than from the run-warnings array', () => {
    expect(summarizeRdyReport(JSON.stringify({ warnings: [{ code: 'version-skew' }] }))).toEqual({
      errors: 0,
      failingChecks: [],
      warnings: 0,
    });
  });

  it('flags unparseable output instead of throwing, so one bad repo does not sink the sweep', () => {
    expect(summarizeRdyReport('not json').failingChecks).toEqual(['(unparseable rdy output)']);
  });
});
